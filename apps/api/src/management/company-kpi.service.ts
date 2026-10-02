import { Injectable, ForbiddenException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from './management-audit.service';
import { EmployeeStatus, KpiPeriod, KpiTrend, KpiStatus, KpiMeasurementDirection } from '@prisma/client';
@Injectable()
export class CompanyKpiService {
  private readonly logger = new Logger(CompanyKpiService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ManagementAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async createKPI(companyId: string, actorId: string, dto: {
    name: string;
    description?: string;
    category?: string;
    ownerId: string;
    departmentId?: string;
    objectiveId?: string;
    strategicPlanId?: string;
    strategicInitiativeId?: string;
    period?: KpiPeriod;
    measurementDirection?: KpiMeasurementDirection;
    baseline: number;
    target: number;
    warningThreshold?: number;
    criticalThreshold?: number;
    unit?: string;
    sourceSystem?: string;
    sourceRef?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    if (!Number.isInteger(dto.baseline) || !Number.isInteger(dto.target)) throw new BadRequestException('baseline and target must be integers');

    const owner = await this.prisma.employee.findUnique({ where: { id: dto.ownerId } });
    if (!owner || owner.companyId !== companyId) throw new NotFoundException('KPI owner not found');

    if (dto.departmentId) {
      const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!dept || dept.companyId !== companyId) throw new NotFoundException('Department not found');
    }
    if (dto.objectiveId) {
      const obj = await this.prisma.companyObjective.findUnique({ where: { id: dto.objectiveId } });
      if (!obj || obj.companyId !== companyId) throw new NotFoundException('Objective not found');
    }

    const kpi = await this.prisma.companyKPI.create({
      data: {
        companyId,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        ownerId: dto.ownerId,
        departmentId: dto.departmentId,
        objectiveId: dto.objectiveId,
        strategicPlanId: dto.strategicPlanId,
        strategicInitiativeId: dto.strategicInitiativeId,
        period: dto.period ?? KpiPeriod.MONTHLY,
        measurementDirection: dto.measurementDirection ?? KpiMeasurementDirection.HIGHER_IS_BETTER,
        baseline: dto.baseline,
        target: dto.target,
        warningThreshold: dto.warningThreshold,
        criticalThreshold: dto.criticalThreshold,
        currentValue: dto.baseline,
        previousValue: null,
        progressPercentage: 0,
        unit: dto.unit,
        sourceSystem: dto.sourceSystem,
        sourceRef: dto.sourceRef,
        isAdvisory: true,
        generatedBy: actorId,
      },
    });

    await this.audit.record({ companyId, actorId, action: 'KPI_CREATED', objectType: 'CompanyKPI', objectId: kpi.id, newValue: { name: kpi.name, target: kpi.target } });
    return kpi;
  }

  async updateKPI(companyId: string, actorId: string, kpiId: string, dto: any) {
    await this.verifyActor(actorId, companyId);
    const kpi = await this.prisma.companyKPI.findUnique({ where: { id: kpiId } });
    if (!kpi || kpi.companyId !== companyId) throw new NotFoundException('KPI not found');
    const updated = await this.prisma.companyKPI.update({
      where: { id: kpiId },
      data: dto
    });
    await this.audit.record({ companyId, actorId, action: 'KPI_UPDATED', objectType: 'CompanyKPI', objectId: kpiId, newValue: dto });
    return updated;
  }
  async updateKPIValue(companyId: string, actorId: string, kpiId: string, actualValue: number, isAdvisory = true, periodStart?: Date, periodEnd?: Date) {
    await this.verifyActor(actorId, companyId);
    if (!Number.isInteger(actualValue)) throw new BadRequestException('actualValue must be integer');

    const kpi = await this.prisma.companyKPI.findUnique({ where: { id: kpiId } });
    if (!kpi || kpi.companyId !== companyId) throw new NotFoundException('KPI not found');

    const previousValue = kpi.currentValue;
    const target = kpi.target;
    const direction = kpi.measurementDirection;
    // Compute progress
    let progressPercentage = 0;
    if (direction === KpiMeasurementDirection.HIGHER_IS_BETTER) {
      progressPercentage = target > 0 ? (actualValue / target) * 100 : 0;
    } else if (direction === KpiMeasurementDirection.LOWER_IS_BETTER) {
      progressPercentage = target > 0 ? (target / actualValue) * 100 : 0;
    } else if (direction === KpiMeasurementDirection.TARGET_RANGE) {
      if (kpi.warningThreshold && kpi.criticalThreshold) {
         if (actualValue >= kpi.warningThreshold && actualValue <= kpi.criticalThreshold) {
           progressPercentage = 100;
         } else {
           progressPercentage = 50; // Approximated
         }
      }
    }
    // Compute trend
    let trend: KpiTrend = KpiTrend.STABLE;
    if (previousValue !== null) {
      if (actualValue > previousValue) {
        trend = direction === KpiMeasurementDirection.LOWER_IS_BETTER ? KpiTrend.DECLINING : KpiTrend.IMPROVING;
      } else if (actualValue < previousValue) {
        trend = direction === KpiMeasurementDirection.LOWER_IS_BETTER ? KpiTrend.IMPROVING : KpiTrend.DECLINING;
      }
    } else {
      trend = KpiTrend.INSUFFICIENT_DATA;
    }
    // Compute status
    let status: KpiStatus = KpiStatus.ON_TRACK;
    if (direction === KpiMeasurementDirection.HIGHER_IS_BETTER) {
      if (progressPercentage >= 100) status = KpiStatus.EXCEEDED;
      else if (progressPercentage >= 80) status = KpiStatus.ON_TRACK;
      else if (progressPercentage >= 60) status = KpiStatus.AT_RISK;
      else if (progressPercentage >= 40) status = KpiStatus.OFF_TRACK;
      else status = KpiStatus.CRITICAL;
    } else if (direction === KpiMeasurementDirection.LOWER_IS_BETTER) {
      if (actualValue <= target) status = KpiStatus.EXCEEDED;
      else if (actualValue <= (kpi.warningThreshold ?? target * 1.2)) status = KpiStatus.ON_TRACK;
      else if (actualValue <= (kpi.criticalThreshold ?? target * 1.5)) status = KpiStatus.AT_RISK;
      else status = KpiStatus.CRITICAL;
    } else if (direction === KpiMeasurementDirection.TARGET_RANGE) {
      if (kpi.warningThreshold && kpi.criticalThreshold) {
         if (actualValue >= kpi.warningThreshold && actualValue <= kpi.criticalThreshold) status = KpiStatus.ON_TRACK;
         else status = KpiStatus.OFF_TRACK;
      }
    }

    const updated = await this.prisma.companyKPI.update({
      where: { id: kpiId },
      data: { 
        currentValue: actualValue,
        previousValue,
        progressPercentage,
        trend, 
        status, 
        isAdvisory, 
        periodStart,
        periodEnd,
        generatedBy: actorId 
      },
    });
    // Record Durable History
    await this.prisma.companyKPIMeasurement.create({
      data: {
        kpiId,
        period: kpi.period,
        periodStart,
        periodEnd,
        actualValue,
        targetValue: target,
        progress: progressPercentage,
        status,
        source: kpi.sourceSystem,
      }
    });
    return updated;
  }
  async getKPIs(companyId: string, objectiveId?: string, departmentId?: string) {
    return this.prisma.companyKPI.findMany({
      where: { 
        companyId, 
        ...(objectiveId ? { objectiveId } : {}),
        ...(departmentId ? { departmentId } : {})
      },
      orderBy: { createdAt: 'desc' },
      include: {
        department: true,
        objective: true,
        strategicPlan: true,
      }
    });
  }

  async getKPI(companyId: string, kpiId: string) {
    const kpi = await this.prisma.companyKPI.findUnique({ 
      where: { id: kpiId },
      include: {
        measurements: {
          orderBy: { timestamp: 'desc' },
          take: 12
        }
      }
    });
    if (!kpi || kpi.companyId !== companyId) throw new NotFoundException('KPI not found');
    return kpi;
  }
  async getCompanyKpiDashboard(companyId: string) {
    const kpis = await this.prisma.companyKPI.findMany({
      where: { companyId, isActive: true }
    });
    const total = kpis.length;
    const onTrack = kpis.filter(k => k.status === KpiStatus.ON_TRACK || k.status === KpiStatus.EXCEEDED).length;
    const atRisk = kpis.filter(k => k.status === KpiStatus.AT_RISK).length;
    const offTrack = kpis.filter(k => k.status === KpiStatus.OFF_TRACK).length;
    const critical = kpis.filter(k => k.status === KpiStatus.CRITICAL).length;
    const improving = kpis.filter(k => k.trend === KpiTrend.IMPROVING).length;
    const declining = kpis.filter(k => k.trend === KpiTrend.DECLINING).length;
    const companyWide = kpis.filter(k => !k.departmentId).length;
    const departmentBreakdown = kpis.reduce((acc, kpi) => {
      if (kpi.departmentId) {
        if (!acc[kpi.departmentId]) acc[kpi.departmentId] = { total: 0, onTrack: 0, atRisk: 0, offTrack: 0, critical: 0 };
        acc[kpi.departmentId].total++;
        if (kpi.status === KpiStatus.ON_TRACK || kpi.status === KpiStatus.EXCEEDED) acc[kpi.departmentId].onTrack++;
        if (kpi.status === KpiStatus.AT_RISK) acc[kpi.departmentId].atRisk++;
        if (kpi.status === KpiStatus.OFF_TRACK) acc[kpi.departmentId].offTrack++;
        if (kpi.status === KpiStatus.CRITICAL) acc[kpi.departmentId].critical++;
      }
      return acc;
    }, {} as Record<string, any>);
    const topRisks = kpis.filter(k => k.status === KpiStatus.CRITICAL || k.status === KpiStatus.OFF_TRACK).slice(0, 5);
    return {
      total,
      onTrack,
      atRisk,
      offTrack,
      critical,
      companyWide,
      departmentBreakdown,
      topRisks,
      improving,
      declining
    };
  }
  async setKpiActiveState(companyId: string, actorId: string, kpiId: string, isActive: boolean) {
    await this.verifyActor(actorId, companyId);
    const kpi = await this.prisma.companyKPI.findUnique({ where: { id: kpiId } });
    if (!kpi || kpi.companyId !== companyId) throw new NotFoundException('KPI not found');
    await this.prisma.companyKPI.update({
      where: { id: kpiId },
      data: { isActive }
    });
    await this.audit.record({ companyId, actorId, action: 'KPI_ACTIVATION_UPDATED', objectType: 'CompanyKPI', objectId: kpiId, newValue: { isActive } });
    return { success: true, isActive };
  }
}
