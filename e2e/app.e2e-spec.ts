import { Test, TestingModule } from '@nestjs/testing';
import { INestMicroservice } from '@nestjs/common';
import { StanStrategy } from '../lib/stan.strategy';
import { AppModule } from './app.module';

describe('Stan Strategy (e2e)', () => {
  let app: INestMicroservice;
  let server: StanStrategy;

  const bootstrap = async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    server = new StanStrategy({
      url: 'nats://localhost:4222',
      clusterId: 'test-cluster',
      clientId: 'test-client',
      name: 'test-service',
      defaultSubscriptionOptions: { // [optional] the same as subscribe
        durableName: 'durable', // [optional] the real name is <durableName>-<subject>
        deliverAllAvailable: false, // [optional]
        maxInFlight: 100, // [optional]
        ackWait: 60 * 1000, // [optional] in millis
        startPosition: 0, // [optional] (0 mean new only)
        startSequence: 22, // [optional]
        startTime: new Date(2016, 7, 8), // [optional]
        manualAcks: false // [optional]
      }
    });
    app = moduleFixture.createNestMicroservice({
      strategy: server,
    });
    await app.listen();
  };

  beforeEach(async () => {
    await bootstrap();
  });
  afterEach(async () => {
    await app.close();
  });
  describe('starting', () => {
    it('should have some subscriptions', () => {
      expect((server as any)._subscriptions.length).toBeGreaterThan(0);
    });
    it('should has "math.sum" subject in pattern map', () => {
      expect((server as any).patternMap.get('math.sum')).toBeDefined();
    });
    it('should has "math.sum1" subject in pattern map', () => {
      expect((server as any).patternMap.get('{"opts":{"durableName":"test"},"subject":"math.sum1"}')).toBeDefined();
    });
    it('should has "math.sum2" subject in pattern map', () => {
      expect((server as any).patternMap.get('{"opts":undefined,"qGroup":undefined,"subject":"math.sum2"}')).toBeDefined();
    });
  });
});
