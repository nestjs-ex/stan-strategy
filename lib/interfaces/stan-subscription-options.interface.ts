import { StartPosition } from 'node-nats-streaming';

export interface StanSubscriptionOptions {
  durableName?: string;
  deliverAllAvailable?: boolean;
  maxInFlight?: number;
  ackWait?: number;
  startPosition?: StartPosition;
  startSequence?: number;
  startTime?: Date;
  manualAcks?: boolean;
}
