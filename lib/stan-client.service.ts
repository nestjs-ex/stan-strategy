import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy, ReadPacket, WritePacket } from '@nestjs/microservices';
import { ERROR_EVENT, MESSAGE_EVENT } from '@nestjs/microservices/constants';
import { share, tap } from 'rxjs/operators';
import * as stan from 'node-nats-streaming';
import { nanoid } from 'nanoid';

import {
  STAN_CLIENT_MODULE_OPTIONS,
  STAN_DEFAULT_URL
} from './stan-client.constants';
import { StanClientModuleOptions } from './interfaces';

@Injectable()
export class StanClient extends ClientProxy {
  protected readonly logger = new Logger(StanClient.name);
  protected readonly subscriptionsCount = new Map<string, number>();
  protected readonly subscriptions = new Map<string, stan.Subscription>();
  protected readonly url: string;
  protected stanClient: stan.Stan;
  protected connection: Promise<any>;

  constructor(
    @Inject(STAN_CLIENT_MODULE_OPTIONS)
    private readonly options: StanClientModuleOptions
  ) {
    super();
    this.url = this.getOptionsProp(this.options, 'url') || STAN_DEFAULT_URL;

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  // implement method
  async connect(): Promise<any> {
    if (this.stanClient) {
      return this.connection;
    }
    this.stanClient = this.createClient();
    this.handleError(this.stanClient);

    this.connection = await this.connect$(this.stanClient)
      .pipe(share())
      .toPromise();

    return this.connection;
  }
  close() {
    this.stanClient && this.stanClient.close();
    this.stanClient = null;
    this.connection = null;
  }
  protected publish(
    partialPacket: ReadPacket<any>,
    callback: (packet: WritePacket<any>) => void
  ): Function {
    try {
      const packet = this.assignPacketId(partialPacket);
      const channel = this.normalizePattern(partialPacket.pattern);
      const serializedPacket = this.serializer.serialize(packet);
      const responseChannel = this.getReplyPattern(channel);
      let subscription = this.subscriptions.get(responseChannel);

      const publishPacket = () => {
        let subscriptionsCount =
          this.subscriptionsCount.get(responseChannel) || 0;
        this.subscriptionsCount.set(responseChannel, subscriptionsCount + 1);
        this.routingMap.set(packet.id, callback);
        this.stanClient.publish(
          this.getRequestPattern(channel),
          JSON.stringify(serializedPacket)
        );
      };

      if (!subscription) {
        const subOpts = this.stanClient.subscriptionOptions();
        subOpts.setDurableName('durable-' + channel);

        const sub = this.options.group
          ? this.stanClient.subscribe(
              responseChannel,
              this.options.group,
              subOpts
            )
          : this.stanClient.subscribe(responseChannel, subOpts);

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
  protected dispatchEvent<T = any>(packet: ReadPacket<any>): Promise<T> {
    const pattern = this.normalizePattern(packet.pattern);
    const serializedPacket = this.serializer.serialize(packet);

    return new Promise((resolve, reject) =>
      this.stanClient.publish(
        pattern,
        JSON.stringify(serializedPacket),
        (err, guid) => (err ? reject(err) : resolve(guid as any))
      )
    );
  }

  // internal methods
  public getRequestPattern(pattern: string): string {
    return pattern;
  }

  public getReplyPattern(pattern: string): string {
    return `${pattern}.reply`;
  }

  public createResponseCallback(): (msg: stan.Message) => any {
    return (msg: stan.Message) => {
      const packet = JSON.parse(msg.getData() as string);
      const { err, response, isDisposed, id } = this.deserializer.deserialize(
        packet
      );

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
    const options: StanClientModuleOptions =
      this.options || ({} as StanClientModuleOptions);
    return stan.connect(
      options.clusterId,
      `${options.clientId}-${nanoid(10)}`,
      {
        ...options,
        url: this.url
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
}
