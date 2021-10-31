import { IncomingResponse } from '@nestjs/microservices';
import { IncomingResponseDeserializer } from '@nestjs/microservices/deserializers/incoming-response.deserializer';

export class StanResponseDeserializer extends IncomingResponseDeserializer {
  deserialize(
    value: string,
    options?: Record<string, any>,
  ): IncomingResponse {
    const decodedRequest = JSON.parse(value);
    return super.deserialize(decodedRequest, options);
  }
}
