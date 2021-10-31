import { IncomingEvent, IncomingRequest } from '@nestjs/microservices';
import { IncomingRequestDeserializer } from '@nestjs/microservices/deserializers/incoming-request.deserializer';

export class StanRequestDeserializer extends IncomingRequestDeserializer {
  deserialize(
    value: string,
    options?: Record<string, any>,
  ): IncomingRequest | IncomingEvent {
    const decodedRequest = JSON.parse(value);
    return super.deserialize(decodedRequest, options);
  }
}
