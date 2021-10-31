import { isObject, isString, isUndefined } from '@nestjs/common/utils/shared.utils';
import {
  Server,
  CustomTransportStrategy,
  IncomingRequest,
  MessageHandler
} from '@nestjs/microservices';
import {
  CONNECT_EVENT,
  ERROR_EVENT,
  MESSAGE_EVENT,
  NO_MESSAGE_HANDLER
} from '@nestjs/microservices/constants';
import { nanoid } from 'nanoid';
import * as stanPackage from 'node-nats-streaming';
import { Observable } from 'rxjs';
import { StanClientOptions } from './interfaces/stan-client-options.interface';
import { StanPattern } from './interfaces/stan-pattern.interface';
import { StanSubscriptionOptions } from './interfaces/stan-subscription-options.interface';
import { STAN_DEFAULT_URL } from './stan-client.constants';
import { StanRecordSerializer } from './stan-record.serializer';
import { StanRequestDeserializer } from './stan-request.deserializer';
import { StanContext } from './stan.context';
import { StanRecord } from './stan.record-builder';

export class StanStrategy extends Server implements CustomTransportStrategy {
  protected readonly patternMap = new Map<string, string | StanPattern>();
  private _subscriptions: stanPackage.Subscription[] = [];
  private stanClient: stanPackage.Stan;

  constructor(private readonly options: StanClientOptions) {
    super();

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  public async listen(
    callback: (err?: unknown, ...optionalParams: unknown[]) => void,
  ) {
    try {
      this.stanClient = this.createStanClient();
      this.handleError(this.stanClient);
      this.start(callback);
    } catch (err) {
      callback(err);
    }
  }

  public start(callback?: () => void) {
    this.stanClient.on(CONNECT_EVENT, () => {
      this.bindEvents(this.stanClient);
      callback();
    });
  }

  public bindEvents(client: stanPackage.Stan) {
    // const that = this;
    const subscribe = (subject: string, qGroup: string, opts: stanPackage.SubscriptionOptions) =>
      qGroup ? client.subscribe(subject, qGroup, opts) : client.subscribe(subject, opts);

    const registeredPatterns = [...this.messageHandlers.keys()];
    registeredPatterns.forEach((normalizedPattern) => {
      const pattern = this.patternMap.get(normalizedPattern);
      const { subject, qGroup, opts: patternSubOpts } = this.parsePattern(pattern);

      if (isUndefined(subject)) {
        return; // skip this pattern
      }

      const subOpts = client.subscriptionOptions();

      if (!isUndefined(patternSubOpts)) {
        if (!isUndefined(patternSubOpts.durableName))
          subOpts.setDurableName(patternSubOpts.durableName + '-' + subject); // 'durable-' + subject

        if (
          !isUndefined(patternSubOpts.deliverAllAvailable) &&
          patternSubOpts.deliverAllAvailable
        )
          subOpts.setDeliverAllAvailable();

        if (!isUndefined(patternSubOpts.maxInFlight))
          subOpts.setMaxInFlight(patternSubOpts.maxInFlight);

        if (!isUndefined(patternSubOpts.ackWait))
          subOpts.setAckWait(patternSubOpts.ackWait);

        if (!isUndefined(patternSubOpts.startPosition))
          subOpts.setStartAt(patternSubOpts.startPosition);

        if (!isUndefined(patternSubOpts.startSequence))
          subOpts.setStartAtSequence(patternSubOpts.startSequence);

        if (!isUndefined(patternSubOpts.startTime))
          subOpts.setStartTime(patternSubOpts.startTime);

        if (!isUndefined(patternSubOpts.manualAcks))
          subOpts.setManualAckMode(patternSubOpts.manualAcks);
      }

      const sub = subscribe(subject, qGroup, subOpts);

      sub.on('ready', () => {
        // avoid "NATS: Subject must be supplied" error
        this.logger.debug('subscription ready');
        sub.on(
          MESSAGE_EVENT,
          this.getMessageHandler(normalizedPattern, client).bind(this)
        );
      });
      sub.on('error', (err) => this.logger.error('subscription error: ' + err.message));
      sub.on('timeout', (err) => this.logger.error('subscription timeout: ' + err.message));
      sub.on('unsubscribed', () => this.logger.debug('subscription unsubscribed'));
      sub.on('closed', () => this.logger.debug('subscription closed'));
      this._subscriptions.push(sub);
    });
  }

  public async close() {
    this._subscriptions.forEach((sub) => sub.unsubscribe());
    this.stanClient?.close();
    this._subscriptions = [];
    this.stanClient = null;
  }

  public createStanClient(): stanPackage.Stan {
    const options = this.options || ({} as StanClientOptions);
    return stanPackage.connect(
      options.clusterId,
      `${options.clientId}-${nanoid(10)}`,
      {
        url: STAN_DEFAULT_URL,
        ...options,
      }
    );
  }

  public addHandler(
    pattern: any,
    callback: MessageHandler,
    isEventHandler = false,
  ) {
    const normalizedPattern = this.normalizePattern(pattern);
    callback.isEventHandler = isEventHandler;

    if (this.messageHandlers.has(normalizedPattern) && isEventHandler) {
      const headRef = this.messageHandlers.get(normalizedPattern);
      const getTail = (handler: MessageHandler) =>
        handler?.next ? getTail(handler.next) : handler;

      const tailRef = getTail(headRef);
      tailRef.next = callback;
    } else {
      this.messageHandlers.set(normalizedPattern, callback);
      this.patternMap.set(normalizedPattern, pattern);
    }
  }

  public getMessageHandler(pattern: string, pub: stanPackage.Stan): Function {
    return async (msg: stanPackage.Message) =>
      this.handleMessage(pattern, msg, pub);
  }

  public async handleMessage(pattern: string, stanMsg: stanPackage.Message, pub: stanPackage.Stan) {
    const rawMessage = stanMsg.getData();
    const stanCtx = new StanContext([stanMsg]);
    const message = await this.deserializer.deserialize(rawMessage, { channel: pattern });

    if (isUndefined((message as IncomingRequest).id)) {
      return this.handleEvent(pattern, message, stanCtx);
    }

    const publish = this.getPublisher(
      pub,
      pattern,
      (message as IncomingRequest).id
    );
    const handler = this.getHandlerByPattern(pattern);

    if (!handler) {
      const status = 'error';
      const noHandlerPacket = {
        id: (message as IncomingRequest).id,
        status,
        err: NO_MESSAGE_HANDLER
      };
      return publish(noHandlerPacket);
    }
    const response$ = this.transformToObservable(
      await handler(message.data, stanCtx)
    ) as Observable<any>;
    response$ && this.send(response$, publish);
  }

  public getPublisher(pub: stanPackage.Stan, pattern: string, id: string) {
    return (response: any) => {
      Object.assign(response, { id });
      const outgoingResponse: StanRecord = this.serializer.serialize(response);

      return pub.publish(
        this.getReplyPattern(pattern),
        outgoingResponse.data
      );
    };
  }

  public getReplyPattern(normalizedPattern: string): string {
    const pattern = this.patternMap.get(normalizedPattern);
    const { subject } = this.parsePattern(pattern);
    return `${subject}.reply`;
  }

  public handleError(stream: any) {
    stream.on(ERROR_EVENT, (err: any) => {
      this.logger.error(err);
    });
  }

  protected initializeSerializer(options: StanClientOptions) {
    this.serializer = options?.serializer ?? new StanRecordSerializer();
  }

  protected initializeDeserializer(options: StanClientOptions) {
    this.deserializer =
      options?.deserializer ?? new StanRequestDeserializer();
  }

  private parsePattern(pattern: any) {
    let subject: string;
    let qGroup: string;
    let opts: StanSubscriptionOptions;

    if (isString(pattern)) {
      subject = pattern;
      opts = this.options.defaultSubscriptionOptions || this.options.subscribe;
    } else if (isObject(pattern)) {
      subject = pattern['subject'];
      qGroup = pattern['qGroup'];
      opts = pattern['opts'] || this.options.defaultSubscriptionOptions || this.options.subscribe;
    }

    return {
      subject,
      qGroup,
      opts
    };
  }
}
