import { BaseRpcContext } from '@nestjs/microservices/ctx-host/base-rpc.context';
import { Message } from 'node-nats-streaming';

type StanContextArgs = [Message];

export class StanContext extends BaseRpcContext<StanContextArgs> {
  constructor(args: StanContextArgs) {
    super(args);
  }

  /**
   * Returns the reference to the original message.
   */
  getMessage() {
    return this.args[0];
  }
}
