import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { HealthProbeService } from './health-probe.service';
import { SystemTelemetryService } from './system-telemetry.service';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { IncidentManagerService } from './incident-manager.service';
import { RunbookEngineService } from './runbook-engine.service';
import { ProbeTargetType, ProbeExecutionOptions } from './health-probe.types';
import {
  CreateIncidentDto,
  TransitionIncidentDto,
  EscalateIncidentDto,
  AnomalyDetectionInput,
  IncidentStatus,
} from './incident.types';

@UseGuards(JwtAuthGuard)
@Controller('reliability')
export class ReliabilityController {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly probeService: HealthProbeService,
    private readonly telemetryService: SystemTelemetryService,
    private readonly anomalyService: AnomalyDetectionService,
    private readonly incidentManager: IncidentManagerService,
    @Optional() private readonly runbookEngine?: RunbookEngineService,
  ) {}

  @Get('probes')
  async getProbes(@Request() req: any, @Query('companyId') companyId?: string) {
    const targetCompanyId = companyId || req.user?.companyId;
    if (targetCompanyId) {
      await this.authz.assertCompanyAccess(req.user, targetCompanyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Global probe telemetry requires CHAIRMAN authority');
    }

    return this.probeService.getProbeSummaries(targetCompanyId);
  }

  @Post('probes/run')
  async triggerProbe(
    @Request() req: any,
    @Body()
    body: {
      targetType: ProbeTargetType;
      targetName: string;
      companyId?: string;
      timeoutMs?: number;
      endpoint?: string;
      correlationId?: string;
      isProtected?: boolean;
    },
  ) {
    const targetCompanyId = body.companyId || req.user?.companyId;
    if (targetCompanyId) {
      await this.authz.assertCompanyAccess(req.user, targetCompanyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Triggering global infrastructure probes requires CHAIRMAN authority');
    }

    const options: ProbeExecutionOptions = {
      timeoutMs: body.timeoutMs,
      companyId: targetCompanyId,
      endpoint: body.endpoint,
      correlationId: body.correlationId,
      isProtected: body.isProtected,
    };

    return this.probeService.executeProbe(body.targetType, body.targetName, options);
  }

  @Get('metrics')
  async getMetrics(
    @Request() req: any,
    @Query('companyId') companyId?: string,
    @Query('windowMinutes') windowMinutes?: string,
  ) {
    const targetCompanyId = companyId || req.user?.companyId;
    if (targetCompanyId) {
      await this.authz.assertCompanyAccess(req.user, targetCompanyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Access to global system telemetry metrics requires CHAIRMAN authority');
    }

    const window = windowMinutes ? Math.max(1, Math.min(1440, parseInt(windowMinutes, 10))) : 60;
    return this.telemetryService.getAggregatedMetrics(targetCompanyId, window);
  }

  @Get('company/:companyId')
  async getCompanyReliabilitySummary(
    @Request() req: any,
    @Param('companyId') companyId: string,
  ) {
    await this.authz.assertCompanyAccess(req.user, companyId);

    const [probes, metrics, incidents] = await Promise.all([
      this.probeService.getProbeSummaries(companyId),
      this.telemetryService.getAggregatedMetrics(companyId),
      this.incidentManager.getIncidents(companyId),
    ]);

    return {
      companyId,
      probes,
      metrics,
      activeIncidents: incidents.filter((i) => i.status !== IncidentStatus.RESOLVED && i.status !== IncidentStatus.CLOSED),
      timestamp: new Date().toISOString(),
    };
  }

  @Post('observations/cleanup')
  async cleanupObservations(
    @Request() req: any,
    @Body()
    body: {
      retentionHours?: number;
      companyId?: string;
      maxBatches?: number;
      batchSize?: number;
    },
  ) {
    if (body.companyId) {
      await this.authz.assertCompanyAccess(req.user, body.companyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Global observation retention cleanup requires CHAIRMAN authority');
    }

    return this.probeService.cleanExpiredObservations({
      retentionHours: body.retentionHours,
      companyId: body.companyId,
      maxBatches: body.maxBatches,
      batchSize: body.batchSize,
    });
  }

  // ==========================================
  // PHASE 2: INCIDENT MANAGEMENT ENDPOINTS
  // ==========================================

  @Get('incidents')
  async getIncidents(
    @Request() req: any,
    @Query('companyId') companyId?: string,
    @Query('status') status?: IncidentStatus,
  ) {
    const targetCompanyId = companyId || req.user?.companyId;
    if (targetCompanyId) {
      await this.authz.assertCompanyAccess(req.user, targetCompanyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Global incident listing requires CHAIRMAN authority');
    }

    return this.incidentManager.getIncidents(targetCompanyId, status);
  }

  @Get('incidents/:id')
  async getIncident(@Request() req: any, @Param('id') id: string) {
    const incident = await this.incidentManager.getIncidentById(id);
    if (incident.companyId) {
      await this.authz.assertCompanyAccess(req.user, incident.companyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Access to global infrastructure incidents requires CHAIRMAN authority');
    }
    return incident;
  }

  @Post('incidents')
  async createIncident(@Request() req: any, @Body() body: CreateIncidentDto) {
    const targetCompanyId = body.companyId || req.user?.companyId;
    if (targetCompanyId) {
      await this.authz.assertCompanyAccess(req.user, targetCompanyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Reporting global infrastructure incidents requires CHAIRMAN authority');
    }

    return this.incidentManager.reportOrDeduplicateIncident({
      ...body,
      companyId: targetCompanyId,
      actorId: req.user?.actorId,
      actorRole: req.user?.actorRole,
    });
  }

  @Post('incidents/:id/transition')
  async transitionIncident(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: TransitionIncidentDto,
  ) {
    const incident = await this.incidentManager.getIncidentById(id);
    if (incident.companyId) {
      await this.authz.assertCompanyAccess(req.user, incident.companyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Modifying global infrastructure incidents requires CHAIRMAN authority');
    }

    return this.incidentManager.transitionStatus(
      id,
      {
        ...body,
        actorId: req.user?.actorId,
        actorRole: req.user?.actorRole,
      },
      incident.companyId ?? undefined,
    );
  }

  @Post('incidents/:id/escalate')
  async escalateIncident(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: EscalateIncidentDto,
  ) {
    const incident = await this.incidentManager.getIncidentById(id);
    if (incident.companyId) {
      await this.authz.assertCompanyAccess(req.user, incident.companyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Escalating global infrastructure incidents requires CHAIRMAN authority');
    }

    return this.incidentManager.escalateIncident(
      id,
      {
        ...body,
        actorId: req.user?.actorId,
        actorRole: req.user?.actorRole,
      },
      incident.companyId ?? undefined,
    );
  }

  @Post('incidents/evaluate-probe')
  async evaluateProbeObservation(
    @Request() req: any,
    @Body() body: AnomalyDetectionInput,
  ) {
    const targetCompanyId = body.companyId || req.user?.companyId;
    if (targetCompanyId) {
      await this.authz.assertCompanyAccess(req.user, targetCompanyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Evaluating global infrastructure probes requires CHAIRMAN authority');
    }

    const evaluation = this.anomalyService.evaluateAnomaly({
      ...body,
      companyId: targetCompanyId,
    });

    if (!evaluation.isAnomaly) {
      return { isAnomaly: false, evaluation };
    }

    const incident = await this.incidentManager.reportOrDeduplicateIncident({
      companyId: targetCompanyId,
      title: evaluation.title,
      description: evaluation.description,
      severity: evaluation.severity,
      targetType: body.targetType,
      targetName: body.targetName,
      correlationId: body.correlationId,
      hypotheses: evaluation.hypotheses,
      affectedServices: evaluation.affectedServices,
      createUrgentTask: evaluation.requiresUrgentTask,
      actorId: req.user?.actorId,
      actorRole: req.user?.actorRole,
    });

    return {
      isAnomaly: true,
      evaluation,
      incident,
    };
  }

  @Post('incidents/:id/diagnose')
  async diagnoseIncident(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body?: { windowMinutes?: number },
  ) {
    const incident = await this.incidentManager.getIncidentById(id);
    if (incident.companyId) {
      await this.authz.assertCompanyAccess(req.user, incident.companyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Diagnosing global infrastructure incidents requires CHAIRMAN authority');
    }

    return this.incidentManager.diagnoseIncident(
      id,
      incident.companyId ?? undefined,
      {
        windowMinutes: body?.windowMinutes,
        actorId: req.user?.actorId,
        actorRole: req.user?.actorRole,
      },
    );
  }

  @Get('incidents/:id/diagnostics')
  async getIncidentDiagnostics(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    const incident = await this.incidentManager.getIncidentById(id);
    if (incident.companyId) {
      await this.authz.assertCompanyAccess(req.user, incident.companyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Viewing global infrastructure diagnostics requires CHAIRMAN authority');
    }

    return this.incidentManager.getIncidentDiagnosticReports(
      id,
      incident.companyId ?? undefined,
    );
  }

  @Get('diagnostics/:reportId')
  async getDiagnosticReport(
    @Request() req: any,
    @Param('reportId') reportId: string,
  ) {
    const report = await this.incidentManager.getDiagnosticReportById(reportId);
    if (report.companyId) {
      await this.authz.assertCompanyAccess(req.user, report.companyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Viewing global diagnostic reports requires CHAIRMAN authority');
    }

    return report;
  }

  // ==========================================
  // PHASE 4: RUNBOOK ENGINE & GOVERNED REMEDIATION
  // ==========================================

  private getEngine(): RunbookEngineService {
    if (!this.runbookEngine) {
      throw new BadRequestException('Runbook engine service is not configured');
    }
    return this.runbookEngine;
  }

  @Get('incidents/:id/runbooks')
  async getAvailableRunbooks(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    const incident = await this.incidentManager.getIncidentById(id);
    if (incident.companyId) {
      await this.authz.assertCompanyAccess(req.user, incident.companyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Access to global infrastructure runbooks requires CHAIRMAN authority');
    }

    return this.getEngine().getAvailableRunbooksForIncident(id, incident.companyId ?? undefined);
  }

  @Post('incidents/:id/runbooks/:runbookId/plan')
  async planRemediation(
    @Request() req: any,
    @Param('id') id: string,
    @Param('runbookId') runbookId: string,
  ) {
    const incident = await this.incidentManager.getIncidentById(id);
    if (incident.companyId) {
      await this.authz.assertCompanyAccess(req.user, incident.companyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Planning remediation for global infrastructure incidents requires CHAIRMAN authority');
    }

    return this.getEngine().planRemediation(
      id,
      runbookId,
      incident.companyId ?? undefined,
      {
        actorId: req.user?.actorId,
        actorRole: req.user?.actorRole,
      },
    );
  }

  @Post('runbooks/executions/:executionId/execute')
  async executeRemediation(
    @Request() req: any,
    @Param('executionId') executionId: string,
    @Body() _body?: { approvedBy?: string },
  ) {
    const execution = await this.getEngine().getExecutionById(executionId);
    if (execution.companyId) {
      await this.authz.assertCompanyAccess(req.user, execution.companyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Executing global infrastructure remediation requires CHAIRMAN authority');
    }

    return this.getEngine().executeRemediation(
      executionId,
      execution.companyId ?? undefined,
      {
        actorId: req.user?.actorId,
        actorRole: req.user?.actorRole,
      },
    );
  }

  @Post('runbooks/executions/:executionId/approve')
  async approveExecution(
    @Request() req: any,
    @Param('executionId') executionId: string,
    @Body() body?: { reason?: string },
  ) {
    const execution = await this.getEngine().getExecutionById(executionId);
    if (execution.companyId) {
      await this.authz.assertCompanyAccess(req.user, execution.companyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Approving global infrastructure remediation requires CHAIRMAN authority');
    }

    return this.getEngine().approveExecution(
      executionId,
      execution.companyId ?? undefined,
      {
        actorId: req.user?.actorId,
        actorRole: req.user?.actorRole,
      },
      body?.reason,
    );
  }

  @Post('runbooks/executions/:executionId/reject')
  async rejectExecution(
    @Request() req: any,
    @Param('executionId') executionId: string,
    @Body() body?: { reason?: string },
  ) {
    const execution = await this.getEngine().getExecutionById(executionId);
    if (execution.companyId) {
      await this.authz.assertCompanyAccess(req.user, execution.companyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Rejecting global infrastructure remediation requires CHAIRMAN authority');
    }

    return this.getEngine().rejectExecution(
      executionId,
      execution.companyId ?? undefined,
      {
        actorId: req.user?.actorId,
        actorRole: req.user?.actorRole,
      },
      body?.reason,
    );
  }

  @Post('runbooks/executions/:executionId/reconcile')
  async reconcileExecution(
    @Request() req: any,
    @Param('executionId') executionId: string,
    @Body() body?: { leaseThresholdMs?: number },
  ) {
    const execution = await this.getEngine().getExecutionById(executionId);
    if (execution.companyId) {
      await this.authz.assertCompanyAccess(req.user, execution.companyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Reconciling global infrastructure remediation requires CHAIRMAN authority');
    }

    return this.getEngine().reconcileStrandedExecution(
      executionId,
      execution.companyId ?? undefined,
      {
        actorId: req.user?.actorId,
        actorRole: req.user?.actorRole,
      },
      { leaseThresholdMs: body?.leaseThresholdMs },
    );
  }

  @Post('runbooks/executions/:executionId/rollback')
  async rollbackRemediation(
    @Request() req: any,
    @Param('executionId') executionId: string,
    @Body() body?: { reason?: string },
  ) {
    const execution = await this.getEngine().getExecutionById(executionId);
    if (execution.companyId) {
      await this.authz.assertCompanyAccess(req.user, execution.companyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Rolling back global infrastructure remediation requires CHAIRMAN authority');
    }

    return this.getEngine().rollbackRemediation(
      executionId,
      execution.companyId ?? undefined,
      body?.reason,
      {
        actorId: req.user?.actorId,
        actorRole: req.user?.actorRole,
      },
    );
  }

  @Get('runbooks/executions/:executionId')
  async getExecution(
    @Request() req: any,
    @Param('executionId') executionId: string,
  ) {
    const execution = await this.getEngine().getExecutionById(executionId);
    if (execution.companyId) {
      await this.authz.assertCompanyAccess(req.user, execution.companyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Viewing global infrastructure remediation executions requires CHAIRMAN authority');
    }

    return execution;
  }

  @Get('incidents/:id/executions')
  async getIncidentExecutions(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    const incident = await this.incidentManager.getIncidentById(id);
    if (incident.companyId) {
      await this.authz.assertCompanyAccess(req.user, incident.companyId);
    } else if (req.user?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('Viewing global incident executions requires CHAIRMAN authority');
    }

    return this.getEngine().getIncidentExecutions(
      id,
      incident.companyId ?? undefined,
    );
  }
}
