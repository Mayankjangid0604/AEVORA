import { Module, forwardRef } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { SurvivalModule } from '../survival/survival.module';
import { TaskModule } from '../task/task.module';
import { NewVentureService } from './new-venture.service';
import { VenturesController } from './ventures.controller';

@Module({
  imports: [DevicesModule, SurvivalModule, forwardRef(() => TaskModule)],
  providers: [NewVentureService],
  controllers: [VenturesController],
  exports: [NewVentureService],
})
export class VenturesModule {}
