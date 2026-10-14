import { Module, forwardRef } from '@nestjs/common';
import { WorkforceModule } from '../workforce/workforce.module';
import { CeoModule } from '../ceo/ceo.module';
import { DepartmentService } from './department.service';
import { DepartmentController } from './department.controller';
import { PrismaService } from '../prisma/prisma.service';
import { DepartmentLeaderAutonomousService } from './department-leader-autonomous.service';
import { DepartmentHealthService } from './department-health.service';
import { DepartmentWorkstreamService } from './department-workstream.service';
import { DepartmentTeamService } from './department-team.service';
import { DepartmentResourceProposalService } from './department-resource-proposal.service';
import { SpatialModule } from '../spatial/spatial.module';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    forwardRef(() => WorkforceModule),
    forwardRef(() => CeoModule),
    forwardRef(() => SpatialModule),
    AuthorizationModule,
  ],
  controllers: [DepartmentController],
  providers: [
    DepartmentService,
    PrismaService,
    DepartmentLeaderAutonomousService,
    DepartmentHealthService,
    DepartmentWorkstreamService,
    DepartmentTeamService,
    DepartmentResourceProposalService,
  ],
  exports: [
    DepartmentService,
    DepartmentLeaderAutonomousService,
    DepartmentHealthService,
    DepartmentWorkstreamService,
    DepartmentTeamService,
    DepartmentResourceProposalService,
  ],
})
export class DepartmentModule {}
