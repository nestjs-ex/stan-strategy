import { isObject, isString } from '@nestjs/common/utils/shared.utils';
import { EventPattern, MessagePattern } from '@nestjs/microservices';
import { StanPattern } from '../interfaces/stan-pattern.interface';
import { StanSubscriptionOptions } from '../interfaces/stan-subscription-options.interface';

function parsePatternArgs(args: any[]) {
  let qGroup: string;
  let opts: StanSubscriptionOptions;

  if (args.length > 0) {
    if (isString(args[0])) {
      qGroup = args[0];

      if ((args.length > 1) && isObject(args[1])) {
        opts = args[1];
      }
    } else if (isObject(args[0])) {
      opts = args[0];
    }
  }

  return {
    qGroup,
    opts
  };
}

export function StanMessagePattern(subject: string, ...args: any[]): MethodDecorator {
  const { qGroup, opts } = parsePatternArgs(args);

  return (
    target: object,
    key: string | symbol,
    descriptor: PropertyDescriptor
  ) => {
    const metadata: StanPattern = {
      subject,
      qGroup,
      opts
    };
    return MessagePattern<StanPattern>(metadata)(target, key, descriptor);
  };
}

export function StanEventPattern(subject: string, ...args: any[]): MethodDecorator {
  const { qGroup, opts } = parsePatternArgs(args);

  return (
    target: object,
    key: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const metadata: StanPattern = {
      subject,
      qGroup,
      opts
    };
    return EventPattern<StanPattern>(metadata)(target, key, descriptor);
  };
}
