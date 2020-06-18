import { ModuleMetadata, Type } from '@nestjs/common/interfaces';
import { StanClientOptions } from './stan-client-options.interface';

export interface StanClientModuleOptions extends StanClientOptions {
  /* nothing here */
}

export interface StanClientOptionsFactory {
  createJwtOptions():
    | Promise<StanClientModuleOptions>
    | StanClientModuleOptions;
}

export interface StanClientModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  useExisting?: Type<StanClientOptionsFactory>;
  useClass?: Type<StanClientOptionsFactory>;
  useFactory?: (
    ...args: any[]
  ) => Promise<StanClientModuleOptions> | StanClientModuleOptions;
  inject?: any[];
}
