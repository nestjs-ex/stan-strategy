import { StanOptions } from 'node-nats-streaming';

export interface StanClientOptions extends StanOptions {
  clusterId: string;
  clientId: string;
  group: string;
  subscribe?: any;
}
