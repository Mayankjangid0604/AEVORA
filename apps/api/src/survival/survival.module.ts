import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { EconomyModule } from '../economy/economy.module';
import { SurvivalService } from './survival.service';
import { SurvivalController } from './survival.controller';

@Module({
  imports: [DevicesModule, EconomyModule],
  providers: [SurvivalService],
  controllers: [SurvivalController],
  exports: [SurvivalService],
})
export class SurvivalModule {}
