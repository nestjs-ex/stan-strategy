import { Injectable, Inject, Logger } from '@nestjs/common';
import { isObject, isString } from '@nestjs/common/utils/shared.utils';
import { ClientProxy, ReadPacket, WritePacket } from '@nestjs/microservices';
import { ERROR_EVENT, MESSAGE_EVENT } from '@nestjs/microservices/constants';
import { nanoid } from 'nanoid';
import * as stan from 'node-nats-streaming';
import { StanClientModuleOptions } from './interfaces/stan-client-module-options.interface';
import {
  STAN_CLIENT_MODULE_OPTIONS,
  STAN_DEFAULT_URL
} from './stan-client.constants';
import { StanRecordSerializer } from './stan-record.serializer';
import { StanResponseDeserializer } from './stan-response.deserializer';
import { StanRecord } from './stan.record-builder';

@Injectable()
export class StanClient extends ClientProxy {
  protected readonly logger = new Logger(StanClient.name);
  protected readonly subscriptionsCount = new Map<string, number>();
  protected readonly subscriptions = new Map<string, stan.Subscription>();
  protected stanClient: stan.Stan;

  constructor(
    @Inject(STAN_CLIENT_MODULE_OPTIONS)
    private readonly options: StanClientModuleOptions
  ) {
    super();

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  public async close() {
    this.stanClient?.close();
    this.stanClient = null;
  }

  public async connect(): Promise<any> {
    if (this.stanClient) {
      return this.stanClient;
    }

    this.stanClient = this.createClient();
    this.handleError(this.stanClient);

    return this.stanClient;
  }

  protected publish(
    partialPacket: ReadPacket,
    callback: (packet: WritePacket) => void,
  ): () => void {
    try {
      const packet = this.assignPacketId(partialPacket);
      // const subject = this.normalizePattern(partialPacket.pattern);
      const { subject, qGroup } = this.parsePattern(partialPacket.pattern);
      const serializedPacket: StanRecord = this.serializer.serialize(packet);
      const responseChannel = this.getReplyPattern(subject);
      let subscription = this.subscriptions.get(responseChannel);

      const publishPacket = () => {
        let subscriptionsCount =
          this.subscriptionsCount.get(responseChannel) || 0;
        this.subscriptionsCount.set(responseChannel, subscriptionsCount + 1);
        this.routingMap.set(packet.id, callback);
        this.stanClient.publish(subject, serializedPacket.data);
      };

      if (!subscription) {
        const subOpts = this.stanClient.subscriptionOptions();
        subOpts.setDurableName('durable-' + subject);

        const queueGroup = qGroup || this.options.group;
        const sub = queueGroup ? this.stanClient.subscribe(
          responseChannel,
          queueGroup,
          subOpts
        ) : this.stanClient.subscribe(responseChannel, subOpts);

        sub.on('ready', () => {
          // avoid "NATS: Subject must be supplied" error
          sub.on(MESSAGE_EVENT, this.createResponseCallback());

          this.subscriptions.set(responseChannel, sub);
          publishPacket();
        });
      } else {
        publishPacket();
      }

      return () => {
        this.unsubscribeFromChannel(responseChannel);
        this.routingMap.delete(packet.id);
      };
    } catch (err) {
      callback({ err });
    }
  }

  protected dispatchEvent(packet: ReadPacket): Promise<any> {
    // const pattern = this.normalizePattern(packet.pattern);
    const { subject } = this.parsePattern(packet.pattern);
    const serializedPacket: StanRecord = this.serializer.serialize(packet);

    return new Promise((resolve, reject) =>
      this.stanClient.publish(
        subject, serializedPacket.data,
        (err, guid) => (err ? reject(err) : resolve(guid as any))
      )
    );
  }

  public getReplyPattern(subject: string): string {
    return `${subject}.reply`;
  }

  public createResponseCallback(): (msg: stan.Message) => Promise<void> {
    return async (msg: stan.Message) => {
      const packet = JSON.parse(msg.getData() as string);
      const { err, response, isDisposed, id } = await this.deserializer.deserialize(packet);
      const callback = this.routingMap.get(id);

      if (!callback) {
        return undefined;
      }
      if (isDisposed || err) {
        return callback({
          err,
          response,
          isDisposed: true
        });
      }

      callback({
        err,
        response
      });
    };
  }

  public createClient(): stan.Stan {
    const options: StanClientModuleOptions = this.options || ({} as StanClientModuleOptions);
    return stan.connect(
      options.clusterId,
      `${options.clientId}-${nanoid(10)}`,
      {
        url: STAN_DEFAULT_URL,
        ...options,
      }
    );
  }

  public handleError(client: stan.Stan) {
    client.addListener(ERROR_EVENT, (err: any) => this.logger.error(err));
  }

  protected unsubscribeFromChannel(channel: string) {
    const subscriptionCount = this.subscriptionsCount.get(channel);
    this.subscriptionsCount.set(channel, subscriptionCount - 1);

    if (subscriptionCount - 1 <= 0) {
      this.subscriptions.get(channel).unsubscribe();
      this.subscriptions.delete(channel);
      this.subscriptionsCount.delete(channel);
    }
  }

  protected initializeSerializer(options: StanClientModuleOptions) {
    this.serializer = options?.serializer ?? new StanRecordSerializer();
  }

  protected initializeDeserializer(options: StanClientModuleOptions) {
    this.deserializer = options?.deserializer ?? new StanResponseDeserializer();
  }

  private parsePattern(pattern: any) {
    let subject: string;
    let qGroup: string;

    if (isString(pattern)) {
      subject = pattern;
    } else if (isObject(pattern)) {
      subject = pattern['subject'];
      qGroup = pattern['qGroup'];
    }

    return {
      subject,
      qGroup
    };
  }
}
