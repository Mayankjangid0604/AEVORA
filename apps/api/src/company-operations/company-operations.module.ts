import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CompanyMetricsService } from './company-metrics.service';
import { TrainingService } from './training.service';
import { ManagementDecisionService } from './management-decision.service';
import { OperationalAlertService } from './operational-alert.service';
import { DisciplineService } from './discipline.service';
import { TaskModule } from '../task/task.module';
import { EconomyModule } from '../economy/economy.module';
import { WorkloadService } from './workload.service';

@Module({
  imports: [PrismaModule, forwardRef(() => TaskModule), EconomyModule],
  providers: [
    CompanyMetricsService,
    TrainingService,
    ManagementDecisionService,
    OperationalAlertService,
    DisciplineService,
    WorkloadService,
  ],
  exports: [
    CompanyMetricsService,
    TrainingService,
    ManagementDecisionService,
    OperationalAlertService,
    DisciplineService,
    WorkloadService,
  ],
})
export class CompanyOperationsModule {}
