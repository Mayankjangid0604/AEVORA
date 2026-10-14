import { Module } from '@nestjs/common';
import { InquiryService } from './inquiry.service';
import { InquiryController, PublicIntakeController } from './inquiry.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InquiryController, PublicIntakeController],
  providers: [InquiryService],
})
export class InquiryModule {}
