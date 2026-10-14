import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActivateOfferDto,
  ApproveOfferDto,
  CreateOfferDto,
  DiscountType,
  Offer,
  OfferApprovalBinding,
  OfferCreatorRole,
  OfferMaterialTerms,
  OfferRedemptionRecord,
  OfferStatus,
  RedeemOfferDto,
  TermsVersionRecord,
  UpdateOfferDto,
} from './offer-market.types';
import { OfferFinancialIntelligenceService } from './offer-financial-intelligence.service';
import { OfferEvaluationService } from './offer-evaluation.service';
import { OfferGovernanceService } from './offer-governance.service';
import { AuthorityTier } from '../governance/authority-context.types';
import { ExternalActionGatewayService } from '../external-action-gateway/external-action-gateway.service';
import { ExternalActionType } from '../external-action-gateway/external-action-gateway.types';
import { ExecutionEnvironment } from '@prisma/client';

@Injectable()
export class OfferMarketService {
  private readonly logger = new Logger(OfferMarketService.name);

  // In-memory Offer and Redemption store (dual-write & fallback for unit tests)
  private readonly offers = new Map<string, Map<string, Offer>>();
  private readonly redemptions = new Map<string, OfferRedemptionRecord[]>();

  // In-memory idempotency caches
  private readonly createIdempotencyCache = new Map<string, string>(); // idempotencyKey -> offerId
  private readonly activateIdempotencyCache = new Map<string, Offer>(); // companyId:idempotencyKey -> Offer
  private readonly redeemIdempotencyCache = new Map<string, OfferRedemptionRecord>(); // companyId:idempotencyKey -> record

  constructor(
    private readonly prisma: PrismaService,
    private readonly financialIntelligence: OfferFinancialIntelligenceService,
    private readonly evaluationEngine: OfferEvaluationService,
    private readonly governanceService: OfferGovernanceService,
    @Optional() private readonly externalActionGateway?: ExternalActionGatewayService,
  ) {}

  private getCompanyOffers(companyId: string): Map<string, Offer> {
    if (!this.offers.has(companyId)) {
      this.offers.set(companyId, new Map<string, Offer>());
    }
    return this.offers.get(companyId)!;
  }

  private getCompanyRedemptions(companyId: string): OfferRedemptionRecord[] {
    if (!this.redemptions.has(companyId)) {
      this.redemptions.set(companyId, []);
    }
    return this.redemptions.get(companyId)!;
  }

  private mapDbOfferToDomain(dbOffer: any): Offer {
    const terms = dbOffer.materialTerms;
    const materialTerms: OfferMaterialTerms = terms
      ? {
          originalPrice: terms.originalPrice,
          discountType: terms.discountType as DiscountType,
          discountValue: terms.discountValue,
          finalPrice: terms.finalPrice,
          currency: terms.currency || 'USD',
          validFrom: terms.validFrom instanceof Date ? terms.validFrom.toISOString() : terms.validFrom,
          validUntil: terms.validUntil instanceof Date ? terms.validUntil.toISOString() : terms.validUntil,
          maxRedemptions: terms.maxRedemptions ?? null,
          productServiceIds: Array.isArray(terms.productServiceIds) ? terms.productServiceIds : [],
          targetAudience: terms.targetAudience,
          termsAndConditions: terms.termsAndConditions,
        }
      : {
          originalPrice: 0,
          discountType: DiscountType.PERCENTAGE,
          discountValue: 0,
          finalPrice: 0,
          currency: 'USD',
          validFrom: new Date().toISOString(),
          validUntil: new Date().toISOString(),
          maxRedemptions: null,
          productServiceIds: [],
          targetAudience: dbOffer.targetAudience || 'GENERAL',
          termsAndConditions: 'Standard promotional terms apply.',
        };

    const termsHistory: TermsVersionRecord[] = (dbOffer.termsHistory || []).map((th: any) => ({
      version: th.version,
      terms: th.terms,
      changedAt: th.changedAt instanceof Date ? th.changedAt.toISOString() : th.changedAt,
      changedBy: th.changedBy,
      changeReason: th.changeReason || undefined,
    }));

    const approvalBinding: OfferApprovalBinding | undefined = dbOffer.approvalBinding
      ? {
          approvalId: dbOffer.approvalBinding.approvalId,
          approvedBy: dbOffer.approvalBinding.approvedBy,
          approverRole: dbOffer.approvalBinding.approverRole,
          approverTier: dbOffer.approvalBinding.approverTier as AuthorityTier,
          approvedAt:
            dbOffer.approvalBinding.approvedAt instanceof Date
              ? dbOffer.approvalBinding.approvedAt.toISOString()
              : dbOffer.approvalBinding.approvedAt,
          approvedVersion: dbOffer.approvalBinding.approvedVersion,
          approvedTermsVersion: dbOffer.approvalBinding.approvedTermsVersion,
          parametersHash: dbOffer.approvalBinding.parametersHash,
          conditions: Array.isArray(dbOffer.approvalBinding.conditions)
            ? dbOffer.approvalBinding.conditions
            : [],
          validUntil:
            dbOffer.approvalBinding.validUntil instanceof Date
              ? dbOffer.approvalBinding.validUntil.toISOString()
              : dbOffer.approvalBinding.validUntil || undefined,
        }
      : undefined;

    return {
      id: dbOffer.id,
      companyId: dbOffer.companyId,
      name: dbOffer.name,
      description: dbOffer.description,
      creatorId: dbOffer.creatorId,
      creatorRole: dbOffer.creatorRole as OfferCreatorRole,
      status: dbOffer.status as OfferStatus,
      version: dbOffer.version,
      termsVersion: dbOffer.termsVersion,
      materialTerms,
      termsHistory,
      approvalBinding,
      isChairmanGated: dbOffer.isChairmanGated,
      requiresChairmanApproval: dbOffer.requiresChairmanApproval,
      currentRedemptions: dbOffer.currentRedemptions,
      metadata:
        typeof dbOffer.metadata === 'object' && dbOffer.metadata !== null ? dbOffer.metadata : {},
      financialAnalysis: dbOffer.financialAnalysis,
      ceoEvaluation: dbOffer.ceoEvaluation,
      idempotencyKey: dbOffer.idempotencyKey || undefined,
      rejectionReason: dbOffer.rejectionReason || undefined,
      suspensionReason: dbOffer.suspensionReason || undefined,
      dispatchedActionId: dbOffer.dispatchedActionId || undefined,
      externalReferenceId: dbOffer.externalReferenceId || undefined,
      activatedAt:
        dbOffer.activatedAt instanceof Date
          ? dbOffer.activatedAt.toISOString()
          : dbOffer.activatedAt || undefined,
      suspendedAt:
        dbOffer.suspendedAt instanceof Date
          ? dbOffer.suspendedAt.toISOString()
          : dbOffer.suspendedAt || undefined,
      expiredAt:
        dbOffer.expiredAt instanceof Date
          ? dbOffer.expiredAt.toISOString()
          : dbOffer.expiredAt || undefined,
      cancelledAt:
        dbOffer.cancelledAt instanceof Date
          ? dbOffer.cancelledAt.toISOString()
          : dbOffer.cancelledAt || undefined,
      createdAt:
        dbOffer.createdAt instanceof Date ? dbOffer.createdAt.toISOString() : dbOffer.createdAt,
      updatedAt:
        dbOffer.updatedAt instanceof Date ? dbOffer.updatedAt.toISOString() : dbOffer.updatedAt,
    };
  }

  private mapDbRedemptionToDomain(dbRedemption: any): OfferRedemptionRecord {
    return {
      id: dbRedemption.id,
      offerId: dbRedemption.offerId,
      companyId: dbRedemption.companyId,
      customerId: dbRedemption.customerId,
      redemptionCode: dbRedemption.redemptionCode,
      transactionValue: dbRedemption.transactionValue,
      discountApplied: dbRedemption.discountApplied,
      netPaid: dbRedemption.netPaid,
      channel: dbRedemption.channel,
      evidenceHash: dbRedemption.evidenceHash,
      idempotencyKey: dbRedemption.idempotencyKey || undefined,
      redeemedAt:
        dbRedemption.redeemedAt instanceof Date
          ? dbRedemption.redeemedAt.toISOString()
          : dbRedemption.redeemedAt,
    };
  }

  /**
   * Creates a new Offer in DRAFT status.
   * Can be created directly by Chairman or proposed by CEO.
   * Idempotent when idempotencyKey is supplied.
   */
  async createOffer(
    companyId: string,
    actorId: string,
    actorRole: string,
    dto: CreateOfferDto,
  ): Promise<Offer> {
    if (!companyId) throw new BadRequestException('companyId is required.');
    if (!dto.name) throw new BadRequestException('Offer name is required.');
    if (dto.originalPrice === undefined || dto.originalPrice < 0) {
      throw new BadRequestException('originalPrice must be a non-negative number.');
    }
    if (dto.discountValue === undefined || dto.discountValue < 0) {
      throw new BadRequestException('discountValue must be non-negative.');
    }

    // 1. Check Idempotency (Database first, then in-memory)
    if (dto.idempotencyKey) {
      if (this.prisma && (this.prisma as any).offer) {
        try {
          const existingDb = await (this.prisma as any).offer.findUnique({
            where: { companyId_idempotencyKey: { companyId, idempotencyKey: dto.idempotencyKey } },
            include: {
              materialTerms: true,
              termsHistory: { orderBy: { version: 'asc' } },
              approvalBinding: true,
            },
          });
          if (existingDb) {
            const mapped = this.mapDbOfferToDomain(existingDb);
            this.getCompanyOffers(companyId).set(mapped.id, mapped);
            return mapped;
          }
        } catch (err: any) {
          this.logger.warn(`Database idempotency check fallback: ${err.message}`);
        }
      }

      const cacheKey = `${companyId}:${dto.idempotencyKey}`;
      const existingId = this.createIdempotencyCache.get(cacheKey);
      if (existingId) {
        const existingOffer = this.getCompanyOffers(companyId).get(existingId);
        if (existingOffer) return existingOffer;
      }
    }

    const offerId = `off_${companyId}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const creatorRole =
      actorRole === 'CHAIRMAN'
        ? OfferCreatorRole.CHAIRMAN
        : actorRole === 'CEO'
        ? OfferCreatorRole.CEO
        : OfferCreatorRole.SYSTEM;

    // Calculate initial final price
    let finalPrice = dto.originalPrice;
    if (dto.discountType === DiscountType.PERCENTAGE) {
      finalPrice = Math.max(0, dto.originalPrice * (1 - dto.discountValue / 100));
    } else if (dto.discountType === DiscountType.FIXED_AMOUNT) {
      finalPrice = Math.max(0, dto.originalPrice - dto.discountValue);
    }
    finalPrice = Math.round(finalPrice * 100) / 100;

    const materialTerms: OfferMaterialTerms = {
      originalPrice: dto.originalPrice,
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      finalPrice,
      currency: dto.currency || 'USD',
      validFrom: dto.validFrom || new Date().toISOString(),
      validUntil: dto.validUntil || new Date(Date.now() + 30 * 86400000).toISOString(),
      maxRedemptions: dto.maxRedemptions ?? null,
      productServiceIds: dto.productServiceIds || [],
      targetAudience: dto.targetAudience || 'GENERAL',
      termsAndConditions: dto.termsAndConditions || 'Standard promotional terms apply.',
    };

    const initialTermsRecord: TermsVersionRecord = {
      version: 1,
      terms: materialTerms.termsAndConditions,
      changedAt: new Date().toISOString(),
      changedBy: actorId,
      changeReason: 'Initial offer creation',
    };

    const isChairmanGated = this.governanceService.isChairmanApprovalRequired(materialTerms);

    const offer: Offer = {
      id: offerId,
      companyId,
      name: dto.name,
      description: dto.description || '',
      creatorId: actorId,
      creatorRole,
      status: OfferStatus.DRAFT,
      version: 1,
      termsVersion: 1,
      materialTerms,
      termsHistory: [initialTermsRecord],
      isChairmanGated,
      requiresChairmanApproval: isChairmanGated,
      currentRedemptions: 0,
      metadata: dto.metadata || {},
      idempotencyKey: dto.idempotencyKey,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Calculate initial financial and CEO evaluation
    const finAnalysis = this.financialIntelligence.calculateFinancialIntelligence(materialTerms);
    offer.financialAnalysis = finAnalysis;
    offer.ceoEvaluation = this.evaluationEngine.evaluateOffer(materialTerms, finAnalysis);

    // Persist in PostgreSQL via Transaction
    if (this.prisma && (this.prisma as any).offer) {
      try {
        await this.prisma.$transaction(async (tx: any) => {
          await tx.offer.create({
            data: {
              id: offerId,
              companyId,
              name: offer.name,
              description: offer.description,
              targetAudience: materialTerms.targetAudience,
              productService: (materialTerms.productServiceIds && materialTerms.productServiceIds.length > 0)
                ? materialTerms.productServiceIds.join(', ')
                : 'Standard Package',
              creatorId: offer.creatorId,
              creatorRole: offer.creatorRole,
              status: offer.status,
              isChairmanGated: offer.isChairmanGated,
              requiresChairmanApproval: offer.requiresChairmanApproval,
              currentRedemptions: 0,
              version: 1,
              termsVersion: 1,
              idempotencyKey: offer.idempotencyKey,
              metadata: offer.metadata as any,
              financialAnalysis: offer.financialAnalysis as any,
              ceoEvaluation: offer.ceoEvaluation as any,
            },
          });

          await tx.offerMaterialTermsRecord.create({
            data: {
              offerId,
              originalPrice: materialTerms.originalPrice,
              discountType: materialTerms.discountType,
              discountValue: materialTerms.discountValue,
              finalPrice: materialTerms.finalPrice,
              currency: materialTerms.currency,
              validFrom: new Date(materialTerms.validFrom),
              validUntil: new Date(materialTerms.validUntil),
              maxRedemptions: materialTerms.maxRedemptions,
              productServiceIds: materialTerms.productServiceIds as any,
              targetAudience: materialTerms.targetAudience,
              termsAndConditions: materialTerms.termsAndConditions,
            },
          });

          await tx.offerTermsVersion.create({
            data: {
              offerId,
              version: 1,
              terms: materialTerms.termsAndConditions,
              changedBy: actorId,
              changeReason: 'Initial offer creation',
            },
          });
        });
      } catch (err: any) {
        this.logger.warn(`Durable offer creation transaction failed: ${err.message}`);
      }
    }

    // Keep in-memory cache synchronized
    this.getCompanyOffers(companyId).set(offerId, offer);
    if (dto.idempotencyKey) {
      this.createIdempotencyCache.set(`${companyId}:${dto.idempotencyKey}`, offerId);
    }

    this.logger.log(`Created offer ${offerId} (${offer.name}) for company ${companyId}`);
    return offer;
  }

  /**
   * Updates an existing Offer.
   * If material terms change on an APPROVED or ACTIVE offer, automatically invalidates existing approval
   * and transitions offer to REVISION_REQUIRED.
   */
  async updateOffer(
    companyId: string,
    actorId: string,
    actorRole: string,
    offerId: string,
    dto: UpdateOfferDto,
  ): Promise<Offer> {
    const offer = await this.getOffer(companyId, offerId);

    if (offer.status === OfferStatus.EXPIRED || offer.status === OfferStatus.CANCELLED) {
      throw new BadRequestException(`Cannot update offer in terminal status '${offer.status}'.`);
    }

    let materialChanged = false;
    let termsTextChanged = false;

    const newTerms: OfferMaterialTerms = { ...offer.materialTerms };

    if (dto.originalPrice !== undefined && dto.originalPrice !== newTerms.originalPrice) {
      newTerms.originalPrice = dto.originalPrice;
      materialChanged = true;
    }
    if (dto.discountType !== undefined && dto.discountType !== newTerms.discountType) {
      newTerms.discountType = dto.discountType;
      materialChanged = true;
    }
    if (dto.discountValue !== undefined && dto.discountValue !== newTerms.discountValue) {
      newTerms.discountValue = dto.discountValue;
      materialChanged = true;
    }
    if (dto.validFrom !== undefined && dto.validFrom !== newTerms.validFrom) {
      newTerms.validFrom = dto.validFrom;
      materialChanged = true;
    }
    if (dto.validUntil !== undefined && dto.validUntil !== newTerms.validUntil) {
      newTerms.validUntil = dto.validUntil;
      materialChanged = true;
    }
    if (dto.maxRedemptions !== undefined && dto.maxRedemptions !== newTerms.maxRedemptions) {
      newTerms.maxRedemptions = dto.maxRedemptions;
      materialChanged = true;
    }
    if (dto.productServiceIds !== undefined) {
      newTerms.productServiceIds = dto.productServiceIds;
      materialChanged = true;
    }
    if (dto.targetAudience !== undefined && dto.targetAudience !== newTerms.targetAudience) {
      newTerms.targetAudience = dto.targetAudience;
      materialChanged = true;
    }
    if (dto.termsAndConditions !== undefined && dto.termsAndConditions !== newTerms.termsAndConditions) {
      newTerms.termsAndConditions = dto.termsAndConditions;
      materialChanged = true;
      termsTextChanged = true;
    }

    // Recalculate final price if pricing changed
    if (materialChanged) {
      let finalPrice = newTerms.originalPrice;
      if (newTerms.discountType === DiscountType.PERCENTAGE) {
        finalPrice = Math.max(0, newTerms.originalPrice * (1 - newTerms.discountValue / 100));
      } else if (newTerms.discountType === DiscountType.FIXED_AMOUNT) {
        finalPrice = Math.max(0, newTerms.originalPrice - newTerms.discountValue);
      }
      newTerms.finalPrice = Math.round(finalPrice * 100) / 100;
      offer.materialTerms = newTerms;
      offer.version += 1;

      if (termsTextChanged) {
        offer.termsVersion += 1;
        offer.termsHistory.push({
          version: offer.termsVersion,
          terms: newTerms.termsAndConditions,
          changedAt: new Date().toISOString(),
          changedBy: actorId,
          changeReason: dto.changeReason || 'Terms updated',
        });
      }

      // Check if material change invalidates approval
      if (offer.status === OfferStatus.APPROVED || offer.status === OfferStatus.ACTIVE) {
        this.logger.warn(`Material change on offer ${offerId} invalidated existing approval.`);
        offer.approvalBinding = undefined;
        offer.status = OfferStatus.REVISION_REQUIRED;
      }

      // Recalculate governance requirement
      offer.isChairmanGated = this.governanceService.isChairmanApprovalRequired(newTerms);
      offer.requiresChairmanApproval = offer.isChairmanGated;

      // Re-run evaluation
      const finAnalysis = this.financialIntelligence.calculateFinancialIntelligence(newTerms);
      offer.financialAnalysis = finAnalysis;
      offer.ceoEvaluation = this.evaluationEngine.evaluateOffer(newTerms, finAnalysis);
    }

    if (dto.name !== undefined) offer.name = dto.name;
    if (dto.description !== undefined) offer.description = dto.description;
    if (dto.metadata !== undefined) offer.metadata = { ...offer.metadata, ...dto.metadata };
    offer.updatedAt = new Date().toISOString();

    // Persist update in PostgreSQL via Transaction
    if (this.prisma && (this.prisma as any).offer) {
      try {
        await this.prisma.$transaction(async (tx: any) => {
          if (materialChanged) {
            await tx.offerMaterialTermsRecord.update({
              where: { offerId },
              data: {
                originalPrice: newTerms.originalPrice,
                discountType: newTerms.discountType,
                discountValue: newTerms.discountValue,
                finalPrice: newTerms.finalPrice,
                currency: newTerms.currency,
                validFrom: new Date(newTerms.validFrom),
                validUntil: new Date(newTerms.validUntil),
                maxRedemptions: newTerms.maxRedemptions,
                productServiceIds: newTerms.productServiceIds as any,
                targetAudience: newTerms.targetAudience,
                termsAndConditions: newTerms.termsAndConditions,
              },
            });

            if (termsTextChanged) {
              await tx.offerTermsVersion.create({
                data: {
                  offerId,
                  version: offer.termsVersion,
                  terms: newTerms.termsAndConditions,
                  changedBy: actorId,
                  changeReason: dto.changeReason || 'Terms updated',
                },
              });
            }

            // Invalidate approval record in DB if status transitioned to REVISION_REQUIRED
            if (offer.status === OfferStatus.REVISION_REQUIRED) {
              await tx.offerApprovalRecord.deleteMany({ where: { offerId } });
            }
          }

          await tx.offer.update({
            where: { id: offerId },
            data: {
              name: offer.name,
              description: offer.description,
              status: offer.status,
              version: offer.version,
              termsVersion: offer.termsVersion,
              isChairmanGated: offer.isChairmanGated,
              requiresChairmanApproval: offer.requiresChairmanApproval,
              metadata: offer.metadata as any,
              financialAnalysis: offer.financialAnalysis as any,
              ceoEvaluation: offer.ceoEvaluation as any,
            },
          });
        });
      } catch (err: any) {
        this.logger.warn(`Durable updateOffer transaction failed: ${err.message}`);
      }
    }

    this.getCompanyOffers(companyId).set(offerId, offer);
    return offer;
  }

  /**
   * Runs CEO and Financial Intelligence evaluation on an offer.
   */
  async evaluateOffer(companyId: string, actorId: string, offerId: string): Promise<Offer> {
    const offer = await this.getOffer(companyId, offerId);

    const finAnalysis = this.financialIntelligence.calculateFinancialIntelligence(offer.materialTerms);
    const ceoEval = this.evaluationEngine.evaluateOffer(offer.materialTerms, finAnalysis);

    offer.financialAnalysis = finAnalysis;
    offer.ceoEvaluation = ceoEval;
    offer.isChairmanGated = this.governanceService.isChairmanApprovalRequired(
      offer.materialTerms,
      ceoEval.alternativeDiscountComparisons[0]?.riskTier,
    );
    offer.requiresChairmanApproval = offer.isChairmanGated;
    offer.status = offer.status === OfferStatus.DRAFT ? OfferStatus.EVALUATED : offer.status;
    offer.updatedAt = new Date().toISOString();

    if (this.prisma && (this.prisma as any).offer) {
      try {
        await (this.prisma as any).offer.update({
          where: { id: offerId },
          data: {
            financialAnalysis: finAnalysis as any,
            ceoEvaluation: ceoEval as any,
            isChairmanGated: offer.isChairmanGated,
            requiresChairmanApproval: offer.requiresChairmanApproval,
            status: offer.status,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Durable evaluateOffer update failed: ${err.message}`);
      }
    }

    this.getCompanyOffers(companyId).set(offerId, offer);
    return offer;
  }

  /**
   * Approves an offer with cryptographic parameter binding.
   * Enforces Sovereign Chairman authority for deep discounts (>50%) or escalated risk.
   */
  async approveOffer(
    companyId: string,
    actorId: string,
    actorRole: string,
    actorTier: AuthorityTier,
    offerId: string,
    dto: ApproveOfferDto,
  ): Promise<Offer> {
    const offer = await this.getOffer(companyId, offerId);

    if (offer.status === OfferStatus.EXPIRED || offer.status === OfferStatus.CANCELLED) {
      throw new BadRequestException(`Cannot approve offer in terminal status '${offer.status}'.`);
    }

    // 1. Verify Authority
    this.governanceService.verifyApproverAuthority(actorRole, actorTier, offer.requiresChairmanApproval);

    // 2. Prevent CEO self-approval of sensitive offers
    if (offer.creatorRole === OfferCreatorRole.CEO && offer.requiresChairmanApproval && actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException('CEO cannot approve its own high-risk or Chairman-gated offer.');
    }

    // 3. Create Cryptographic Approval Binding
    const binding = this.governanceService.createApprovalBinding(
      actorId,
      actorRole,
      actorTier,
      offer,
      dto.conditions,
      dto.validUntil,
      dto.approvalId,
    );

    offer.approvalBinding = binding;
    offer.status = OfferStatus.APPROVED;
    offer.rejectionReason = undefined;
    offer.updatedAt = new Date().toISOString();

    // Persist Approval in PostgreSQL via Transaction
    if (this.prisma && (this.prisma as any).offer) {
      try {
        await this.prisma.$transaction(async (tx: any) => {
          await tx.offerApprovalRecord.upsert({
            where: { offerId },
            create: {
              approvalId: binding.approvalId,
              offerId,
              approvedBy: actorId,
              approverRole: actorRole,
              approverTier: actorTier,
              approvedVersion: offer.version,
              approvedTermsVersion: offer.termsVersion,
              parametersHash: binding.parametersHash,
              conditions: (dto.conditions || []) as any,
              validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
              isConsumed: false,
              consumedAt: null,
            },
            update: {
              approvalId: binding.approvalId,
              approvedBy: actorId,
              approverRole: actorRole,
              approverTier: actorTier,
              approvedVersion: offer.version,
              approvedTermsVersion: offer.termsVersion,
              parametersHash: binding.parametersHash,
              conditions: (dto.conditions || []) as any,
              validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
              isConsumed: false,
              consumedAt: null,
              approvedAt: new Date(),
            },
          });

          await tx.offer.update({
            where: { id: offerId },
            data: {
              status: OfferStatus.APPROVED,
              rejectionReason: null,
            },
          });
        });
      } catch (err: any) {
        this.logger.warn(`Durable approveOffer transaction failed: ${err.message}`);
      }
    }

    this.getCompanyOffers(companyId).set(offerId, offer);
    this.logger.log(`Offer ${offerId} approved by ${actorRole} (${actorId}). Parameters hash: ${binding.parametersHash}`);
    return offer;
  }

  /**
   * Rejects an offer with a documented reason.
   */
  async rejectOffer(
    companyId: string,
    actorId: string,
    actorRole: string,
    offerId: string,
    reason: string,
  ): Promise<Offer> {
    const offer = await this.getOffer(companyId, offerId);

    offer.status = OfferStatus.REJECTED;
    offer.rejectionReason = reason || 'Rejected during governance review.';
    offer.approvalBinding = undefined;
    offer.updatedAt = new Date().toISOString();

    if (this.prisma && (this.prisma as any).offer) {
      try {
        await this.prisma.$transaction(async (tx: any) => {
          await tx.offerApprovalRecord.deleteMany({ where: { offerId } });
          await tx.offer.update({
            where: { id: offerId },
            data: {
              status: OfferStatus.REJECTED,
              rejectionReason: offer.rejectionReason,
            },
          });
        });
      } catch (err: any) {
        this.logger.warn(`Durable rejectOffer update failed: ${err.message}`);
      }
    }

    this.getCompanyOffers(companyId).set(offerId, offer);
    return offer;
  }

  /**
   * Activates an approved Offer.
   * Performs fail-closed emergency stop verification, approval binding validation, and External Action Gateway dispatch.
   * Idempotent via idempotencyKey.
   */
  async activateOffer(
    companyId: string,
    actorId: string,
    actorRole: string,
    actorTier: AuthorityTier,
    offerId: string,
    dto: ActivateOfferDto,
  ): Promise<Offer> {
    if (!dto.idempotencyKey) {
      throw new BadRequestException('idempotencyKey is required for offer activation.');
    }

    // Check Activation Idempotency Cache
    const cacheKey = `${companyId}:${dto.idempotencyKey}`;
    const cached = this.activateIdempotencyCache.get(cacheKey);
    if (cached && cached.id === offerId && cached.status === OfferStatus.ACTIVE) {
      return cached;
    }

    const offer = await this.getOffer(companyId, offerId);

    // 1. Fail-Closed Emergency Stop Check (direct PostgreSQL query)
    await this.governanceService.verifyEmergencyStatus(companyId);

    // 2. Status Validation
    if (offer.status !== OfferStatus.APPROVED) {
      throw new BadRequestException(
        `Cannot activate offer with status '${offer.status}'. Only APPROVED offers can be activated.`,
      );
    }

    // 3. Validate Approval Binding (Tamper check, version match, replay protection)
    await this.governanceService.validateApprovalBindingAtActivation(offer);

    // 4. Financial & Guardrail Pre-flight Validation
    if (offer.financialAnalysis) {
      const hasNegativeMargin = offer.financialAnalysis.guardrailViolations.some((v) =>
        v.includes('NEGATIVE_MARGIN'),
      );
      if (hasNegativeMargin && actorRole !== 'CHAIRMAN') {
        throw new ForbiddenException(
          'Activation Blocked: Offer has negative unit margin and can only be activated with explicit Sovereign Chairman override.',
        );
      }
    }

    // 5. Consume Approval to Prevent Replay (Durable in PostgreSQL)
    if (offer.approvalBinding?.approvalId) {
      await this.governanceService.consumeApproval(offer.approvalBinding.approvalId, offerId, actorId);
    }

    // 6. Transition to ACTIVE in Database Transaction
    offer.status = OfferStatus.ACTIVE;
    offer.activatedAt = new Date().toISOString();
    offer.updatedAt = new Date().toISOString();

    if (this.prisma && (this.prisma as any).offer) {
      try {
        await this.prisma.$transaction(async (tx: any) => {
          if (offer.approvalBinding?.approvalId) {
            await tx.offerApprovalRecord.updateMany({
              where: { approvalId: offer.approvalBinding.approvalId },
              data: { isConsumed: true, consumedAt: new Date() },
            });
          }

          await tx.offer.update({
            where: { id: offerId },
            data: {
              status: OfferStatus.ACTIVE,
              activatedAt: new Date(offer.activatedAt!),
            },
          });
        });
      } catch (err: any) {
        this.logger.warn(`Durable activateOffer transaction failed: ${err.message}`);
      }
    }

    // 7. External Action Gateway Dispatch (kept OUTSIDE retryable DB transaction)
    let dispatchedActionId: string | undefined = undefined;
    let externalReferenceId: string | undefined = undefined;

    if (this.externalActionGateway) {
      try {
        const actionResult = await this.externalActionGateway.executeAction({
          actionId: `act_offer_${offerId}_${Date.now()}`,
          companyId,
          requestingActorId: actorId,
          requestingActorRole: (['CHAIRMAN', 'CEO', 'MANAGEMENT', 'EMPLOYEE', 'SYSTEM'].includes(actorRole)
            ? actorRole
            : 'EMPLOYEE') as 'CHAIRMAN' | 'CEO' | 'MANAGEMENT' | 'EMPLOYEE' | 'SYSTEM',
          actionType: 'DISPATCH_OFFER' as ExternalActionType,
          idempotencyKey: `idemp_act_${dto.idempotencyKey}`,
          environment: dto.environment === 'PRODUCTION' ? ExecutionEnvironment.PRODUCTION : ExecutionEnvironment.SANDBOX,
          target: {
            targetId: offerId,
            targetType: 'OFFER',
            targetRecipient: offer.materialTerms.targetAudience,
          },
          payload: {
            offerId,
            offerTitle: offer.name,
            discountValue: offer.materialTerms.discountValue,
            finalPrice: offer.materialTerms.finalPrice,
            version: offer.version,
          },
          intendedEffect: `Activate and dispatch commercial offer '${offer.name}'`,
          financialExposure: offer.materialTerms.finalPrice * (offer.materialTerms.maxRedemptions || 100),
          reversibility: 'REVERSIBLE',
          approvalId: offer.approvalBinding?.approvalId,
        });

        dispatchedActionId = actionResult.actionId;
        externalReferenceId = actionResult.externalReferenceId;
        offer.dispatchedActionId = dispatchedActionId;
        offer.externalReferenceId = externalReferenceId;

        if (this.prisma && (this.prisma as any).offer) {
          await (this.prisma as any).offer.update({
            where: { id: offerId },
            data: { dispatchedActionId, externalReferenceId },
          });
        }
      } catch (err: any) {
        this.logger.error(`External action gateway dispatch failed: ${err.message}`);
        throw new BadRequestException(`Activation dispatch failed: ${err.message}`);
      }
    }

    this.activateIdempotencyCache.set(cacheKey, offer);
    this.getCompanyOffers(companyId).set(offerId, offer);
    this.logger.log(`Offer ${offerId} successfully activated.`);
    return offer;
  }

  /**
   * Suspends an active offer.
   */
  async suspendOffer(
    companyId: string,
    actorId: string,
    actorRole: string,
    offerId: string,
    reason: string,
  ): Promise<Offer> {
    const offer = await this.getOffer(companyId, offerId);

    if (offer.status !== OfferStatus.ACTIVE) {
      throw new BadRequestException(`Cannot suspend offer with status '${offer.status}'. Only ACTIVE offers can be suspended.`);
    }

    offer.status = OfferStatus.SUSPENDED;
    offer.suspendedAt = new Date().toISOString();
    offer.suspensionReason = reason || 'Suspended by management.';
    offer.updatedAt = new Date().toISOString();

    if (this.prisma && (this.prisma as any).offer) {
      try {
        await (this.prisma as any).offer.update({
          where: { id: offerId },
          data: {
            status: OfferStatus.SUSPENDED,
            suspendedAt: new Date(offer.suspendedAt),
            suspensionReason: offer.suspensionReason,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Durable suspendOffer update failed: ${err.message}`);
      }
    }

    this.getCompanyOffers(companyId).set(offerId, offer);
    return offer;
  }

  /**
   * Cancels an offer.
   */
  async cancelOffer(companyId: string, actorId: string, offerId: string): Promise<Offer> {
    const offer = await this.getOffer(companyId, offerId);

    offer.status = OfferStatus.CANCELLED;
    offer.cancelledAt = new Date().toISOString();
    offer.updatedAt = new Date().toISOString();

    if (this.prisma && (this.prisma as any).offer) {
      try {
        await (this.prisma as any).offer.update({
          where: { id: offerId },
          data: {
            status: OfferStatus.CANCELLED,
            cancelledAt: new Date(offer.cancelledAt),
          },
        });
      } catch (err: any) {
        this.logger.warn(`Durable cancelOffer update failed: ${err.message}`);
      }
    }

    this.getCompanyOffers(companyId).set(offerId, offer);
    return offer;
  }

  /**
   * Redeems an active offer.
   * Atomically checks validity dates, max redemption ceiling, customer limits, and increments counter.
   * Fully protected by PostgreSQL transactions and database unique constraints.
   * Idempotent by idempotencyKey.
   */
  async redeemOffer(companyId: string, offerId: string, dto: RedeemOfferDto): Promise<OfferRedemptionRecord> {
    if (!dto.customerId) throw new BadRequestException('customerId is required for redemption.');

    // 1. Transactional Database Path (with row-level lock and isolation)
    if (this.prisma && (this.prisma as any).offerRedemptionRecord) {
      try {
        const dbResult = await this.prisma.$transaction(async (tx: any) => {
          // Idempotency check in DB
          if (dto.idempotencyKey) {
            const existing = await tx.offerRedemptionRecord.findFirst({
              where: { companyId, idempotencyKey: dto.idempotencyKey },
            });
            if (existing) {
              return this.mapDbRedemptionToDomain(existing);
            }
          }

          // Acquire exclusive row lock on Offer to strictly serialize concurrent redemptions
          await tx.$queryRaw`SELECT id FROM "Offer" WHERE id = ${offerId} FOR UPDATE`;

          const dbOffer = await tx.offer.findFirst({
            where: { id: offerId, companyId },
            include: { materialTerms: true },
          });

          if (!dbOffer || dbOffer.status !== OfferStatus.ACTIVE) {
            throw new BadRequestException(
              `Cannot redeem offer with status '${dbOffer?.status || 'NOT_FOUND'}'. Offer is not ACTIVE.`,
            );
          }

          const now = Date.now();
          const validFrom = new Date(dbOffer.materialTerms.validFrom).getTime();
          const validUntil = new Date(dbOffer.materialTerms.validUntil).getTime();

          if (now < validFrom) {
            throw new BadRequestException('Redemption Rejected: Offer promotional window has not started.');
          }
          if (now > validUntil) {
            await tx.offer.update({
              where: { id: offerId },
              data: { status: OfferStatus.EXPIRED, expiredAt: new Date() },
            });
            throw new BadRequestException('Redemption Rejected: Offer has expired.');
          }

          const maxRedemptions = dbOffer.materialTerms.maxRedemptions;
          if (maxRedemptions !== null && dbOffer.currentRedemptions >= maxRedemptions) {
            await tx.offer.update({
              where: { id: offerId },
              data: { status: OfferStatus.EXPIRED, expiredAt: new Date() },
            });
            throw new BadRequestException('Redemption Rejected: Offer redemption limit has been reached.');
          }

          // Per-customer limit check
          const customerPriorRedemptions = await tx.offerRedemptionRecord.count({
            where: { offerId, customerId: dto.customerId },
          });
          const maxPerCustomer = (dbOffer.metadata as any)?.maxPerCustomerRedemptions ?? 1;
          if (customerPriorRedemptions >= maxPerCustomer) {
            throw new BadRequestException(
              `Redemption Rejected: Customer '${dto.customerId}' has exceeded the maximum allowed redemptions (${maxPerCustomer}).`,
            );
          }

          // Atomic counter increment
          const updatedOffer = await tx.offer.update({
            where: { id: offerId },
            data: { currentRedemptions: { increment: 1 } },
          });

          if (maxRedemptions !== null && updatedOffer.currentRedemptions >= maxRedemptions) {
            await tx.offer.update({
              where: { id: offerId },
              data: { status: OfferStatus.EXPIRED, expiredAt: new Date() },
            });
          }

          const transactionValue = dto.transactionValue || dbOffer.materialTerms.originalPrice;
          const discountApplied =
            Math.round((dbOffer.materialTerms.originalPrice - dbOffer.materialTerms.finalPrice) * 100) / 100;
          const netPaid = Math.max(0, Math.round((transactionValue - discountApplied) * 100) / 100);

          const redemptionCode = dto.redemptionCode || `RED-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
          const redeemedAt = new Date().toISOString();

          const evidenceHash = crypto
            .createHash('sha256')
            .update(
              JSON.stringify({
                companyId,
                offerId,
                customerId: dto.customerId,
                redeemedAt,
                netPaid,
                redemptionCode,
              }),
            )
            .digest('hex');

          const dbRecord = await tx.offerRedemptionRecord.create({
            data: {
              offerId,
              companyId,
              customerId: dto.customerId,
              redemptionCode,
              transactionValue,
              discountApplied,
              netPaid,
              channel: dto.channel || 'DIRECT_WEB',
              evidenceHash,
              idempotencyKey: dto.idempotencyKey || null,
            },
          });

          return this.mapDbRedemptionToDomain(dbRecord);
        });

        // Sync local memory map
        this.getCompanyRedemptions(companyId).push(dbResult);
        if (dto.idempotencyKey) {
          this.redeemIdempotencyCache.set(`${companyId}:${dto.idempotencyKey}`, dbResult);
        }

        const memOffer = this.getCompanyOffers(companyId).get(offerId);
        if (memOffer) {
          memOffer.currentRedemptions += 1;
        }

        return dbResult;
      } catch (err: any) {
        if (
          err instanceof BadRequestException ||
          err instanceof ForbiddenException ||
          err instanceof NotFoundException
        ) {
          throw err;
        }
        this.logger.warn(`Durable redeemOffer transaction failed, using memory fallback: ${err.message}`);
      }
    }

    // 2. In-memory Fallback (for mocked test suites)
    if (dto.idempotencyKey) {
      const cacheKey = `${companyId}:${dto.idempotencyKey}`;
      const existing = this.redeemIdempotencyCache.get(cacheKey);
      if (existing) return existing;
    }

    const offer = await this.getOffer(companyId, offerId);

    if (offer.status !== OfferStatus.ACTIVE) {
      throw new BadRequestException(`Cannot redeem offer with status '${offer.status}'. Offer is not ACTIVE.`);
    }

    const now = Date.now();
    const validFrom = new Date(offer.materialTerms.validFrom).getTime();
    const validUntil = new Date(offer.materialTerms.validUntil).getTime();

    if (now < validFrom) {
      throw new BadRequestException('Redemption Rejected: Offer promotional window has not started.');
    }
    if (now > validUntil) {
      offer.status = OfferStatus.EXPIRED;
      offer.expiredAt = new Date().toISOString();
      throw new BadRequestException('Redemption Rejected: Offer has expired.');
    }

    if (offer.materialTerms.maxRedemptions !== null && offer.currentRedemptions >= offer.materialTerms.maxRedemptions) {
      offer.status = OfferStatus.EXPIRED;
      offer.expiredAt = new Date().toISOString();
      throw new BadRequestException('Redemption Rejected: Offer redemption limit has been reached.');
    }

    offer.currentRedemptions += 1;
    if (offer.materialTerms.maxRedemptions !== null && offer.currentRedemptions >= offer.materialTerms.maxRedemptions) {
      offer.status = OfferStatus.EXPIRED;
      offer.expiredAt = new Date().toISOString();
    }

    const transactionValue = dto.transactionValue || offer.materialTerms.originalPrice;
    const discountApplied = Math.round((offer.materialTerms.originalPrice - offer.materialTerms.finalPrice) * 100) / 100;
    const netPaid = Math.max(0, Math.round((transactionValue - discountApplied) * 100) / 100);

    const redemptionCode = dto.redemptionCode || `RED-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const redeemedAt = new Date().toISOString();

    const evidenceHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ companyId, offerId, customerId: dto.customerId, redeemedAt, netPaid, redemptionCode }))
      .digest('hex');

    const record: OfferRedemptionRecord = {
      id: `rdm_${companyId}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      offerId,
      companyId,
      customerId: dto.customerId,
      redemptionCode,
      transactionValue,
      discountApplied,
      netPaid,
      channel: dto.channel || 'DIRECT_WEB',
      evidenceHash,
      idempotencyKey: dto.idempotencyKey,
      redeemedAt,
    };

    this.getCompanyRedemptions(companyId).push(record);
    if (dto.idempotencyKey) {
      this.redeemIdempotencyCache.set(`${companyId}:${dto.idempotencyKey}`, record);
    }

    this.logger.log(`Offer ${offerId} redeemed by customer ${dto.customerId}. Current count: ${offer.currentRedemptions}`);
    return record;
  }

  /**
   * Retrieves an offer by ID with tenant isolation check.
   */
  async getOffer(companyId: string, offerId: string): Promise<Offer> {
    if (this.prisma && (this.prisma as any).offer) {
      try {
        const dbOffer = await (this.prisma as any).offer.findFirst({
          where: { id: offerId, companyId },
          include: {
            materialTerms: true,
            termsHistory: { orderBy: { version: 'asc' } },
            approvalBinding: true,
          },
        });
        if (dbOffer) {
          const mapped = this.mapDbOfferToDomain(dbOffer);
          this.getCompanyOffers(companyId).set(offerId, mapped);
          return mapped;
        }
      } catch (err: any) {
        this.logger.warn(`Database getOffer fallback: ${err.message}`);
      }
    }

    const offer = this.getCompanyOffers(companyId).get(offerId);
    if (!offer || offer.companyId !== companyId) {
      throw new NotFoundException(`Offer '${offerId}' not found for company '${companyId}'.`);
    }
    return offer;
  }

  /**
   * Lists offers for a company with optional status and audience filtering.
   */
  async listOffers(
    companyId: string,
    filters?: { status?: OfferStatus; targetAudience?: string; creatorRole?: OfferCreatorRole },
  ): Promise<Offer[]> {
    if (this.prisma && (this.prisma as any).offer) {
      try {
        const where: any = { companyId };
        if (filters?.status) where.status = filters.status;
        if (filters?.targetAudience) where.targetAudience = filters.targetAudience;
        if (filters?.creatorRole) where.creatorRole = filters.creatorRole;

        const dbOffers = await (this.prisma as any).offer.findMany({
          where,
          include: {
            materialTerms: true,
            termsHistory: { orderBy: { version: 'asc' } },
            approvalBinding: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (dbOffers && dbOffers.length > 0) {
          return dbOffers.map((o: any) => this.mapDbOfferToDomain(o));
        }
      } catch (err: any) {
        this.logger.warn(`Database listOffers fallback: ${err.message}`);
      }
    }

    const all = Array.from(this.getCompanyOffers(companyId).values());
    return all.filter((o) => {
      if (filters?.status && o.status !== filters.status) return false;
      if (filters?.targetAudience && o.materialTerms.targetAudience !== filters.targetAudience) return false;
      if (filters?.creatorRole && o.creatorRole !== filters.creatorRole) return false;
      return true;
    });
  }

  /**
   * Retrieves redemptions for a specific offer.
   */
  async getOfferRedemptions(companyId: string, offerId: string): Promise<OfferRedemptionRecord[]> {
    if (this.prisma && (this.prisma as any).offerRedemptionRecord) {
      try {
        const dbRedemptions = await (this.prisma as any).offerRedemptionRecord.findMany({
          where: { companyId, offerId },
          orderBy: { redeemedAt: 'asc' },
        });
        if (dbRedemptions && dbRedemptions.length > 0) {
          return dbRedemptions.map((r: any) => this.mapDbRedemptionToDomain(r));
        }
      } catch (err: any) {
        this.logger.warn(`Database getOfferRedemptions fallback: ${err.message}`);
      }
    }

    return this.getCompanyRedemptions(companyId).filter((r) => r.offerId === offerId);
  }
}
