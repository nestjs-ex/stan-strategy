import { ReadPacket, Serializer } from '@nestjs/microservices';
import { StanRecord } from './stan.record-builder';

export class StanRecordSerializer implements Serializer<ReadPacket, StanRecord> {
  serialize(packet: ReadPacket | any): StanRecord {
    // const natsMessage =
    //   packet?.data &&
    //     typeof packet.data === 'object' &&
    //     packet.data instanceof StanRecord
    //     ? (packet.data as StanRecord)
    //     : new StanRecordBuilder(packet?.data).build();

    // return {
    //   data: JSON.stringify({ ...packet, data: natsMessage.data }),
    // };

    return {
      data: JSON.stringify(packet),
    };
  }
}
