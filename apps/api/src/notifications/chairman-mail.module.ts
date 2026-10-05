import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AssistantModule } from '../assistant/assistant.module';
import { SalesOutreachModule } from '../sales-outreach/sales-outreach.module';
import { CeoModule } from '../ceo/ceo.module';
import { BoardroomModule } from '../boardroom/boardroom.module';
import { ChairmanMailService } from './chairman-mail.service';
import { ChairmanMailController } from './chairman-mail.controller';

@Module({
  imports: [PrismaModule, AssistantModule, SalesOutreachModule, CeoModule, BoardroomModule],
  providers: [ChairmanMailService],
  controllers: [ChairmanMailController],
  exports: [ChairmanMailService],
})
export class ChairmanMailModule {}
