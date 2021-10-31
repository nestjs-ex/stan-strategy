import { StanClientModuleOptions } from './interfaces/stan-client-module-options.interface';
import { STAN_CLIENT_MODULE_OPTIONS } from './stan-client.constants';

export function createStanClientProvider(
  options: StanClientModuleOptions
): any[] {
  return [{ provide: STAN_CLIENT_MODULE_OPTIONS, useValue: options || {} }];
}
