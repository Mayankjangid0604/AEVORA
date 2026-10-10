import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { CanonicalEnterpriseStateService } from './canonical-enterprise-state.service';
import { EnterpriseConflictIntegrityService } from './enterprise-conflict-integrity.service';
import { EpistemicCertainty } from '@prisma/client';
import { EnterpriseStreamKey, ReconciliationResult } from './enterprise-intelligence.types';

@Injectable()
export class DigitalTwinReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DigitalTwinReconciliationService.name);
  private dbSubscription?: Subscription;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateService: CanonicalEnterpriseStateService,
    private readonly conflictService: EnterpriseConflictIntegrityService,
  ) {}

  onModuleInit() {
    if (this.prisma.databaseEvents) {
      this.dbSubscription = this.prisma.databaseEvents.subscribe((event) => {
        try {
          this.handleEventDrivenReconciliation(event);
        } catch (e: any) {
          this.logger.warn(`Event-driven reconciliation error: ${e.message}`);
        }
      });
      this.logger.log('Digital Twin subscribed to databaseEvents for event-driven continuous reconciliation');
    }
  }

  onModuleDestroy() {
    this.dbSubscription?.unsubscribe();
  }

  /**
   * Listens to CompanyEvent creations or entity mutations to trigger continuous reconciliation.
   */
  private async handleEventDrivenReconciliation(event: { model: string; action: string; data: any }) {
    const companyId = event.data?.companyId;
    if (!companyId || typeof companyId !== 'string') return;

    const model = event.model?.toLowerCase();

    if (model === 'companyevent' && event.action === 'create') {
      const type = event.data?.type;
      if (
        [
          'TASK_EXECUTION_COMPLETED',
          'TASK_OUTCOME_VERIFIED',
          'TASK_OUTCOME_REOPENED',
          'DEPARTMENT_HEALTH_UPDATED',
          'AUTHORITY_GRANT_ISSUED',
          'CHAIRMAN_COMMAND_ISSUED',
        ].includes(type)
      ) {
        this.logger.debug(`[${companyId}] Triggering continuous reconciliation for CompanyEvent ${type}`);
        await this.reconcileCompanyState(companyId);
      }
    }
  }

  /**
   * Fully reconciles a company's enterprise state across tasks, projects, departments,
   * workforce, outcomes, and V15 spatial reality. Idempotent and deterministic.
   */
  async reconcileCompanyState(companyId: string): Promise<ReconciliationResult> {
    const errors: string[] = [];
    let reconciledCount = 0;

    try {
      // 1. Reconcile Tasks & Outcomes
      const tasks = await this.prisma.task.findMany({
        where: { companyId },
        include: { evidenceRecords: true },
      });

      for (const task of tasks) {
        try {
          const currentRec = await this.stateService.getCurrentState(companyId, 'TASK', task.id, 'STATUS');
          const statusValue = {
            status: task.status,
            outcomeState: task.outcomeState,
            priority: task.priority,
            assignedEmployeeId: task.assignedEmployeeId,
          };

          // Idempotency: only write if state has changed or not yet recorded
          if (!currentRec || JSON.stringify(currentRec.stateValue) !== JSON.stringify(statusValue)) {
            await this.stateService.recordObservation({
              companyId,
              streamKey: EnterpriseStreamKey.TASKS,
              entityType: 'TASK',
              entityId: task.id,
              stateKey: 'STATUS',
              stateValue: statusValue,
              epistemicStatus:
                task.outcomeState === 'OUTCOME_VERIFIED'
                  ? EpistemicCertainty.VERIFIED_FACT
                  : EpistemicCertainty.FACT,
              source: 'TASK_RECONCILIATION_ENGINE',
              sourceType: 'INTERNAL_SYSTEM',
              evidenceRecordId: task.evidenceRecords[0]?.id,
            });
            reconciledCount++;
          }
        } catch (e: any) {
          errors.push(`Task ${task.id} sync error: ${e.message}`);
        }
      }

      // 2. Reconcile Departments & Health
      const departments = await this.prisma.department.findMany({
        where: { companyId },
        include: { employees: true, healthSnapshots: { orderBy: { timestamp: 'desc' }, take: 1 } },
      });

      for (const dept of departments) {
        try {
          const latestHealth = dept.healthSnapshots[0];
          const deptValue = {
            name: dept.name,
            status: dept.status,
            employeeCount: dept.employees.length,
            healthScore: latestHealth?.overallScore ?? 1.0,
            healthTier: latestHealth?.overallStatus ?? 'HEALTHY',
          };

          const currentRec = await this.stateService.getCurrentState(companyId, 'DEPARTMENT', dept.id, 'HEALTH');
          if (!currentRec || JSON.stringify(currentRec.stateValue) !== JSON.stringify(deptValue)) {
            await this.stateService.recordObservation({
              companyId,
              streamKey: EnterpriseStreamKey.DEPARTMENTS,
              entityType: 'DEPARTMENT',
              entityId: dept.id,
              stateKey: 'HEALTH',
              stateValue: deptValue,
              epistemicStatus: EpistemicCertainty.DERIVED_FACT,
              source: 'DEPARTMENT_HEALTH_ENGINE',
              sourceType: 'INTERNAL_SYSTEM',
            });
            reconciledCount++;
          }
        } catch (e: any) {
          errors.push(`Dept ${dept.id} sync error: ${e.message}`);
        }
      }

      // 3. Reconcile V15 Spatial World State (Phase 6.8)
      const spatialSites = await this.prisma.v12SpatialSite.findMany({
        where: { companyId },
        include: {
          buildings: {
            include: {
              floors: {
                include: {
                  rooms: {
                    include: {
                      workspaces: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      for (const site of spatialSites) {
        try {
          const siteValue = {
            id: site.id,
            name: site.name,
            isActive: site.isActive,
            buildingCount: site.buildings.length,
            totalWorkspaces: site.buildings.reduce(
              (acc, b) => acc + b.floors.reduce((fAcc, f) => fAcc + f.rooms.reduce((rAcc, r) => rAcc + r.workspaces.length, 0), 0),
              0,
            ),
          };

          const currentRec = await this.stateService.getCurrentState(companyId, 'SPATIAL_SITE', site.id, 'TOPOLOGY');
          if (!currentRec || JSON.stringify(currentRec.stateValue) !== JSON.stringify(siteValue)) {
            await this.stateService.recordObservation({
              companyId,
              streamKey: EnterpriseStreamKey.SPATIAL_WORLD,
              entityType: 'SPATIAL_SITE',
              entityId: site.id,
              stateKey: 'TOPOLOGY',
              stateValue: siteValue,
              epistemicStatus: EpistemicCertainty.FACT,
              source: 'V15_SPATIAL_GATEWAY',
              sourceType: 'V15_WORLD',
            });
            reconciledCount++;
          }
        } catch (e: any) {
          errors.push(`Spatial site ${site.id} sync error: ${e.message}`);
        }
      }

      // 4. Run Impossible-State Audit
      const findings = await this.conflictService.auditImpossibleStates(companyId);
      const conflicts = await this.conflictService.getOpenConflicts(companyId);

      this.logger.log(
        `[${companyId}] Reconciliation complete: ${reconciledCount} records synchronized, ${conflicts.length} open conflicts, ${findings.length} findings`,
      );

      return {
        reconciledCount,
        conflictsDetected: conflicts.length,
        integrityFindingsDetected: findings.length,
        replanningTriggered: false,
        errors,
      };
    } catch (e: any) {
      this.logger.error(`[${companyId}] Reconciliation failed: ${e.message}`);
      return {
        reconciledCount,
        conflictsDetected: 0,
        integrityFindingsDetected: 0,
        replanningTriggered: false,
        errors: [...errors, e.message],
      };
    }
  }
}
