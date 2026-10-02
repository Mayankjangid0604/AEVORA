import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { CeoModule } from '../ceo/ceo.module';
import { BoardroomService } from './boardroom.service';
import { BoardroomController } from './boardroom.controller';

@Module({
  imports: [DevicesModule, CeoModule],
  providers: [BoardroomService],
  controllers: [BoardroomController],
  exports: [BoardroomService],
})
export class BoardroomModule {}
