import { Controller, Get } from '@nestjs/common';
import { EventPattern, MessagePattern } from '@nestjs/microservices';
import { StanMessagePattern } from '../lib/decorators/stan-subscription.decorator';

@Controller()
export class AppController {
  constructor() {}

  @MessagePattern('math.sum')
  public accumulate(data: number[]): number {
    return (data || []).reduce((a, b) => a + b);
  }

  @MessagePattern({ subject: 'math.sum1', opts: { durableName: 'test' } })
  public accumulate1(data: number[]): number {
    return (data || []).reduce((a, b) => a + b);
  }

  @StanMessagePattern('math.sum2')
  public accumulate2(data: number[]): number {
    return (data || []).reduce((a, b) => a + b);
  }
}
