import {
  Server,
  CustomTransportStrategy,
  IncomingRequest,
  ReadPacket,
  PacketId
} from '@nestjs/microservices';
import {
  CONNECT_EVENT,
  MESSAGE_EVENT,
  ERROR_EVENT,
  NO_MESSAGE_HANDLER
} from '@nestjs/microservices/constants';
import { isUndefined } from '@nestjs/common/utils/shared.utils';
import { nanoid } from 'nanoid';
import { Observable } from 'rxjs';
import * as stan from 'node-nats-streaming';

import { StanClientOptions } from './interfaces';
import { STAN_DEFAULT_URL } from './stan-client.constants';
import { StanContext } from './stan.context';

// Strategy region
export class StanStrategy extends Server implements CustomTransportStrategy {
  private readonly url: string;
  private stanClient: stan.Stan;

  constructor(private readonly options: StanClientOptions) {
    super();
    this.url = this.getOptionsProp(this.options, 'url') || STAN_DEFAULT_URL;

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  // CustomTransportStrategy methods
  listen(callback: () => void): any {
    this.stanClient = this.createStanClient();
    this.handleError(this.stanClient);
    this.start(callback);
  }

  close(): any {
    this.stanClient && this.stanClient.close();
    this.stanClient = null;
  }

  // Internal methods
  public start(callback?: () => void) {
    this.stanClient.on(CONNECT_EVENT, () => {
      this.bindEvents(this.stanClient);
      callback();
    });
  }

  public bindEvents(client: stan.Stan) {
    const that = this;
    const group = this.getOptionsProp(this.options, 'group');

    const subscribe = group
      ? (channel: string, opts: stan.SubscriptionOptions) =>
          client.subscribe(channel, group, opts)
      : (channel: string, opts: stan.SubscriptionOptions) =>
          client.subscribe(channel, opts);

    const registeredPatterns = [...this.messageHandlers.keys()];
    registeredPatterns.forEach((channel) => {
      const { isEventHandler } = this.messageHandlers.get(channel);
      const subOpts = client.subscriptionOptions();

      if (!isUndefined(this.options.subscribe)) {
        const userSubOpts = this.options.subscribe;

        if (!isUndefined(userSubOpts.durableName))
          subOpts.setDurableName(userSubOpts.durableName); // 'durable-' + channel

        if (!isUndefined(userSubOpts.maxInFlight))
          subOpts.setMaxInFlight(userSubOpts.maxInFlight);

        if (!isUndefined(userSubOpts.ackWait))
          subOpts.setAckWait(userSubOpts.ackWait);

        if (!isUndefined(userSubOpts.startPosition))
          subOpts.setStartAt(userSubOpts.startPosition);

        if (!isUndefined(userSubOpts.startSequence))
          subOpts.setStartAtSequence(userSubOpts.startSequence);

        if (!isUndefined(userSubOpts.startTime))
          subOpts.setStartTime(userSubOpts.startTime);

        if (!isUndefined(userSubOpts.manualAcks))
          subOpts.setManualAckMode(userSubOpts.manualAcks);
      }

      const sub = subscribe(
        isEventHandler ? channel : this.getRequestPattern(channel),
        subOpts
      );
      sub.on('ready', () => {
        // avoid "NATS: Subject must be supplied" error
        console.log('subscription ready');
        sub.on(
          MESSAGE_EVENT,
          this.getMessageHandler(channel, client).bind(this)
        );
      });
      sub.on('error', (err) => console.log('subscription error: ', err));
      sub.on('timeout', (err) => console.log('subscription timeout: ', err));
      sub.on('unsubscribed', () => console.log('subscription unsubscribed'));
      sub.on('closed', () => console.log('subscription closed'));
    });
  }

  public createStanClient(): stan.Stan {
    const options = this.options || ({} as StanClientOptions);
    return stan.connect(
      options.clusterId,
      `${options.clientId}-${nanoid(10)}`,
      {
        ...options,
        url: this.url
      }
    );
  }

  public getMessageHandler(channel: string, client: stan.Stan): Function {
    return async (msg: stan.Message) =>
      this.handleMessage(channel, msg, client);
  }

  public async handleMessage(
    channel: string,
    message: stan.Message,
    client: stan.Stan
  ) {
    const rawPacket = this.parseMessage(message.getData() as string);
    const packet = this.deserializer.deserialize(rawPacket, { channel });
    const stanCtx = new StanContext([message]);

    if (isUndefined((packet as IncomingRequest).id)) {
      return this.handleEvent(channel, packet, stanCtx);
    }

    const publish = this.getPublisher(
      client,
      channel,
      (packet as IncomingRequest).id
    );
    const handler = this.getHandlerByPattern(channel);

    if (!handler) {
      const status = 'error';
      const noHandlerPacket = {
        id: (packet as IncomingRequest).id,
        status,
        err: NO_MESSAGE_HANDLER
      };
      return publish(noHandlerPacket);
    }
    const response$ = this.transformToObservable(
      await handler(packet.data, stanCtx)
    ) as Observable<any>;
    response$ && this.send(response$, publish);
  }

  public getPublisher(publisher: stan.Stan, pattern: string, id: string) {
    return (response: any) => {
      Object.assign(response, { id });
      const outgoingResponse = this.serializer.serialize(response);
      return publisher.publish(
        this.getReplyPattern(pattern),
        JSON.stringify(outgoingResponse)
      );
    };
  }

  public parseMessage(content: string): ReadPacket & PacketId {
    try {
      return JSON.parse(content);
    } catch (e) {
      return content as any;
    }
  }

  public getRequestPattern(pattern: string): string {
    return pattern;
  }

  public getReplyPattern(pattern: string): string {
    return `${pattern}.reply`;
  }

  public handleError(stream: any) {
    stream.on(ERROR_EVENT, (err: any) => {
      this.logger.error(err);
    });
  }
}
