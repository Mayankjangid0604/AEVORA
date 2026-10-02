import { Module } from '@nestjs/common';
import { ProductionExecutionGateService } from './production-execution-gate.service';
import { SecretManagerService } from './secret-manager.service';
import { ExternalEventIngestionService } from './external-event-ingestion.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ApprovalModule } from '../approval/approval.module';
import { LoggerModule } from '../logger/logger.module';

@Module({
  imports: [PrismaModule, ApprovalModule, LoggerModule],
  providers: [
    ProductionExecutionGateService,
    SecretManagerService,
    ExternalEventIngestionService,
  ],
  exports: [
    ProductionExecutionGateService,
    SecretManagerService,
    ExternalEventIngestionService,
  ],
})
export class ProductionModule {}
