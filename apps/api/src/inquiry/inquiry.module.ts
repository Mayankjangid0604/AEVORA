import { Module } from '@nestjs/common';
import { InquiryService } from './inquiry.service';
import { InquiryAutomationService } from './inquiry-automation.service';
import { InquiryController, PublicIntakeController } from './inquiry.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JobModule } from '../job/job.module';

@Module({
  imports: [PrismaModule, JobModule],
  controllers: [InquiryController, PublicIntakeController],
  providers: [InquiryService, InquiryAutomationService],
  exports: [InquiryAutomationService],
})
export class InquiryModule {}
