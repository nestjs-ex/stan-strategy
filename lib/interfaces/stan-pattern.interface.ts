import { StanSubscriptionOptions } from './stan-subscription-options.interface';

export interface StanPattern {
  subject: string;
  qGroup?: string;
  opts?: StanSubscriptionOptions
}
