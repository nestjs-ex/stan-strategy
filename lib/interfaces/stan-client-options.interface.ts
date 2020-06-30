import { StanOptions } from 'node-nats-streaming';

export interface StanClientOptions extends StanOptions {
  clusterId: string;
  clientId: string;
  group: string;
  subscribe?: {
    durableName?: string;
    maxInFlight?: number;
    ackWait?: number;
    startPosition?: number;
    startSequence?: number;
    startTime?: Date;
    manualAcks?: boolean;
  };
}
