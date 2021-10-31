import { Deserializer, Serializer } from '@nestjs/microservices';
import { StanOptions } from 'node-nats-streaming';
import { StanSubscriptionOptions } from './stan-subscription-options.interface';

export interface StanClientOptions extends StanOptions {
  clusterId: string;
  clientId: string;
  group?: string; // [DEPRECATED]
  qGroup?: string;
  subscribe?: StanSubscriptionOptions; // [DEPRECATED]
  defaultSubscriptionOptions?: StanSubscriptionOptions;
  serializer?: Serializer;
  deserializer?: Deserializer;
}
