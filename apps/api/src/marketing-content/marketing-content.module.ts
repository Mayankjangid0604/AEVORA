import { Module } from '@nestjs/common';
import { MarketingContentService } from './marketing-content.service';
import { MarketingContentController } from './marketing-content.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [MarketingContentService],
  controllers: [MarketingContentController],
  exports: [MarketingContentService],
})
export class MarketingContentModule {}
