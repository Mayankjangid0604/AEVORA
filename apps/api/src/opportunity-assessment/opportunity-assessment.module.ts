import { Module } from '@nestjs/common';
import { OpportunityAssessmentService } from './opportunity-assessment.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OpportunityModule } from '../opportunity/opportunity.module';

@Module({
  imports: [PrismaModule, OpportunityModule],
  providers: [OpportunityAssessmentService],
  exports: [OpportunityAssessmentService],
})
export class OpportunityAssessmentModule {}
