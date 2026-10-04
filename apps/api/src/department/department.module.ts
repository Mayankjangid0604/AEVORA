import { Module, forwardRef } from '@nestjs/common';
import { WorkforceModule } from '../workforce/workforce.module';
import { CeoModule } from '../ceo/ceo.module';
import { DepartmentService } from './department.service';
import { DepartmentController } from './department.controller';
import { PrismaService } from '../prisma/prisma.service';
import { DepartmentLeaderAutonomousService } from './department-leader-autonomous.service';
import { V12SpatialModule } from '../v12-spatial/v12-spatial.module';

@Module({
  imports: [WorkforceModule, forwardRef(() => CeoModule), forwardRef(() => V12SpatialModule)],
  controllers: [DepartmentController],
  providers: [DepartmentService, PrismaService, DepartmentLeaderAutonomousService],
  exports: [DepartmentService, DepartmentLeaderAutonomousService],
})
export class DepartmentModule {}
