import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ApprovalModule } from '../approval/approval.module';
import { GovernedAuthorityService } from './governed-authority.service';
import { ChairmanGovernanceService } from './chairman-governance.service';

@Global()
@Module({
  imports: [PrismaModule, ApprovalModule],
  providers: [GovernedAuthorityService, ChairmanGovernanceService],
  exports: [GovernedAuthorityService, ChairmanGovernanceService],
})
export class GovernanceModule {}
