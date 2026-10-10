import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { HealthProbeService } from './health-probe.service';
import { SystemTelemetryService } from './system-telemetry.service';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { IncidentManagerService } from './incident-manager.service';
import { DiagnosticContextAssemblerService } from './diagnostic-context-assembler.service';
import { RootCauseAnalysisService } from './root-cause-analysis.service';
import { ITRemediationAdapter } from './it-remediation.adapter';
import { RunbookEngineService } from './runbook-engine.service';
import { ReliabilityController } from './reliability.controller';

import { ExternalActionGatewayModule } from '../external-action-gateway/external-action-gateway.module';

@Module({
  imports: [PrismaModule, AuthorizationModule, ExternalActionGatewayModule],
  controllers: [ReliabilityController],
  providers: [
    HealthProbeService,
    SystemTelemetryService,
    AnomalyDetectionService,
    IncidentManagerService,
    DiagnosticContextAssemblerService,
    RootCauseAnalysisService,
    ITRemediationAdapter,
    RunbookEngineService,
  ],
  exports: [
    HealthProbeService,
    SystemTelemetryService,
    AnomalyDetectionService,
    IncidentManagerService,
    DiagnosticContextAssemblerService,
    RootCauseAnalysisService,
    ITRemediationAdapter,
    RunbookEngineService,
  ],
})
export class ReliabilityModule {}
