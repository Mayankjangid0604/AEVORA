import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EpistemicCertainty } from '@prisma/client';
import { HealthTier } from './enterprise-intelligence.types';

@Injectable()
export class EnterpriseStateHealthService {
  private readonly logger = new Logger(EnterpriseStateHealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Computes multi-dimensional enterprise state health and persists an immutable snapshot.
   */
  async computeStateHealth(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    // 1. Fetch current production state records
    const currentRecords = await this.prisma.enterpriseStateRecord.findMany({
      where: { companyId, isCurrent: true, isSimulation: false },
    });

    const totalRecords = currentRecords.length;

    // 2. Compute metrics
    const staleCount = currentRecords.filter((r) => r.isStale).length;
    const unknownCount = currentRecords.filter((r) => r.epistemicStatus === EpistemicCertainty.UNKNOWN).length;
    const conflictedCount = currentRecords.filter((r) => r.isConflicted).length;
    const withProvenance = currentRecords.filter(
      (r) => r.sourceEventId || r.evidenceRecordId || r.authorityProofId || r.attemptId,
    ).length;

    const freshnessScore = totalRecords > 0 ? Math.max(0, 1 - staleCount / totalRecords) : 1.0;
    const conflictRate = totalRecords > 0 ? conflictedCount / totalRecords : 0.0;
    const unknownRate = totalRecords > 0 ? unknownCount / totalRecords : 0.0;
    const staleRate = totalRecords > 0 ? staleCount / totalRecords : 0.0;
    const provenanceCoverage = totalRecords > 0 ? withProvenance / totalRecords : 1.0;

    // 3. Fetch integrity findings
    const findings = await this.prisma.enterpriseIntegrityFinding.findMany({
      where: { companyId, status: 'DETECTED' },
    });

    const simulationLeakageViolations = findings.filter((f) => f.findingType === 'SIMULATION_LEAKAGE').length;
    const crossCompanyIsolationViolations = findings.filter(
      (f) => f.findingType === 'CROSS_COMPANY_REFERENCE',
    ).length;

    // 4. Fetch unresolved conflicts
    const openConflicts = await this.prisma.enterpriseStateConflict.findMany({
      where: { companyId, resolutionStatus: 'OPEN' },
    });

    // 5. Determine Health Tier
    let healthTier = HealthTier.HEALTHY;
    if (
      simulationLeakageViolations > 0 ||
      crossCompanyIsolationViolations > 0 ||
      conflictRate > 0.25 ||
      staleRate > 0.5
    ) {
      healthTier = HealthTier.CRITICAL;
    } else if (openConflicts.length > 0 || findings.length > 0 || staleRate > 0.2 || freshnessScore < 0.8) {
      healthTier = HealthTier.DEGRADED;
    }

    const completenessScore = totalRecords > 0 ? 0.95 : 0.5;

    // 6. Save persistent snapshot
    const health = await this.prisma.enterpriseStateHealth.create({
      data: {
        companyId,
        completenessScore,
        freshnessScore,
        conflictRate,
        unknownRate,
        staleMaterialStateRate: staleRate,
        provenanceCoverage,
        reconciliationLagMs: 50,
        openIntegrityFindings: findings.length,
        simulationLeakageViolations,
        crossCompanyIsolationViolations,
        unresolvedMaterialConflicts: openConflicts.length,
        healthTier,
        metrics: {
          totalCurrentRecords: totalRecords,
          staleRecordsCount: staleCount,
          unknownRecordsCount: unknownCount,
          conflictedRecordsCount: conflictedCount,
          findingsByType: findings.reduce((acc: any, f) => {
            acc[f.findingType] = (acc[f.findingType] || 0) + 1;
            return acc;
          }, {}),
        },
      },
    });

    this.logger.log(
      `[${companyId}] State health evaluated: ${healthTier} (freshness: ${(freshnessScore * 100).toFixed(1)}%, conflicts: ${openConflicts.length}, findings: ${findings.length})`,
    );

    return health;
  }

  /**
   * Retrieves the latest state health snapshot for a company.
   */
  async getLatestHealth(companyId: string) {
    const latest = await this.prisma.enterpriseStateHealth.findFirst({
      where: { companyId },
      orderBy: { computedAt: 'desc' },
    });

    if (!latest) {
      return this.computeStateHealth(companyId);
    }

    return latest;
  }
}
