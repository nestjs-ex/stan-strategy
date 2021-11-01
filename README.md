[![Build](https://github.com/nestjs-ex/stan-strategy/actions/workflows/development.yml/badge.svg?branch=master)](https://github.com/nestjs-ex/stan-strategy/actions/workflows/development.yml)

## Description

NATS streaming server strategy and client module for [Nest](https://github.com/nestjs/nest) based on the [stan.js](https://github.com/nats-io/stan.js) package.

## Installation

```bash
$ npm i --save @nestjs-ex/stan-strategy
```

## Usage

### Server

To use the STAN transporter, pass the following options object to the `createMicroservice()` method:

```typescript
import { NestFactory } from '@nestjs/core';
import { StanStrategy } from '@nestjs-ex/stan-strategy';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice(
    AppModule,
    {
      strategy: new StanStrategy({
        url: 'nats://localhost:4222',
        group: 'example-group', // [DEPRECATED] Please use decorator @StanMessagePattern or @StanEventPattern
        clusterId: 'example',
        clientId: 'example-server',
        name: 'example-server',
        subscribe: { // [DEPRECATED][optional] Please use `defaultSubscriptionOptions`
          durableName: 'durable', // [optional] the real name is <durableName>-<subject>
          deliverAllAvailable: false, // [optional]
          maxInFlight: 100, // [optional]
          ackWait: 60 * 1000, // [optional] in millis
          startPosition: 0, // [optional] (0 mean new only)
          startSequence: 22, // [optional]
          startTime: new Date(2016, 7, 8), // [optional]
          manualAcks: false // [optional]
        },
        defaultSubscriptionOptions: { // [optional] the same as subscribe
          durableName: 'durable', // [optional] the real name is <durableName>-<subject>
          deliverAllAvailable: false, // [optional]
          maxInFlight: 100, // [optional]
          ackWait: 60 * 1000, // [optional] in millis
          startPosition: 0, // [optional] (0 mean new only)
          startSequence: 22, // [optional]
          startTime: new Date(2016, 7, 8), // [optional]
          manualAcks: false // [optional]
        },
        serializer: Serializer,
        deserializer: Deserializer
      })
    },
  );
  app.listen(() => console.log('Microservice is listening'));
}
bootstrap();
```

#### Request-response

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { StanMessagePattern } from '@nestjs-ex/stan-strategy';

@Controller()
export class MathController {
  @MessagePattern('math.sum')
  accumulate(data: number[]): number {
    return (data || []).reduce((a, b) => a + b);
  }

  @MessagePattern({
    subject: 'math.sum',
    qGroup: 'math-group',
    opts: { // See `defaultSubscriptionOptions`
      durableName: 'durable',
    }
  })
  accumulate(data: number[]): number {
    return (data || []).reduce((a, b) => a + b);
  }

  @StanMessagePattern('math.sum', { durableName: 'durable' })
  accumulate(data: number[]): number {
    return (data || []).reduce((a, b) => a + b);
  }

  @StanMessagePattern('math.sum', 'math-group', { durableName: 'durable' })
  accumulate(data: number[]): number {
    return (data || []).reduce((a, b) => a + b);
  }
}
```

#### Event-based

```typescript
@EventPattern('user.user_created')
async handleUserCreated(data: Record<string, unknown>) {
  // business logic
}

@EventPattern({
  subject: 'user.user_created',
  qGroup: 'user-group',
  opts: {
    manualAcks: false
  }
})
async handleUserCreated(data: Record<string, unknown>) {
  // business logic
}

@StanEventPattern('user.user_created', 'user-group', { manualAcks: false })
async handleUserCreated(data: Record<string, unknown>) {
  // business logic
}
```

### Client

To create a client instance with the `StanClientModule`, import it and use the `register()` method to pass an options object with the same properties shown above in the `createMicroservice()` method.

```typescript
@Module({
  imports: [
    StanClientModule.register({
      url: 'nats://localhost:4222',
      clusterId: 'example',
      clientId: 'example-client',
      name: 'example-client'
    }),
  ]
  ...
})
```

Once the module has been imported, we can inject an instance of the `StanClient` shown above

```typescript
constructor(
  private client: StanClient
) {}
```

Quite often you might want to asynchronously pass your module options instead of passing them beforehand. In such case, use `registerAsync()` method, that provides a couple of various ways to deal with async data.

**1. Use factory**

```typescript
StanClientModule.registerAsync({
  useFactory: () => ({
    url: 'nats://localhost:4222',
    clusterId: 'example',
    clientId: 'example-client',
    name: 'example-client'
  })
});
```

Obviously, our factory behaves like every other one (might be `async` and is able to inject dependencies through `inject`).

```typescript
StanClientModule.registerAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    url: configService.getString('STAN_URL'),
    clusterId: configService.getString('STAN_CLUSER_ID'),
    clientId: configService.getString('STAN_CLIENT_ID'),
    name: configService.getString('STAN_NAME')
  }),
  inject: [ConfigService],
}),
```

**2. Use class**

```typescript
StanClientModule.registerAsync({
  useClass: StanClientConfigService
});
```

Above construction will instantiate `JwtConfigService` inside `JwtModule` and will leverage it to create options object.

```typescript
class StanClientConfigService implements StanClientOptionsFactory {
  createStanClientOptions(): StanClientModuleOptions {
    return {
      url: 'nats://localhost:4222',
      clusterId: 'example',
      clientId: 'example-client',
      name: 'example-client'
    };
  }
}
```

**3. Use existing**

```typescript
StanClientModule.registerAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
}),
```

It works the same as `useClass` with one critical difference - `StanClientModule` will lookup imported modules to reuse already created `ConfigService`, instead of instantiating it on its own.

#### Sending messages

```typescript
accumulate(): Observable<number> {
  const payload = [1, 2, 3];
  return this.client.send<number>('math.sum', payload);
}
```

or

```typescript
accumulate(): Observable<number> {
  const pattern = { subject: 'math.sum', qGroup: 'math-group' };
  const payload = [1, 2, 3];
  return this.client.send<number>(pattern, payload);
}
```

## Notes

The package's major version is following NestJS. The package version is 8.x.y will correspond to NestJs 8.a.b.

## Stay in touch

- Author - [Thanh Pham](https://twitter.com/pnt239)

## License

Nest is [MIT licensed](LICENSE).
