import { Module } from '@nestjs/common';
import { CompanyIntelligenceService } from './company-intelligence.service';
import { GroupIntelligenceService } from './group-intelligence.service';
import { CompanyIntelligenceController } from './company-intelligence.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ManagementModule } from '../management/management.module';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [PrismaModule, ManagementModule, SalesModule],
  controllers: [CompanyIntelligenceController],
  providers: [CompanyIntelligenceService, GroupIntelligenceService],
  exports: [CompanyIntelligenceService, GroupIntelligenceService]
})
export class CompanyIntelligenceModule {}
