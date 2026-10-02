import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, RealtimeGateway],
  exports: [DevicesService, RealtimeGateway],
})
export class DevicesModule {}
