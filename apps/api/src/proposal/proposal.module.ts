import { Module } from '@nestjs/common';
import { ProposalService } from './proposal.service';
import { ProposalController } from './proposal.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductionModule } from '../production/production.module';
import { ApprovalModule } from '../approval/approval.module';

@Module({
  imports: [PrismaModule, ProductionModule, ApprovalModule],
  controllers: [ProposalController],
  providers: [ProposalService],
})
export class ProposalModule {}
