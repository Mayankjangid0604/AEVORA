import { Module } from '@nestjs/common';
import { OfficeScreensService } from './office-screens.service';
import { OfficeScreensController, OfficeEmployeesController, OfficeRecordsController } from './office-screens.controller';
import { RoomScreensService } from './room-screens.service';
import { EmployeeChatService } from './employee-chat.service';
import { CafeteriaService } from './cafeteria.service';
import { EconomyModule } from '../economy/economy.module';

@Module({
  imports: [EconomyModule],
  providers: [OfficeScreensService, EmployeeChatService, CafeteriaService, RoomScreensService],
  controllers: [OfficeScreensController, OfficeEmployeesController, OfficeRecordsController],
})
export class OfficeScreensModule {}
