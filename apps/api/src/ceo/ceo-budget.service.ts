import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyBudgetDto, AllocateDepartmentBudgetDto, AdjustDepartmentAllocationDto, BudgetReservationDto, BudgetStatusUpdateDto } from './dto/ceo-budget.dto';
import { BudgetStatus, Prisma } from '@prisma/client';
import { NotificationService, NotificationPriority } from '../communication/notification.service';

@Injectable()
export class CeoBudgetService {
  private readonly logger = new Logger(CeoBudgetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  // ==========================================
  // COMPANY BUDGETS
  // ==========================================

  async getCompanyBudgets(companyId: string) {
    return this.prisma.companyBudget.findMany({
      where: { companyId },
      include: { departmentBudgets: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCompanyBudgetSummary(companyId: string, budgetId: string) {
    const budget = await this.prisma.companyBudget.findUnique({
      where: { id: budgetId, companyId },
      include: { departmentBudgets: { include: { department: true } } },
    });
    if (!budget) throw new NotFoundException('Company budget not found');

    const totalAllocatedToDepartments = budget.departmentBudgets.reduce((acc, db) => acc + db.allocatedAmount, 0);
    const utilization = budget.totalAmount > 0 ? (budget.spentAmount + budget.committedAmount) / budget.totalAmount : 0;
    
    // Forecast (Simple: assume period is days, extrapolate based on created date if active)
    let forecast = budget.spentAmount;
    if (budget.status === 'ACTIVE' && budget.fiscalPeriodStart && budget.fiscalPeriodEnd) {
        const start = budget.fiscalPeriodStart.getTime();
        const end = budget.fiscalPeriodEnd.getTime();
        const now = Date.now();
        if (now > start && now < end) {
            const elapsed = now - start;
            const totalDuration = end - start;
            const dailyRate = budget.spentAmount / elapsed;
            forecast = dailyRate * totalDuration;
        }
    }

    return {
      ...budget,
      remainingAmount: budget.totalAmount - budget.spentAmount - budget.committedAmount,
      utilizationPercentage: utilization * 100,
      totalAllocatedToDepartments,
      unallocatedAmount: budget.totalAmount - totalAllocatedToDepartments,
      forecast: Math.round(forecast),
      variance: budget.totalAmount - forecast,
    };
  }

  async createCompanyBudget(companyId: string, dto: CreateCompanyBudgetDto, actorId: string) {
    const data: Prisma.CompanyBudgetCreateInput = {
      company: { connect: { id: companyId } },
      name: dto.name,
      description: dto.description,
      period: dto.period,
      totalAmount: dto.totalAmount,
      status: 'DRAFT',
      createdBy: actorId,
    };
    if (dto.fiscalPeriodStart) data.fiscalPeriodStart = new Date(dto.fiscalPeriodStart);
    if (dto.fiscalPeriodEnd) data.fiscalPeriodEnd = new Date(dto.fiscalPeriodEnd);

    return this.prisma.companyBudget.create({ data });
  }

  async updateBudgetStatus(companyId: string, budgetId: string, status: BudgetStatus, actorId: string) {
    const budget = await this.prisma.companyBudget.findUnique({ where: { id: budgetId, companyId } });
    if (!budget) throw new NotFoundException('Company budget not found');
    
    // Audit trail
    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'BUDGET_STATUS_CHANGED',
        payload: { budgetId, oldStatus: budget.status, newStatus: status, actorId },
      },
    });

    return this.prisma.companyBudget.update({
      where: { id: budgetId },
      data: { status, approvedBy: status === 'ACTIVE' ? actorId : budget.approvedBy },
    });
  }

  // ==========================================
  // DEPARTMENT ALLOCATIONS
  // ==========================================

  async allocateDepartmentBudget(companyId: string, companyBudgetId: string, dto: AllocateDepartmentBudgetDto, actorId: string) {
    const companyBudget = await this.prisma.companyBudget.findUnique({ where: { id: companyBudgetId, companyId } });
    if (!companyBudget) throw new NotFoundException('Company budget not found');
    if (companyBudget.status !== 'ACTIVE' && companyBudget.status !== 'DRAFT') throw new BadRequestException(`Cannot allocate on ${companyBudget.status} budget`);

    const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId, companyId } });
    if (!dept) throw new NotFoundException('Department not found');

    const newDeptBudget = await this.prisma.departmentBudget.create({
      data: {
        company: { connect: { id: companyId } },
        department: { connect: { id: dto.departmentId } },
        companyBudget: { connect: { id: companyBudgetId } },
        period: companyBudget.period,
        fiscalPeriodStart: companyBudget.fiscalPeriodStart,
        fiscalPeriodEnd: companyBudget.fiscalPeriodEnd,
        allocatedAmount: dto.allocatedAmount,
        notes: dto.notes,
        createdBy: actorId,
        status: companyBudget.status,
      },
    });

    // Update company allocated amount
    await this.prisma.companyBudget.update({
      where: { id: companyBudgetId },
      data: { allocatedAmount: { increment: dto.allocatedAmount } },
    });

    // Audit
    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'BUDGET_ALLOCATED',
        payload: { budgetId: companyBudgetId, departmentId: dto.departmentId, amount: dto.allocatedAmount, actorId },
      },
    });

    return newDeptBudget;
  }

  async adjustDepartmentAllocation(companyId: string, departmentBudgetId: string, dto: AdjustDepartmentAllocationDto, actorId: string) {
    const deptBudget = await this.prisma.departmentBudget.findUnique({ where: { id: departmentBudgetId, companyId } });
    if (!deptBudget) throw new NotFoundException('Department budget not found');
    
    const updated = await this.prisma.departmentBudget.update({
      where: { id: departmentBudgetId },
      data: { allocatedAmount: { increment: dto.amountDelta } },
    });

    if (deptBudget.budgetId) {
      await this.prisma.companyBudget.update({
        where: { id: deptBudget.budgetId },
        data: { allocatedAmount: { increment: dto.amountDelta } },
      });
    }

    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'BUDGET_ADJUSTED',
        payload: { departmentBudgetId, delta: dto.amountDelta, newAmount: updated.allocatedAmount, reason: dto.reason, actorId },
      },
    });

    return updated;
  }

  // ==========================================
  // RESERVATIONS & SPENDING
  // ==========================================

  async createReservation(companyId: string, departmentBudgetId: string, dto: BudgetReservationDto, actorId: string) {
    const deptBudget = await this.prisma.departmentBudget.findUnique({ where: { id: departmentBudgetId, companyId } });
    if (!deptBudget) throw new NotFoundException('Department budget not found');

    const remaining = deptBudget.allocatedAmount - deptBudget.spentAmount - deptBudget.committedAmount;
    if (remaining < dto.amount) {
        throw new BadRequestException('Insufficient remaining budget for reservation');
    }

    const updated = await this.prisma.departmentBudget.update({
      where: { id: departmentBudgetId },
      data: { committedAmount: { increment: dto.amount } },
    });

    if (deptBudget.budgetId) {
      await this.prisma.companyBudget.update({
        where: { id: deptBudget.budgetId },
        data: { committedAmount: { increment: dto.amount } },
      });
    }

    await this.checkThresholds(companyId, departmentBudgetId, updated);

    await this.prisma.companyEvent.create({
      data: { companyId, type: 'BUDGET_RESERVATION_CREATED', payload: { departmentBudgetId, amount: dto.amount, reason: dto.reason, actorId } },
    });

    return updated;
  }

  async releaseReservation(companyId: string, departmentBudgetId: string, amount: number, actorId: string) {
    const deptBudget = await this.prisma.departmentBudget.findUnique({ where: { id: departmentBudgetId, companyId } });
    if (!deptBudget) throw new NotFoundException('Department budget not found');

    if (deptBudget.committedAmount < amount) throw new BadRequestException('Cannot release more than reserved');

    const updated = await this.prisma.departmentBudget.update({
      where: { id: departmentBudgetId },
      data: { committedAmount: { decrement: amount } },
    });

    if (deptBudget.budgetId) {
      await this.prisma.companyBudget.update({
        where: { id: deptBudget.budgetId },
        data: { committedAmount: { decrement: amount } },
      });
    }

    await this.prisma.companyEvent.create({
      data: { companyId, type: 'BUDGET_RESERVATION_RELEASED', payload: { departmentBudgetId, amount, actorId } },
    });

    return updated;
  }

  // To be called when actual spending happens in external services (e.g., payroll, expenses)
  async recordActualSpend(companyId: string, departmentBudgetId: string, amount: number, releaseReservationAmount: number = 0) {
    const deptBudget = await this.prisma.departmentBudget.findUnique({ where: { id: departmentBudgetId, companyId } });
    if (!deptBudget) return;

    let commitDecrement = 0;
    if (releaseReservationAmount > 0) {
        commitDecrement = Math.min(releaseReservationAmount, deptBudget.committedAmount);
    }

    const updated = await this.prisma.departmentBudget.update({
      where: { id: departmentBudgetId },
      data: { 
          spentAmount: { increment: amount },
          committedAmount: { decrement: commitDecrement }
      },
    });

    if (deptBudget.budgetId) {
      await this.prisma.companyBudget.update({
        where: { id: deptBudget.budgetId },
        data: { 
            spentAmount: { increment: amount },
            committedAmount: { decrement: commitDecrement }
        },
      });
    }

    await this.checkThresholds(companyId, departmentBudgetId, updated);
  }

  private async checkThresholds(companyId: string, departmentBudgetId: string, updatedDeptBudget: any) {
      const util = updatedDeptBudget.allocatedAmount > 0 ? (updatedDeptBudget.spentAmount + updatedDeptBudget.committedAmount) / updatedDeptBudget.allocatedAmount : 0;
      
      let alertLevel = null;
      let threshold = 0;
      if (util >= 1.0) { alertLevel = 'BUDGET_EXCEEDED'; threshold = 100; }
      else if (util >= 0.9) { alertLevel = 'URGENT_WARNING'; threshold = 90; }
      else if (util >= 0.75) { alertLevel = 'WARNING'; threshold = 75; }

      if (alertLevel) {
          // check if we recently alerted for this threshold to avoid spam
          const recentAlert = await this.prisma.operationalAlert.findFirst({
              where: {
                  companyId,
                  category: 'FINANCE',
                  title: { contains: `threshold (${threshold}%)` },
                  status: 'ACTIVE',
                  createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) }
              }
          });
          
          if (!recentAlert) {
            await this.prisma.operationalAlert.create({
                data: {
                    companyId,
                    title: `Department Budget Alert: ${alertLevel} at ${Math.round(util*100)}% util (threshold ${threshold}%)`,
                    category: 'FINANCE',
                    severity: util >= 1.0 ? 'CRITICAL' : 'WARNING',
                    description: `Department Budget ${updatedDeptBudget.id} has reached ${Math.round(util*100)}% utilization. Spent: ${updatedDeptBudget.spentAmount}, Reserved: ${updatedDeptBudget.committedAmount}, Allocated: ${updatedDeptBudget.allocatedAmount}`,
                }
            });
            // Notifying Chairman
            const company = await this.prisma.company.findUnique({ where: { id: companyId }});
            if (company?.chairmanId) {
                await this.notifications.createNotification(
                    companyId,
                    company.chairmanId,
                    'FINANCIAL_ALERT',
                    'Budget Threshold Alert',
                    `A department budget has reached ${Math.round(util*100)}% utilization.`,
                    NotificationPriority.HIGH,
                );
            }
          }
      }
  }

  // ==========================================
  // REPORTS
  // ==========================================

  async getDepartmentBudgetReport(companyId: string) {
    const deptBudgets = await this.prisma.departmentBudget.findMany({
        where: { companyId },
        include: { department: true }
    });

    return deptBudgets.map(db => {
        const util = db.allocatedAmount > 0 ? (db.spentAmount + db.committedAmount) / db.allocatedAmount : 0;
        return {
            ...db,
            departmentName: db.department?.name,
            remainingAmount: db.allocatedAmount - db.spentAmount - db.committedAmount,
            utilizationPercentage: util * 100,
        };
    });
  }
}
