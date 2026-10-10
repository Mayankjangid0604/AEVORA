import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DisagreementConsultationDto,
  DisagreementResolutionDto,
  AuthorityTier,
} from './authority-context.types';

@Injectable()
export class ChairmanGovernanceService {
  private readonly logger = new Logger(ChairmanGovernanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Section 4: Chairman Preference Management
   * Preferences guide autonomous decisions within delegated authority,
   * but can NEVER silently become commands, override safety, or override explicit commands.
   */
  async setPreference(dto: {
    companyId: string;
    chairmanId: string;
    domain: string;
    statement: string;
    weight?: number;
  }) {
    // Verify Chairman exists
    const chairman = await this.prisma.chairman.findUnique({
      where: { id: dto.chairmanId },
    });
    if (!chairman) {
      throw new ForbiddenException(`Invalid Chairman identity ${dto.chairmanId}`);
    }

    // Check existing preference in this domain to increment version
    const existing = await this.prisma.chairmanPreference.findFirst({
      where: {
        companyId: dto.companyId,
        chairmanId: dto.chairmanId,
        domain: dto.domain,
      },
      orderBy: { version: 'desc' },
    });

    const nextVersion = existing ? existing.version + 1 : 1;

    const preference = await this.prisma.chairmanPreference.create({
      data: {
        companyId: dto.companyId,
        chairmanId: dto.chairmanId,
        domain: dto.domain,
        statement: dto.statement,
        weight: dto.weight ?? 1.0,
        isBinding: false, // Inviolable rule: Preferences are NEVER binding
        version: nextVersion,
      },
    });

    this.logger.log(`Created Chairman preference v${nextVersion} in domain ${dto.domain} for company ${dto.companyId}`);
    return preference;
  }

  async getActivePreferences(companyId: string, domain?: string) {
    const where: any = { companyId };
    if (domain) {
      where.domain = domain;
    }
    return this.prisma.chairmanPreference.findMany({
      where,
      orderBy: [{ domain: 'asc' }, { version: 'desc' }],
    });
  }

  /**
   * Section 4 & 14: Evaluate instruction priority: Command vs Preference
   * An explicit command ALWAYS outranks preference.
   * AI preferences cannot silently become commands.
   */
  evaluateInstructionPriority(args: {
    hasExplicitCommand: boolean;
    hasPreference: boolean;
    violatesSafety: boolean;
  }): {
    decisionSource: 'EXPLICIT_COMMAND' | 'GUIDED_BY_PREFERENCE' | 'REJECTED';
    reason: string;
  } {
    if (args.violatesSafety) {
      return {
        decisionSource: 'REJECTED',
        reason: 'Constitutional safety rules override all preferences and cannot be bypassed',
      };
    }

    if (args.hasExplicitCommand) {
      return {
        decisionSource: 'EXPLICIT_COMMAND',
        reason: 'Explicit Chairman command outranks all stated or learned preferences',
      };
    }

    if (args.hasPreference) {
      return {
        decisionSource: 'GUIDED_BY_PREFERENCE',
        reason: 'Operating under advisory Chairman preference within delegated autonomy bounds',
      };
    }

    return {
      decisionSource: 'REJECTED',
      reason: 'No authoritative command or valid preference guiding action',
    };
  }

  /**
   * Section 14: AI Disagreement Protocol
   * When Chairman and CEO disagree:
   * 1. Chairman and CEO discuss.
   * 2. Evidence and alternatives are presented.
   * 3. If they reach agreement, proceed according to authority.
   * 4. If no common option exists, consult the relevant higher AI council.
   * 5. AI voting is advisory only.
   * 6. Final decision belongs strictly to Chairman.
   */
  async recordDisagreementConsultation(dto: DisagreementConsultationDto) {
    // Verify Company
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
    });
    if (!company) {
      throw new BadRequestException(`Company ${dto.companyId} not found`);
    }

    // Verify Chairman
    const chairman = await this.prisma.chairman.findUnique({
      where: { id: dto.chairmanId },
    });
    if (!chairman) {
      throw new ForbiddenException(`Invalid Chairman identity ${dto.chairmanId}`);
    }

    const record = await this.prisma.disagreementRecord.create({
      data: {
        companyId: dto.companyId,
        chairmanId: dto.chairmanId,
        ceoId: dto.ceoId || 'ceo_agent',
        topic: dto.topic,
        situation: dto.situation,
        chairmanPosition: dto.chairmanPosition,
        ceoPosition: dto.ceoPosition,
        evidenceIds: dto.evidenceIds ?? [],
        alternativesConsidered: (dto.alternativesConsidered as any) ?? [],
        councilConsulted: dto.councilName ?? null,
        councilVotes: (dto.councilVotes as any) ?? [],
        isCouncilVoteBinding: false, // Mandatory: AI council votes are strictly advisory
        resolved: false,
      },
    });

    this.logger.warn(
      `Disagreement recorded between Chairman ${dto.chairmanId} and CEO on topic "${dto.topic}". Advisory council consultation logged.`,
    );

    return record;
  }

  /**
   * Resolve disagreement with Chairman's sovereign ruling
   */
  async resolveDisagreementWithChairmanRuling(dto: DisagreementResolutionDto) {
    const disagreement = await this.prisma.disagreementRecord.findUnique({
      where: { id: dto.disagreementId },
    });

    if (!disagreement) {
      throw new BadRequestException(`Disagreement record ${dto.disagreementId} not found`);
    }

    if (disagreement.companyId !== dto.companyId) {
      throw new ForbiddenException(`Disagreement does not belong to company ${dto.companyId}`);
    }

    if (disagreement.resolved) {
      return disagreement; // Idempotent resolution
    }

    // Ensure the resolver is indeed the sovereign Chairman
    if (dto.resolverTier !== AuthorityTier.CHAIRMAN) {
      throw new ForbiddenException(
        `Only Chairman (Tier 0) can issue final resolution for an unresolved disagreement. Tier ${dto.resolverTier} denied.`,
      );
    }

    const updated = await this.prisma.disagreementRecord.update({
      where: { id: dto.disagreementId },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        resolutionDecision: dto.resolutionDecision,
        finalCommandId: dto.finalCommandId ?? null,
      },
    });

    this.logger.log(
      `Disagreement ${dto.disagreementId} resolved by Chairman ruling. Final command: ${dto.finalCommandId ?? 'NONE'}`,
    );

    return updated;
  }
}
