import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAuditService } from './financial-audit.service';
import { JournalEntryStatus, FinancialPeriodStatus } from '@prisma/client';

export interface JournalLineDto {
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
  reference?: string;
}

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinancialAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== 'ACTIVE') throw new ForbiddenException('Actor is not active');
    return actor;
  }

  private validateDoubleEntry(lines: JournalLineDto[]) {
    if (lines.length < 2) throw new BadRequestException('Journal entry requires at least 2 lines');
    for (const l of lines) {
      if (l.debit < 0 || l.credit < 0) throw new BadRequestException('Debit and credit must be non-negative integers');
      if (!Number.isInteger(l.debit) || !Number.isInteger(l.credit)) {
        throw new BadRequestException('Debit and credit must be integers (no floating point)');
      }
      if (l.debit > 0 && l.credit > 0) throw new BadRequestException('A single line cannot have both debit and credit');
      if (l.debit === 0 && l.credit === 0) throw new BadRequestException('Each line must have either a debit or credit');
    }
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    if (totalDebit !== totalCredit) {
      throw new BadRequestException(`Double-entry balance violation: debits=${totalDebit} credits=${totalCredit}`);
    }
  }

  private async generateEntryNumber(companyId: string): Promise<string> {
    const count = await this.prisma.journalEntry.count({ where: { companyId } });
    return `JE-${companyId.slice(0, 6).toUpperCase()}-${String(count + 1).padStart(6, '0')}`;
  }

  async createEntry(companyId: string, actorId: string, dto: {
    periodId: string; date: Date; description: string; source: string;
    currency?: string; reference?: string; lines: JournalLineDto[];
  }) {
    await this.verifyActor(actorId, companyId);
    this.validateDoubleEntry(dto.lines);

    const period = await this.prisma.financialPeriod.findUnique({ where: { id: dto.periodId } });
    if (!period || period.companyId !== companyId) throw new NotFoundException('Period not found');
    if (period.status !== FinancialPeriodStatus.OPEN) throw new BadRequestException('Cannot post to a non-OPEN period');

    // Verify all accounts belong to this company
    for (const line of dto.lines) {
      const acct = await this.prisma.financialAccount.findUnique({ where: { id: line.accountId } });
      if (!acct || acct.companyId !== companyId) throw new NotFoundException(`Account ${line.accountId} not found`);
      if (!acct.isActive) throw new BadRequestException(`Account ${line.accountId} is inactive`);
    }

    const entryNumber = await this.generateEntryNumber(companyId);
    const entry = await this.prisma.$transaction(async (tx) => {
      const e = await tx.journalEntry.create({
        data: {
          companyId, periodId: dto.periodId, entryNumber,
          date: dto.date, description: dto.description,
          reference: dto.reference, source: dto.source,
          currency: dto.currency ?? 'INR',
          status: JournalEntryStatus.DRAFT,
          createdById: actorId,
          lines: {
            create: dto.lines.map(l => ({
              accountId: l.accountId, debit: l.debit, credit: l.credit,
              description: l.description, reference: l.reference,
            })),
          },
        },
        include: { lines: true },
      });
      return e;
    });

    await this.audit.record({
      companyId, actorId, action: 'JOURNAL_ENTRY_CREATED',
      objectType: 'JournalEntry', objectId: entry.id,
      newValue: { entryNumber, periodId: dto.periodId, lineCount: dto.lines.length },
    });
    return entry;
  }

  async postEntry(companyId: string, actorId: string, entryId: string) {
    await this.verifyActor(actorId, companyId);
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id: entryId }, include: { lines: true, period: true },
    });
    if (!entry || entry.companyId !== companyId) throw new NotFoundException('Journal entry not found');
    if (entry.status !== JournalEntryStatus.DRAFT) throw new BadRequestException('Only DRAFT entries can be posted');
    if (entry.period.status !== FinancialPeriodStatus.OPEN) throw new BadRequestException('Cannot post to a non-OPEN period');

    // Re-validate double entry before posting (immutability guarantee)
    const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
    if (totalDebit !== totalCredit) throw new BadRequestException('Double-entry balance violation on post');

    const posted = await this.prisma.journalEntry.update({
      where: { id: entryId },
      data: { status: JournalEntryStatus.POSTED, postedById: actorId, postedAt: new Date() },
    });
    await this.audit.record({
      companyId, actorId, action: 'JOURNAL_ENTRY_POSTED',
      objectType: 'JournalEntry', objectId: entryId,
      oldValue: { status: 'DRAFT' }, newValue: { status: 'POSTED', postedAt: posted.postedAt },
    });
    return posted;
  }

  async reverseEntry(companyId: string, actorId: string, entryId: string, dto: {
    date: Date; description: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id: entryId }, include: { lines: true, period: true },
    });
    if (!entry || entry.companyId !== companyId) throw new NotFoundException('Journal entry not found');
    if (entry.status !== JournalEntryStatus.POSTED) throw new BadRequestException('Only POSTED entries can be reversed');

    // Find an OPEN period for the reversal
    const openPeriod = await this.prisma.financialPeriod.findFirst({
      where: { companyId, status: FinancialPeriodStatus.OPEN },
      orderBy: { startDate: 'asc' },
    });
    if (!openPeriod) throw new BadRequestException('No OPEN period available for reversal');

    const reversalNumber = await this.generateEntryNumber(companyId);
    const reversal = await this.prisma.$transaction(async (tx) => {
      // Mark original as REVERSED
      await tx.journalEntry.update({
        where: { id: entryId },
        data: { status: JournalEntryStatus.REVERSED },
      });
      // Create mirror entry with swapped debits/credits
      return tx.journalEntry.create({
        data: {
          companyId, periodId: openPeriod.id, entryNumber: reversalNumber,
          date: dto.date, description: dto.description,
          source: 'REVERSAL', currency: entry.currency,
          status: JournalEntryStatus.POSTED, reversalOf: entryId,
          createdById: actorId, postedById: actorId, postedAt: new Date(),
          lines: {
            create: entry.lines.map(l => ({
              accountId: l.accountId,
              debit: l.credit,
              credit: l.debit,
              description: `Reversal: ${l.description ?? ''}`,
            })),
          },
        },
        include: { lines: true },
      });
    });

    await this.audit.record({
      companyId, actorId, action: 'JOURNAL_ENTRY_REVERSED',
      objectType: 'JournalEntry', objectId: entryId,
      newValue: { reversalEntryId: reversal.id, reversalNumber },
    });
    return reversal;
  }

  async getEntries(companyId: string, filters?: { periodId?: string; status?: JournalEntryStatus }) {
    return this.prisma.journalEntry.findMany({
      where: { companyId, ...filters },
      include: { lines: true },
      orderBy: { date: 'desc' },
    });
  }

  async getEntry(companyId: string, entryId: string) {
    const e = await this.prisma.journalEntry.findUnique({
      where: { id: entryId }, include: { lines: true },
    });
    if (!e || e.companyId !== companyId) throw new NotFoundException('Journal entry not found');
    return e;
  }
}
