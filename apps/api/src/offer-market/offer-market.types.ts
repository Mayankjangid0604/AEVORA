import { AuthorityTier, CeoDecisionRiskLevel } from '../governance/authority-context.types';

export enum OfferStatus {
  DRAFT = 'DRAFT',
  UNDER_REVIEW = 'UNDER_REVIEW',
  EVALUATED = 'EVALUATED',
  APPROVED = 'APPROVED',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  REVISION_REQUIRED = 'REVISION_REQUIRED',
}

export enum DiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
  CUSTOM = 'CUSTOM',
}

export enum OfferCreatorRole {
  CHAIRMAN = 'CHAIRMAN',
  CEO = 'CEO',
  SYSTEM = 'SYSTEM',
}

export enum EpistemicReliability {
  VERIFIED_HISTORICAL = 'VERIFIED_HISTORICAL',
  CURRENT_OPERATIONAL = 'CURRENT_OPERATIONAL',
  ESTIMATED = 'ESTIMATED',
  SIMULATED = 'SIMULATED',
  MISSING = 'MISSING',
}

export enum RecommendationVerdict {
  APPROVE = 'APPROVE',
  REVISE = 'REVISE',
  REJECT = 'REJECT',
  FURTHER_ANALYSIS_REQUIRED = 'FURTHER_ANALYSIS_REQUIRED',
}

export enum OptimizationAction {
  EXTEND = 'EXTEND',
  ADJUST_DISCOUNT = 'ADJUST_DISCOUNT',
  INCREASE_MARKETING = 'INCREASE_MARKETING',
  SUSPEND = 'SUSPEND',
  EXPIRE_EARLY = 'EXPIRE_EARLY',
  MONITOR = 'MONITOR',
}

export interface EpistemicDataPoint<T> {
  value: T;
  source: string;
  reliability: EpistemicReliability;
  uncertaintyScore: number; // 0.0 (certain) to 1.0 (completely uncertain)
  notes?: string;
}

export interface TermsVersionRecord {
  version: number;
  terms: string;
  changedAt: string;
  changedBy: string;
  changeReason?: string;
}

export interface OfferMaterialTerms {
  originalPrice: number;
  discountType: DiscountType;
  discountValue: number; // e.g. 20 for 20%, or 50 for $50
  finalPrice: number;
  currency: string;
  validFrom: string; // ISO date string
  validUntil: string; // ISO date string
  maxRedemptions?: number | null;
  productServiceIds: string[];
  targetAudience: string;
  termsAndConditions: string;
}

export interface FinancialScenario {
  volume: number;
  revenue: number;
  grossProfit: number;
  contributionProfit: number;
  postDiscountMarginPct: number;
  discountCost: number;
  cannibalizationLoss: number;
}

export interface FinancialAnalysisResult {
  expectedRevenue: number;
  baselineRevenue: number;
  incrementalRevenue: number;
  discountCost: number;
  grossProfit: number;
  contributionProfit: number;
  postDiscountMarginPct: number;
  originalMarginPct: number;
  marginErosionPct: number;
  cannibalizationRisk: {
    percentage: number;
    estimatedRevenueLoss: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  cac: number | null;
  ltv: number | null;
  cashFlowImpact: {
    netInflow: number;
    workingCapitalRequirement: number;
    timingSummary: string;
  };
  capacityConstraints: {
    serviceCapacityLimit: number | null;
    projectedDemand: number;
    isCapacityConstrained: boolean;
    bottleneckNotes?: string;
  };
  breakEven: {
    volume: number;
    estimatedDaysToBreakEven: number | null;
  };
  scenarios: {
    bestCase: FinancialScenario;
    expectedCase: FinancialScenario;
    worstCase: FinancialScenario;
  };
  provenance: {
    inputs: Record<string, EpistemicDataPoint<any>>;
    overallConfidence: number; // 0.0 to 1.0
    hasSufficientEvidence: boolean;
    missingDataItems: string[];
    explicitAssumptions: string[];
  };
  guardrailViolations: string[];
}

export interface CeoEvaluationResult {
  evaluatedAt: string;
  evaluatorModel: string;
  scores: {
    profitabilityScore: number; // 0 to 100
    strategicValueScore: number; // 0 to 100
    riskScore: number; // 0 to 100
    customerImpactScore: number; // 0 to 100
    operationalFeasibilityScore: number; // 0 to 100
    compositeScore: number; // 0 to 100
  };
  baselineComparison: {
    revenueDeltaPct: number;
    profitDeltaPct: number;
    strategicAdvantage: string;
  };
  alternativeDiscountComparisons: Array<{
    discountValue: number;
    projectedRevenue: number;
    projectedProfit: number;
    riskTier: CeoDecisionRiskLevel;
    rationale: string;
  }>;
  verdict: RecommendationVerdict;
  explanation: {
    executiveSummary: string;
    evidenceSummary: string;
    tradeOffAnalysis: string;
    riskEscalationTriggers: string[];
  };
  escalationRequired: boolean;
  escalationReason?: string;
  advisoryDisclaimer: string;
}

export interface OfferApprovalBinding {
  approvalId: string;
  approvedBy: string;
  approverRole: string;
  approverTier: AuthorityTier;
  approvedAt: string;
  approvedVersion: number;
  approvedTermsVersion: number;
  parametersHash: string; // Cryptographic SHA-256 hash of material parameters
  conditions?: string[];
  validUntil?: string;
}

export interface OfferRedemptionRecord {
  id: string;
  offerId: string;
  companyId: string;
  customerId: string;
  redemptionCode: string;
  transactionValue: number;
  discountApplied: number;
  netPaid: number;
  channel: string;
  redeemedAt: string;
  evidenceHash: string;
  idempotencyKey?: string;
}

export interface OfferMarketingCopy {
  offerId: string;
  offerVersion: number;
  approvedParametersHash: string;
  emailDraft: {
    subject: string;
    previewText: string;
    bodyMarkdown: string;
    callToAction: string;
  };
  socialDrafts: {
    linkedIn: string;
    twitter: string;
    instagram: string;
  };
  landingPageCopy: {
    headline: string;
    subheadline: string;
    valueProps: string[];
    ctaText: string;
  };
  attributionLinks: {
    webUrl: string;
    emailUrl: string;
    socialUrl: string;
    trackingSlug: string;
  };
  generatedAt: string;
  isSandboxDraft: boolean;
}

export interface OfferMeasurement {
  offerId: string;
  impressions: number;
  clicks: number;
  conversions: number;
  redemptions: number;
  conversionRatePct: number;
  totalGrossRevenue: number;
  totalDiscountCost: number;
  totalNetRevenue: number;
  totalContributionProfit: number;
  forecastVariance: {
    predictedRedemptions: number;
    actualRedemptions: number;
    varianceRedemptionsPct: number;
    predictedRevenue: number;
    actualRevenue: number;
    varianceRevenuePct: number;
    isSignificantDrift: boolean; // true if absolute variance > 25%
  };
  attributionBreakdown: {
    firstTouch: number;
    lastTouch: number;
    linear: number;
  };
  causalConfidenceDisclaimer: string;
}

export interface OfferOptimizationRecommendation {
  offerId: string;
  action: OptimizationAction;
  confidenceScore: number; // 0.0 to 1.0
  rationale: string;
  evidencePoints: string[];
  suggestedAdjustments?: {
    discountValue?: number;
    maxRedemptions?: number;
    validUntil?: string;
    allocatedBudget?: number;
  };
  requiresChairmanApproval: boolean;
}

export interface Offer {
  id: string;
  companyId: string;
  name: string;
  description: string;
  status: OfferStatus;
  creatorId: string;
  creatorRole: OfferCreatorRole;
  version: number;
  termsVersion: number;
  materialTerms: OfferMaterialTerms;
  termsHistory: TermsVersionRecord[];
  
  // Evaluation & Financial Intelligence
  financialAnalysis?: FinancialAnalysisResult;
  ceoEvaluation?: CeoEvaluationResult;

  // Governance & Approvals
  approvalBinding?: OfferApprovalBinding;
  isChairmanGated: boolean;
  requiresChairmanApproval: boolean;
  rejectionReason?: string;
  suspensionReason?: string;

  // Lifecycle & Limits
  currentRedemptions: number;
  activatedAt?: string;
  suspendedAt?: string;
  cancelledAt?: string;
  expiredAt?: string;

  // Execution & Gateway Integration
  dispatchedActionId?: string;
  externalReferenceId?: string;
  idempotencyKey?: string;

  // Metadata
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOfferDto {
  name: string;
  description: string;
  targetAudience: string;
  productServiceIds: string[];
  originalPrice: number;
  discountType: DiscountType;
  discountValue: number;
  currency?: string;
  validFrom: string;
  validUntil: string;
  maxRedemptions?: number | null;
  termsAndConditions: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export interface UpdateOfferDto {
  name?: string;
  description?: string;
  targetAudience?: string;
  productServiceIds?: string[];
  originalPrice?: number;
  discountType?: DiscountType;
  discountValue?: number;
  currency?: string;
  validFrom?: string;
  validUntil?: string;
  maxRedemptions?: number | null;
  termsAndConditions?: string;
  changeReason?: string;
  metadata?: Record<string, any>;
}

export interface ApproveOfferDto {
  approvalId?: string;
  conditions?: string[];
  validUntil?: string;
}

export interface ActivateOfferDto {
  idempotencyKey: string;
  environment?: 'SANDBOX' | 'PRODUCTION';
}

export interface RedeemOfferDto {
  customerId: string;
  redemptionCode?: string;
  transactionValue?: number;
  channel?: string;
  idempotencyKey?: string;
}
