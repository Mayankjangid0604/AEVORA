import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementDecisionType, ManagementDecisionStatus } from '@prisma/client';
import { TaskService } from '../task/task.service';
import { EconomyService } from '../economy/economy.service';
import { DisciplineService } from './discipline.service';
import { WorkloadService } from './workload.service';
import { CODE_CHANGE_PATH_OK } from '../common/code-change';

const run = promisify(execFile);

@Injectable()
export class ManagementDecisionService {
  private readonly logger = new Logger(ManagementDecisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskService: TaskService,
    private readonly economyService: EconomyService,
    private readonly disciplineService: DisciplineService,
    private readonly workloadService: WorkloadService,
  ) {}

  async proposeDecision(
    companyId: string,
    proposerId: string,
    type: ManagementDecisionType,
    title: string,
    description: string,
    targetEmployeeId?: string,
    payload: any = {},
  ) {
    const decision = await this.prisma.managementDecision.create({
      data: {
        companyId,
        proposerId,
        type,
        title,
        description,
        targetEmployeeId,
        payload,
        status: ManagementDecisionStatus.PROPOSED,
      },
    });

    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'MANAGEMENT_DECISION_CREATED',
        payload: { decisionId: decision.id, type, proposerId, targetEmployeeId },
      },
    });

    return decision;
  }

  async approveDecision(decisionId: string, approverId: string, approverCompanyId: string) {
    const decision = await this.prisma.managementDecision.findUnique({
      where: { id: decisionId },
    });

    if (!decision) throw new NotFoundException('Decision not found');
    if (decision.companyId !== approverCompanyId) {
      throw new ForbiddenException('Cannot approve decision for another company');
    }
    if (decision.status !== ManagementDecisionStatus.PROPOSED) {
      throw new BadRequestException('Decision is not in PROPOSED state');
    }

    // Execute based on type
    switch (decision.type) {
      case 'WORKLOAD_REBALANCING':
        await this.executeWorkloadRebalance(decision, approverId);
        break;
      case 'PROMOTION':
        await this.executePromotion(decision);
        break;
      case 'BONUS':
        await this.executeBonus(decision);
        break;
      case 'DISCIPLINE':
        await this.executeDiscipline(decision, approverId);
        break;

      // HIRING, etc. can just be marked approved for now
    }

    const updated = await this.prisma.managementDecision.update({
      where: { id: decisionId },
      data: {
        status: ManagementDecisionStatus.APPROVED,
        approvedBy: approverId,
        approvedAt: new Date(),
      },
    });

    await this.prisma.companyEvent.create({
      data: {
        companyId: decision.companyId,
        type: 'MANAGEMENT_DECISION_APPROVED',
        payload: { decisionId, type: decision.type, approverId },
      },
    });

    return updated;
  }

  private async executeWorkloadRebalance(decision: any, approverId: string) {
    // Expected payload: { taskId: string, newAssigneeId: string }
    const { taskId, newAssigneeId } = decision.payload as any;
    if (taskId && newAssigneeId) {
      await this.workloadService.reassignTask(
        decision.companyId,
        taskId,
        newAssigneeId,
        approverId
      );
    }
  }

  private async executePromotion(decision: any) {
    // Expected payload: { newRoleId: string }
    const { newRoleId } = decision.payload as any;
    if (decision.targetEmployeeId && newRoleId) {
      await this.prisma.employee.update({
        where: { id: decision.targetEmployeeId },
        data: { roleId: newRoleId },
      });
    }
  }

  private async executeBonus(decision: any) {
    // Expected payload: { amount: number }
    const { amount } = decision.payload as any;
    if (decision.targetEmployeeId && amount) {
      // Find company wallet and employee wallet
      const companyWallet = await this.prisma.aCWallet.findUnique({ where: { companyId: decision.companyId } });
      const employeeWallet = await this.prisma.aCWallet.findUnique({ where: { employeeId: decision.targetEmployeeId } });

      if (companyWallet && employeeWallet) {
        await this.economyService.transferAC(
          companyWallet.id,
          employeeWallet.id,
          amount,
          `Bonus: ${decision.title}`,
          decision.id
        );
      }
    }
  }

  private async executeDiscipline(decision: any, _approverId: string) {
    const { severity, reason } = decision.payload as any;
    if (decision.targetEmployeeId && severity) {
      await this.disciplineService.issueDisciplinaryAction(
        decision.companyId,
        decision.proposerId,
        decision.targetEmployeeId,
        severity,
        reason || decision.description || 'No reason provided'
      );
    }
  }

  /** Item 5: the only point where an idle agent's proposed code change ever touches disk — only after the Chairman
   * approves it here. Applied to an isolated `git worktree` on its own branch, committed locally, never pushed. */
  private async executeCodeChange(decision: any) {
    const repoRoot = process.env.AGENT_CODEGEN_REPO_ROOT;
    if (!repoRoot) throw new BadRequestException('AGENT_CODEGEN_REPO_ROOT is not configured; cannot apply code changes');

    const { summary, files } = decision.payload as { summary?: string; files?: { path: string; content: string }[] };
    const safeFiles = (Array.isArray(files) ? files : []).filter((f) => CODE_CHANGE_PATH_OK(f?.path) && typeof f?.content === 'string').slice(0, 2);
    if (!summary || safeFiles.length === 0) throw new BadRequestException('Code change proposal has no valid files');

    const proposer = await this.prisma.employee.findUnique({ where: { id: decision.proposerId }, select: { name: true } });
    const slug = (proposer?.name ?? 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'agent';
    const branch = `agent/${slug}/${Date.now()}`;
    const worktreeDir = path.join(os.tmpdir(), 'aevora-agent-worktrees', branch.replace(/\//g, '_'));

    await run('git', ['worktree', 'add', '-b', branch, worktreeDir, 'HEAD'], { cwd: repoRoot });
    try {
      for (const f of safeFiles) {
        const dest = path.join(worktreeDir, f.path);
        if (!dest.startsWith(worktreeDir + path.sep)) continue; // belt-and-braces against path escape
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, f.content, 'utf8');
      }
      await run('git', ['add', '-A'], { cwd: worktreeDir });
      await run('git', ['commit', '-m', `${summary} (agent: ${proposer?.name ?? decision.proposerId})`.slice(0, 200)], { cwd: worktreeDir });
      this.logger.log(`Chairman-approved code change committed to local branch ${branch} (not pushed)`);
    } finally {
      await run('git', ['worktree', 'remove', '--force', worktreeDir], { cwd: repoRoot }).catch(() => {});
    }
  }

  async rejectDecision(decisionId: string, approverId: string, approverCompanyId: string) {
    const decision = await this.prisma.managementDecision.findUnique({
      where: { id: decisionId },
    });

    if (!decision) throw new NotFoundException('Decision not found');
    if (decision.companyId !== approverCompanyId) {
      throw new ForbiddenException('Cannot reject decision for another company');
    }

    const updated = await this.prisma.managementDecision.update({
      where: { id: decisionId },
      data: {
        status: ManagementDecisionStatus.REJECTED,
      },
    });

    await this.prisma.companyEvent.create({
      data: {
        companyId: updated.companyId,
        type: 'MANAGEMENT_DECISION_REJECTED',
        payload: { decisionId, type: updated.type, approverId },
      },
    });

    return updated;
  }
}
