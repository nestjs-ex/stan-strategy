import { DynamicModule, Module, Provider } from '@nestjs/common';
import {
  StanClientModuleOptions,
  StanClientModuleAsyncOptions,
  StanClientOptionsFactory
} from './interfaces';
import { STAN_CLIENT_MODULE_OPTIONS } from './stan-client.constants';
import { createStanClientProvider } from './stan-client.providers';
import { StanClient } from './stan-client.service';

@Module({
  providers: [StanClient],
  exports: [StanClient]
})
export class StanClientModule {
  static register(options: StanClientModuleOptions): DynamicModule {
    return {
      module: StanClientModule,
      providers: createStanClientProvider(options)
    };
  }

  static registerAsync(options: StanClientModuleAsyncOptions): DynamicModule {
    return {
      module: StanClientModule,
      imports: options.imports || [],
      providers: this.createAsyncProviders(options)
    };
  }

  private static createAsyncProviders(
    options: StanClientModuleAsyncOptions
  ): Provider[] {
    if (options.useExisting || options.useFactory) {
      return [this.createAsyncOptionsProvider(options)];
    }
    return [
      this.createAsyncOptionsProvider(options),
      {
        provide: options.useClass,
        useClass: options.useClass
      }
    ];
  }

  private static createAsyncOptionsProvider(
    options: StanClientModuleAsyncOptions
  ): Provider {
    if (options.useFactory) {
      return {
        provide: STAN_CLIENT_MODULE_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject || []
      };
    }
    return {
      provide: STAN_CLIENT_MODULE_OPTIONS,
      useFactory: async (optionsFactory: StanClientOptionsFactory) =>
        await optionsFactory.createStanClientOptions(),
      inject: [options.useExisting || options.useClass]
    };
  }
}
