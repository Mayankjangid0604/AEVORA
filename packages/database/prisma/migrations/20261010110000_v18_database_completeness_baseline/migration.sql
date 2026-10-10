-- =============================================================================
-- V18 DATABASE COMPLETENESS BASELINE MIGRATION
-- Forward-only completeness baseline adding all missing schema objects
-- Migration: 20261010110000_v18_database_completeness_baseline
-- =============================================================================

-- =============================================================================
-- STAGE 1: ENUMS (19 New Enums, 9 Drifted Enums Expansion)
-- =============================================================================

-- CreateEnum: TaskType
DO $$ BEGIN
    CREATE TYPE "TaskType" AS ENUM ('STANDARD', 'DEPARTMENT_OBJECTIVE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: ProjectType
DO $$ BEGIN
    CREATE TYPE "ProjectType" AS ENUM ('NODE', 'WEBSITE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: BudgetStatus
DO $$ BEGIN
    CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'CLOSED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: ResearchExecutionState
DO $$ BEGIN
    CREATE TYPE "ResearchExecutionState" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRYING', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: KpiMeasurementDirection
DO $$ BEGIN
    CREATE TYPE "KpiMeasurementDirection" AS ENUM ('HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'TARGET_RANGE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: StrategicPlanStatus
DO $$ BEGIN
    CREATE TYPE "StrategicPlanStatus" AS ENUM ('DRAFT', 'PROPOSED', 'PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: AeFailureClassification
DO $$ BEGIN
    CREATE TYPE "AeFailureClassification" AS ENUM ('TRANSIENT_FAILURE', 'RECOVERABLE_FAILURE', 'AUTHORIZATION_FAILURE', 'VALIDATION_FAILURE', 'DEPENDENCY_FAILURE', 'PERMANENT_FAILURE', 'UNKNOWN_FAILURE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: ChairmanCommandStatus
DO $$ BEGIN
    CREATE TYPE "ChairmanCommandStatus" AS ENUM ('PENDING', 'ROUTED', 'AWAITING_APPROVAL', 'EXECUTING', 'COMPLETED', 'FAILED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: CeoFinancialAuthorityStatus
DO $$ BEGIN
    CREATE TYPE "CeoFinancialAuthorityStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: CeoFinancialOperation
DO $$ BEGIN
    CREATE TYPE "CeoFinancialOperation" AS ENUM ('VIEW_FINANCIALS', 'CREATE_BUDGET', 'MODIFY_BUDGET', 'CREATE_RESERVATION', 'APPROVE_RESERVATION', 'AUTHORIZE_EXPENSE', 'AUTHORIZE_PAYMENT', 'EXECUTE_PAYMENT', 'REFUND', 'TRANSFER_FUNDS', 'WITHDRAW_FUNDS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: StrategicMilestoneStatus
DO $$ BEGIN
    CREATE TYPE "StrategicMilestoneStatus" AS ENUM ('UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'BLOCKED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: PerformanceStatus
DO $$ BEGIN
    CREATE TYPE "PerformanceStatus" AS ENUM ('EXCEPTIONAL', 'STRONG', 'STABLE', 'AT_RISK', 'UNDERPERFORMING', 'CRITICAL', 'INSUFFICIENT_DATA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: EvaluationWorkflowStatus
DO $$ BEGIN
    CREATE TYPE "EvaluationWorkflowStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'REVIEWED', 'ACKNOWLEDGED', 'ACTION_REQUIRED', 'CLOSED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: SuccessionRiskLevel
DO $$ BEGIN
    CREATE TYPE "SuccessionRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: SuccessionStatus
DO $$ BEGIN
    CREATE TYPE "SuccessionStatus" AS ENUM ('HEALTHY', 'MONITORING', 'AT_RISK', 'CRITICAL_VACANCY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: CandidateReadiness
DO $$ BEGIN
    CREATE TYPE "CandidateReadiness" AS ENUM ('NOT_READY', 'DEVELOPING', 'READY_SOON', 'READY', 'NOT_ELIGIBLE', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: ClientMeetingStatus
DO $$ BEGIN
    CREATE TYPE "ClientMeetingStatus" AS ENUM ('REQUESTED', 'WAITING_FOR_OWNER_TIME', 'WAITING_FOR_CLIENT_CONFIRMATION', 'CLIENT_PROPOSED_ALTERNATIVE', 'WAITING_FOR_OWNER_CONFIRMATION', 'CONFIRMED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'NOT_RECORDED', 'RECORDED', 'NOTES_READY', 'ADDED_TO_PROJECT', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: ProjectExecutionStatus
DO $$ BEGIN
    CREATE TYPE "ProjectExecutionStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: ProjectTestStatus
DO $$ BEGIN
    CREATE TYPE "ProjectTestStatus" AS ENUM ('RUNNING', 'PASSED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Expand Drifted Existing Enums
-- AlterEnum: ClientStatus (Add missing values)
ALTER TYPE "ClientStatus" ADD VALUE IF NOT EXISTS 'LEAD';
ALTER TYPE "ClientStatus" ADD VALUE IF NOT EXISTS 'QUALIFIED';
ALTER TYPE "ClientStatus" ADD VALUE IF NOT EXISTS 'OPPORTUNITY';
ALTER TYPE "ClientStatus" ADD VALUE IF NOT EXISTS 'PROPOSAL';
ALTER TYPE "ClientStatus" ADD VALUE IF NOT EXISTS 'CONTRACT_PENDING';
ALTER TYPE "ClientStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "ClientStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

-- AlterEnum: ProjectDeliveryStatus (Add missing values)
ALTER TYPE "ProjectDeliveryStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "ProjectDeliveryStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "ProjectDeliveryStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_ACCEPTANCE';
ALTER TYPE "ProjectDeliveryStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';

-- AlterEnum: ManagementDecisionType (Add missing values)
ALTER TYPE "ManagementDecisionType" ADD VALUE IF NOT EXISTS 'REPLACEMENT';

-- AlterEnum: ResearchProjectStatus (Add missing values)
ALTER TYPE "ResearchProjectStatus" ADD VALUE IF NOT EXISTS 'EXECUTING';
ALTER TYPE "ResearchProjectStatus" ADD VALUE IF NOT EXISTS 'SYNTHESIZING';
ALTER TYPE "ResearchProjectStatus" ADD VALUE IF NOT EXISTS 'OUTCOME_READY';
ALTER TYPE "ResearchProjectStatus" ADD VALUE IF NOT EXISTS 'CEO_REVIEW';
ALTER TYPE "ResearchProjectStatus" ADD VALUE IF NOT EXISTS 'CHAIRMAN_REVIEW';
ALTER TYPE "ResearchProjectStatus" ADD VALUE IF NOT EXISTS 'REVISION_REQUIRED';
ALTER TYPE "ResearchProjectStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "ResearchProjectStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- AlterEnum: ObjectiveStatus (Add missing values)
ALTER TYPE "ObjectiveStatus" ADD VALUE IF NOT EXISTS 'NOT_STARTED';
ALTER TYPE "ObjectiveStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "ObjectiveStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';

-- AlterEnum: KpiStatus (Add missing values)
ALTER TYPE "KpiStatus" ADD VALUE IF NOT EXISTS 'OFF_TRACK';
ALTER TYPE "KpiStatus" ADD VALUE IF NOT EXISTS 'CRITICAL';
ALTER TYPE "KpiStatus" ADD VALUE IF NOT EXISTS 'NO_DATA';

-- AlterEnum: KpiTrend (Add missing values)
ALTER TYPE "KpiTrend" ADD VALUE IF NOT EXISTS 'INSUFFICIENT_DATA';

-- AlterEnum: KpiPeriod (Add missing values)
ALTER TYPE "KpiPeriod" ADD VALUE IF NOT EXISTS 'CUSTOM';

-- AlterEnum: AeObjectiveStatus (Add missing values)
ALTER TYPE "AeObjectiveStatus" ADD VALUE IF NOT EXISTS 'DISCOVERED';
ALTER TYPE "AeObjectiveStatus" ADD VALUE IF NOT EXISTS 'PLANNED';
ALTER TYPE "AeObjectiveStatus" ADD VALUE IF NOT EXISTS 'AUTHORIZED';
ALTER TYPE "AeObjectiveStatus" ADD VALUE IF NOT EXISTS 'DISPATCHED';
ALTER TYPE "AeObjectiveStatus" ADD VALUE IF NOT EXISTS 'RUNNING';
ALTER TYPE "AeObjectiveStatus" ADD VALUE IF NOT EXISTS 'VERIFYING';
ALTER TYPE "AeObjectiveStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "AeObjectiveStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "AeObjectiveStatus" ADD VALUE IF NOT EXISTS 'RECOVERY_PENDING';
ALTER TYPE "AeObjectiveStatus" ADD VALUE IF NOT EXISTS 'REPLANNING';
ALTER TYPE "AeObjectiveStatus" ADD VALUE IF NOT EXISTS 'ESCALATED';

-- =============================================================================
-- STAGE 2 & 3: CREATE MISSING TABLES (35 Tables in Topological Order)
-- =============================================================================

-- CreateTable: AevoraGroup
CREATE TABLE IF NOT EXISTS "AevoraGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "chairmanId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AevoraGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BrowserProfile
CREATE TABLE IF NOT EXISTS "BrowserProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employeeId" TEXT,
    "chromeProfileDirectory" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "browserType" TEXT NOT NULL DEFAULT 'CHROME',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrowserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BrowserConversation
CREATE TABLE IF NOT EXISTS "BrowserConversation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "browserProfileId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "conversationTitle" TEXT NOT NULL,
    "conversationUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrowserConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: StrategicPlan
CREATE TABLE IF NOT EXISTS "StrategicPlan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vision" TEXT,
    "mission" TEXT,
    "description" TEXT,
    "planningPeriodStart" TIMESTAMP(3) NOT NULL,
    "planningPeriodEnd" TIMESTAMP(3) NOT NULL,
    "status" "StrategicPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategicPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CompanyKPIMeasurement
CREATE TABLE IF NOT EXISTS "CompanyKPIMeasurement" (
    "id" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "period" "KpiPeriod" NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "actualValue" INTEGER NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "progress" DOUBLE PRECISION NOT NULL,
    "status" "KpiStatus" NOT NULL,
    "source" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyKPIMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ChairmanCommand
CREATE TABLE IF NOT EXISTS "ChairmanCommand" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "naturalLanguage" TEXT NOT NULL,
    "parsedIntent" TEXT,
    "targetEntity" TEXT,
    "requestedAction" TEXT,
    "riskLevel" "ApprovalRiskLevel" NOT NULL DEFAULT 'LOW',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "status" "ChairmanCommandStatus" NOT NULL DEFAULT 'PENDING',
    "executionNotes" TEXT,
    "approvalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChairmanCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CeoFinancialAuthority
CREATE TABLE IF NOT EXISTS "CeoFinancialAuthority" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ceoEmployeeId" TEXT NOT NULL,
    "authorityStatus" "CeoFinancialAuthorityStatus" NOT NULL DEFAULT 'ACTIVE',
    "singleTransactionLimit" INTEGER NOT NULL DEFAULT 0,
    "dailyLimit" INTEGER NOT NULL DEFAULT 0,
    "monthlyLimit" INTEGER NOT NULL DEFAULT 0,
    "budgetLimit" BOOLEAN NOT NULL DEFAULT true,
    "allowedOperations" "CeoFinancialOperation"[] NOT NULL,
    "requiresChairmanApprovalAbove" INTEGER,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "grantedBy" TEXT,
    "revokedBy" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CeoFinancialAuthority_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CeoFinancialDecision
CREATE TABLE IF NOT EXISTS "CeoFinancialDecision" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ceoEmployeeId" TEXT NOT NULL,
    "operation" "CeoFinancialOperation" NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "budgetId" TEXT,
    "authorityId" TEXT,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "chairmanApprovalRef" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "paymentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CeoFinancialDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable: StrategicMilestone
CREATE TABLE IF NOT EXISTS "StrategicMilestone" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "StrategicMilestoneStatus" NOT NULL DEFAULT 'UPCOMING',
    "completionDate" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "dependencies" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategicMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PerformanceEvaluation
CREATE TABLE IF NOT EXISTS "PerformanceEvaluation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "departmentId" TEXT,
    "evaluatorId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "workflowStatus" "EvaluationWorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "status" "PerformanceStatus" NOT NULL DEFAULT 'INSUFFICIENT_DATA',
    "overallScore" INTEGER,
    "kpiScore" INTEGER,
    "taskScore" INTEGER,
    "projectScore" INTEGER,
    "operationalScore" INTEGER,
    "strengths" JSONB,
    "weaknesses" JSONB,
    "risks" JSONB,
    "recommendations" JSONB,
    "underlyingData" JSONB,
    "isDepartmentLeadEval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SuccessionPlan
CREATE TABLE IF NOT EXISTS "SuccessionPlan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "departmentId" TEXT,
    "currentHolderId" TEXT,
    "status" "SuccessionStatus" NOT NULL DEFAULT 'HEALTHY',
    "riskLevel" "SuccessionRiskLevel" NOT NULL DEFAULT 'LOW',
    "transitionPlan" TEXT,
    "nextReviewDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuccessionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SuccessionCandidate
CREATE TABLE IF NOT EXISTS "SuccessionCandidate" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "readiness" "CandidateReadiness" NOT NULL DEFAULT 'NOT_READY',
    "eligibilityReason" TEXT,
    "developmentGaps" JSONB,
    "developmentActions" JSONB,
    "riskFlags" JSONB,
    "leadershipIndicators" JSONB,
    "underlyingData" JSONB,
    "recommendationStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuccessionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ClientMeeting
CREATE TABLE IF NOT EXISTS "ClientMeeting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadId" TEXT,
    "clientId" TEXT,
    "projectId" TEXT,
    "opportunityId" TEXT,
    "threadId" TEXT,
    "timezone" TEXT,
    "proposedTimes" JSONB NOT NULL,
    "confirmedTime" TIMESTAMP(3),
    "status" "ClientMeetingStatus" NOT NULL DEFAULT 'REQUESTED',
    "link" TEXT,
    "recordingUrl" TEXT,
    "transcript" TEXT,
    "extractedNotes" JSONB,
    "notesApprovedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProjectDevelopmentExecution
CREATE TABLE IF NOT EXISTS "ProjectDevelopmentExecution" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "employeeId" TEXT,
    "taskId" TEXT,
    "status" "ProjectExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "sourcePath" TEXT,
    "logs" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectDevelopmentExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProjectBuildExecution
CREATE TABLE IF NOT EXISTS "ProjectBuildExecution" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "ProjectExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "logs" TEXT,
    "artifactPath" TEXT,
    "version" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectBuildExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProjectTestExecution
CREATE TABLE IF NOT EXISTS "ProjectTestExecution" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "testCommand" TEXT,
    "status" "ProjectTestStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "logs" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectTestExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ResearchExecution
CREATE TABLE IF NOT EXISTS "ResearchExecution" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "state" "ResearchExecutionState" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorDetails" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ResearchSource
CREATE TABLE IF NOT EXISTS "ResearchSource" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "url" TEXT,
    "title" TEXT,
    "publisher" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'WEB',
    "retrievalTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ResearchFinding
CREATE TABLE IF NOT EXISTS "ResearchFinding" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "sourceId" TEXT,
    "content" TEXT NOT NULL,
    "relevance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ResearchPerspective
CREATE TABLE IF NOT EXISTS "ResearchPerspective" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "executionId" TEXT,
    "employeeId" TEXT NOT NULL,
    "roleContext" TEXT NOT NULL,
    "findings" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchPerspective_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ResearchSynthesis
CREATE TABLE IF NOT EXISTS "ResearchSynthesis" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "synthesizerId" TEXT,
    "executiveSummary" TEXT NOT NULL,
    "comprehensiveReport" TEXT NOT NULL,
    "actionableInsights" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchSynthesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable: V12SpatialWorld
CREATE TABLE IF NOT EXISTS "V12SpatialWorld" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "V12SpatialWorld_pkey" PRIMARY KEY ("id")
);

-- CreateTable: V12SpatialRegion
CREATE TABLE IF NOT EXISTS "V12SpatialRegion" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotW" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleX" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleY" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleZ" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "V12SpatialRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable: V12SpatialCountry
CREATE TABLE IF NOT EXISTS "V12SpatialCountry" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotW" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleX" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleY" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleZ" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "V12SpatialCountry_pkey" PRIMARY KEY ("id")
);

-- CreateTable: V12SpatialCity
CREATE TABLE IF NOT EXISTS "V12SpatialCity" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotW" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleX" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleY" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleZ" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "V12SpatialCity_pkey" PRIMARY KEY ("id")
);

-- CreateTable: V12SpatialSite
CREATE TABLE IF NOT EXISTS "V12SpatialSite" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "companyId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotW" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleX" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleY" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleZ" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "V12SpatialSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable: V12SpatialBuilding
CREATE TABLE IF NOT EXISTS "V12SpatialBuilding" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotW" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleX" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleY" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleZ" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "V12SpatialBuilding_pkey" PRIMARY KEY ("id")
);

-- CreateTable: V12SpatialFloor
CREATE TABLE IF NOT EXISTS "V12SpatialFloor" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotW" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleX" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleY" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleZ" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "V12SpatialFloor_pkey" PRIMARY KEY ("id")
);

-- CreateTable: V12SpatialRoom
CREATE TABLE IF NOT EXISTS "V12SpatialRoom" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ROOM',
    "departmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotW" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleX" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleY" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleZ" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "V12SpatialRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable: V12SpatialWorkspace
CREATE TABLE IF NOT EXISTS "V12SpatialWorkspace" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employeeId" TEXT,
    "companyId" TEXT,
    "departmentId" TEXT,
    "floorId" TEXT,
    "buildingId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isOccupied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotW" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleX" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleY" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleZ" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "V12SpatialWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable: V12SpatialParkingArea
CREATE TABLE IF NOT EXISTS "V12SpatialParkingArea" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "availableSpots" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotW" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleX" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleY" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleZ" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "V12SpatialParkingArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable: V12NavigationNode
CREATE TABLE IF NOT EXISTS "V12NavigationNode" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "floorId" TEXT,
    "buildingId" TEXT,
    "siteId" TEXT,
    "nodeType" TEXT NOT NULL DEFAULT 'WAYPOINT',
    "isTraversable" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "V12NavigationNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable: V12SpatialMovementState
CREATE TABLE IF NOT EXISTS "V12SpatialMovementState" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "currentLocationId" TEXT NOT NULL,
    "currentLocationType" TEXT NOT NULL,
    "currentNodeId" TEXT,
    "destinationNodeId" TEXT,
    "path" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "totalDistance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "movementState" TEXT NOT NULL DEFAULT 'IDLE',
    "movementMode" TEXT NOT NULL DEFAULT 'WALK',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "blockedReason" TEXT,
    "intentSource" TEXT,
    "intentId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "V12SpatialMovementState_pkey" PRIMARY KEY ("id")
);

-- CreateTable: V12SpatialVehicle
CREATE TABLE IF NOT EXISTS "V12SpatialVehicle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ownerEmployeeId" TEXT,
    "vehicleClass" TEXT NOT NULL DEFAULT 'STANDARD',
    "assetId" TEXT,
    "occupantEmployeeIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "parkingAreaId" TEXT,
    "isParked" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "V12SpatialVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable: V12SpatialTopologyEdge
CREATE TABLE IF NOT EXISTS "V12SpatialTopologyEdge" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "distance" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "traversalType" TEXT NOT NULL DEFAULT 'WALK',
    "accessibility" TEXT NOT NULL DEFAULT 'ALL',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "V12SpatialTopologyEdge_pkey" PRIMARY KEY ("id")
);

-- =============================================================================
-- STAGE 4: COLUMN EXTENSIONS ON EXISTING TABLES (15 Tables, 55 Columns)
-- =============================================================================

-- AlterTable: "Company" (1 columns)
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "groupId" TEXT;

-- AlterTable: "Goal" (2 columns)
ALTER TABLE "Goal" ADD COLUMN IF NOT EXISTS "ceoPlan" JSONB;
ALTER TABLE "Goal" ADD COLUMN IF NOT EXISTS "finalReport" TEXT;

-- AlterTable: "Task" (4 columns)
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "requiredCapability" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "type" "TaskType" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "parentTaskId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;

-- AlterTable: "Project" (1 columns)
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "type" "ProjectType" NOT NULL DEFAULT 'NODE';

-- AlterTable: "ProjectDelivery" (1 columns)
ALTER TABLE "ProjectDelivery" ADD COLUMN IF NOT EXISTS "buildId" TEXT;

-- AlterTable: "CompanyBudget" (8 columns)
ALTER TABLE "CompanyBudget" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "CompanyBudget" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "CompanyBudget" ADD COLUMN IF NOT EXISTS "fiscalPeriodStart" TIMESTAMP(3);
ALTER TABLE "CompanyBudget" ADD COLUMN IF NOT EXISTS "fiscalPeriodEnd" TIMESTAMP(3);
ALTER TABLE "CompanyBudget" ADD COLUMN IF NOT EXISTS "totalAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CompanyBudget" ADD COLUMN IF NOT EXISTS "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "CompanyBudget" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "CompanyBudget" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;

-- AlterTable: "DepartmentBudget" (10 columns)
ALTER TABLE "DepartmentBudget" ADD COLUMN IF NOT EXISTS "budgetId" TEXT;
ALTER TABLE "DepartmentBudget" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "DepartmentBudget" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "DepartmentBudget" ADD COLUMN IF NOT EXISTS "fiscalPeriodStart" TIMESTAMP(3);
ALTER TABLE "DepartmentBudget" ADD COLUMN IF NOT EXISTS "fiscalPeriodEnd" TIMESTAMP(3);
ALTER TABLE "DepartmentBudget" ADD COLUMN IF NOT EXISTS "totalAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DepartmentBudget" ADD COLUMN IF NOT EXISTS "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "DepartmentBudget" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "DepartmentBudget" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "DepartmentBudget" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;

-- AlterTable: "MeetingActionItem" (1 columns)
ALTER TABLE "MeetingActionItem" ADD COLUMN IF NOT EXISTS "requiredCapability" TEXT;

-- AlterTable: "CompanyObjective" (1 columns)
ALTER TABLE "CompanyObjective" ADD COLUMN IF NOT EXISTS "planId" TEXT;

-- AlterTable: "CompanyKPI" (12 columns)
ALTER TABLE "CompanyKPI" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "CompanyKPI" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
ALTER TABLE "CompanyKPI" ADD COLUMN IF NOT EXISTS "strategicPlanId" TEXT;
ALTER TABLE "CompanyKPI" ADD COLUMN IF NOT EXISTS "strategicInitiativeId" TEXT;
ALTER TABLE "CompanyKPI" ADD COLUMN IF NOT EXISTS "measurementDirection" "KpiMeasurementDirection" NOT NULL DEFAULT 'HIGHER_IS_BETTER';
ALTER TABLE "CompanyKPI" ADD COLUMN IF NOT EXISTS "warningThreshold" INTEGER;
ALTER TABLE "CompanyKPI" ADD COLUMN IF NOT EXISTS "criticalThreshold" INTEGER;
ALTER TABLE "CompanyKPI" ADD COLUMN IF NOT EXISTS "previousValue" INTEGER;
ALTER TABLE "CompanyKPI" ADD COLUMN IF NOT EXISTS "progressPercentage" DOUBLE PRECISION;
ALTER TABLE "CompanyKPI" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CompanyKPI" ADD COLUMN IF NOT EXISTS "periodStart" TIMESTAMP(3);
ALTER TABLE "CompanyKPI" ADD COLUMN IF NOT EXISTS "periodEnd" TIMESTAMP(3);

-- AlterTable: "CompanyRisk" (1 columns)
ALTER TABLE "CompanyRisk" ADD COLUMN IF NOT EXISTS "objectiveId" TEXT;

-- AlterTable: "StrategicInitiative" (6 columns)
ALTER TABLE "StrategicInitiative" ADD COLUMN IF NOT EXISTS "actualCost" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StrategicInitiative" ADD COLUMN IF NOT EXISTS "progress" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StrategicInitiative" ADD COLUMN IF NOT EXISTS "budgetId" TEXT;
ALTER TABLE "StrategicInitiative" ADD COLUMN IF NOT EXISTS "targetDate" TIMESTAMP(3);
ALTER TABLE "StrategicInitiative" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
ALTER TABLE "StrategicInitiative" ADD COLUMN IF NOT EXISTS "priority" "ObjectivePriority" NOT NULL DEFAULT 'NORMAL';

-- AlterTable: "AeEnterpriseObjective" (4 columns)
ALTER TABLE "AeEnterpriseObjective" ADD COLUMN IF NOT EXISTS "failureClass" "AeFailureClassification";
ALTER TABLE "AeEnterpriseObjective" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
ALTER TABLE "AeEnterpriseObjective" ADD COLUMN IF NOT EXISTS "recoveryAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AeEnterpriseObjective" ADD COLUMN IF NOT EXISTS "replanningAttempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: "AssistantMessage" (1 columns)
ALTER TABLE "AssistantMessage" ADD COLUMN IF NOT EXISTS "groupId" TEXT;

-- AlterTable: "ChairmanAlert" (2 columns)
ALTER TABLE "ChairmanAlert" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);
ALTER TABLE "ChairmanAlert" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);

-- =============================================================================
-- STAGE 5: UNIQUE CONSTRAINTS & PERFORMANCE INDEXES
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS "BrowserProfile_employeeId_key" ON "BrowserProfile"("employeeId");
CREATE UNIQUE INDEX IF NOT EXISTS "BrowserConversation_employeeId_provider_key" ON "BrowserConversation"("employeeId", "provider");
CREATE UNIQUE INDEX IF NOT EXISTS "CeoFinancialDecision_idempotencyKey_key" ON "CeoFinancialDecision"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "SuccessionPlan_companyId_roleId_departmentId_key" ON "SuccessionPlan"("companyId", "roleId", "departmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "SuccessionCandidate_planId_employeeId_key" ON "SuccessionCandidate"("planId", "employeeId");
CREATE UNIQUE INDEX IF NOT EXISTS "V12SpatialWorld_name_key" ON "V12SpatialWorld"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "V12SpatialWorkspace_employeeId_key" ON "V12SpatialWorkspace"("employeeId");
CREATE UNIQUE INDEX IF NOT EXISTS "V12SpatialMovementState_entityId_key" ON "V12SpatialMovementState"("entityId");
CREATE UNIQUE INDEX IF NOT EXISTS "V12SpatialVehicle_ownerEmployeeId_key" ON "V12SpatialVehicle"("ownerEmployeeId");

CREATE INDEX IF NOT EXISTS "BrowserProfile_status_idx" ON "BrowserProfile"("status");
CREATE INDEX IF NOT EXISTS "BrowserConversation_status_idx" ON "BrowserConversation"("status");
CREATE INDEX IF NOT EXISTS "StrategicPlan_companyId_status_idx" ON "StrategicPlan"("companyId", "status");
CREATE INDEX IF NOT EXISTS "CompanyKPIMeasurement_kpiId_idx" ON "CompanyKPIMeasurement"("kpiId");
CREATE INDEX IF NOT EXISTS "ChairmanCommand_companyId_idx" ON "ChairmanCommand"("companyId");
CREATE INDEX IF NOT EXISTS "ChairmanCommand_chairmanId_idx" ON "ChairmanCommand"("chairmanId");
CREATE INDEX IF NOT EXISTS "CeoFinancialAuthority_companyId_authorityStatus_idx" ON "CeoFinancialAuthority"("companyId", "authorityStatus");
CREATE INDEX IF NOT EXISTS "CeoFinancialDecision_companyId_operation_createdAt_idx" ON "CeoFinancialDecision"("companyId", "operation", "createdAt");
CREATE INDEX IF NOT EXISTS "StrategicMilestone_companyId_status_idx" ON "StrategicMilestone"("companyId", "status");
CREATE INDEX IF NOT EXISTS "StrategicMilestone_objectiveId_idx" ON "StrategicMilestone"("objectiveId");
CREATE INDEX IF NOT EXISTS "V12SpatialVehicle_companyId_idx" ON "V12SpatialVehicle"("companyId");

-- =============================================================================
-- STAGE 6: FOREIGN KEY CONSTRAINTS (54 from New Tables + 11 from Altered Tables)
-- =============================================================================

-- AddForeignKey: AevoraGroup.chairmanId -> Chairman.id
DO $$ BEGIN
    ALTER TABLE "AevoraGroup" ADD CONSTRAINT "AevoraGroup_chairmanId_fkey" FOREIGN KEY ("chairmanId") REFERENCES "Chairman"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: BrowserProfile.employeeId -> Employee.id
DO $$ BEGIN
    ALTER TABLE "BrowserProfile" ADD CONSTRAINT "BrowserProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: BrowserConversation.employeeId -> Employee.id
DO $$ BEGIN
    ALTER TABLE "BrowserConversation" ADD CONSTRAINT "BrowserConversation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: BrowserConversation.browserProfileId -> BrowserProfile.id
DO $$ BEGIN
    ALTER TABLE "BrowserConversation" ADD CONSTRAINT "BrowserConversation_browserProfileId_fkey" FOREIGN KEY ("browserProfileId") REFERENCES "BrowserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: StrategicPlan.companyId -> Company.id
DO $$ BEGIN
    ALTER TABLE "StrategicPlan" ADD CONSTRAINT "StrategicPlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: CompanyKPIMeasurement.kpiId -> CompanyKPI.id
DO $$ BEGIN
    ALTER TABLE "CompanyKPIMeasurement" ADD CONSTRAINT "CompanyKPIMeasurement_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "CompanyKPI"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ChairmanCommand.companyId -> Company.id
DO $$ BEGIN
    ALTER TABLE "ChairmanCommand" ADD CONSTRAINT "ChairmanCommand_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ChairmanCommand.chairmanId -> Chairman.id
DO $$ BEGIN
    ALTER TABLE "ChairmanCommand" ADD CONSTRAINT "ChairmanCommand_chairmanId_fkey" FOREIGN KEY ("chairmanId") REFERENCES "Chairman"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ChairmanCommand.approvalId -> ApprovalRequest.id
DO $$ BEGIN
    ALTER TABLE "ChairmanCommand" ADD CONSTRAINT "ChairmanCommand_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: CeoFinancialAuthority.companyId -> Company.id
DO $$ BEGIN
    ALTER TABLE "CeoFinancialAuthority" ADD CONSTRAINT "CeoFinancialAuthority_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: CeoFinancialAuthority.ceoEmployeeId -> Employee.id
DO $$ BEGIN
    ALTER TABLE "CeoFinancialAuthority" ADD CONSTRAINT "CeoFinancialAuthority_ceoEmployeeId_fkey" FOREIGN KEY ("ceoEmployeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: CeoFinancialDecision.companyId -> Company.id
DO $$ BEGIN
    ALTER TABLE "CeoFinancialDecision" ADD CONSTRAINT "CeoFinancialDecision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: CeoFinancialDecision.ceoEmployeeId -> Employee.id
DO $$ BEGIN
    ALTER TABLE "CeoFinancialDecision" ADD CONSTRAINT "CeoFinancialDecision_ceoEmployeeId_fkey" FOREIGN KEY ("ceoEmployeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: CeoFinancialDecision.authorityId -> CeoFinancialAuthority.id
DO $$ BEGIN
    ALTER TABLE "CeoFinancialDecision" ADD CONSTRAINT "CeoFinancialDecision_authorityId_fkey" FOREIGN KEY ("authorityId") REFERENCES "CeoFinancialAuthority"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: StrategicMilestone.companyId -> Company.id
DO $$ BEGIN
    ALTER TABLE "StrategicMilestone" ADD CONSTRAINT "StrategicMilestone_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: StrategicMilestone.objectiveId -> CompanyObjective.id
DO $$ BEGIN
    ALTER TABLE "StrategicMilestone" ADD CONSTRAINT "StrategicMilestone_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "CompanyObjective"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: StrategicMilestone.ownerId -> Employee.id
DO $$ BEGIN
    ALTER TABLE "StrategicMilestone" ADD CONSTRAINT "StrategicMilestone_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: PerformanceEvaluation.companyId -> Company.id
DO $$ BEGIN
    ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: PerformanceEvaluation.employeeId -> Employee.id
DO $$ BEGIN
    ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: PerformanceEvaluation.departmentId -> Department.id
DO $$ BEGIN
    ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: PerformanceEvaluation.evaluatorId -> Employee.id
DO $$ BEGIN
    ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: SuccessionPlan.companyId -> Company.id
DO $$ BEGIN
    ALTER TABLE "SuccessionPlan" ADD CONSTRAINT "SuccessionPlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: SuccessionPlan.roleId -> Role.id
DO $$ BEGIN
    ALTER TABLE "SuccessionPlan" ADD CONSTRAINT "SuccessionPlan_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: SuccessionPlan.departmentId -> Department.id
DO $$ BEGIN
    ALTER TABLE "SuccessionPlan" ADD CONSTRAINT "SuccessionPlan_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: SuccessionPlan.currentHolderId -> Employee.id
DO $$ BEGIN
    ALTER TABLE "SuccessionPlan" ADD CONSTRAINT "SuccessionPlan_currentHolderId_fkey" FOREIGN KEY ("currentHolderId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: SuccessionCandidate.planId -> SuccessionPlan.id
DO $$ BEGIN
    ALTER TABLE "SuccessionCandidate" ADD CONSTRAINT "SuccessionCandidate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SuccessionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: SuccessionCandidate.employeeId -> Employee.id
DO $$ BEGIN
    ALTER TABLE "SuccessionCandidate" ADD CONSTRAINT "SuccessionCandidate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ClientMeeting.companyId -> Company.id
DO $$ BEGIN
    ALTER TABLE "ClientMeeting" ADD CONSTRAINT "ClientMeeting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ClientMeeting.leadId -> SalesLead.id
DO $$ BEGIN
    ALTER TABLE "ClientMeeting" ADD CONSTRAINT "ClientMeeting_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SalesLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ClientMeeting.clientId -> Client.id
DO $$ BEGIN
    ALTER TABLE "ClientMeeting" ADD CONSTRAINT "ClientMeeting_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ClientMeeting.projectId -> Project.id
DO $$ BEGIN
    ALTER TABLE "ClientMeeting" ADD CONSTRAINT "ClientMeeting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ClientMeeting.opportunityId -> Opportunity.id
DO $$ BEGIN
    ALTER TABLE "ClientMeeting" ADD CONSTRAINT "ClientMeeting_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ProjectDevelopmentExecution.projectId -> Project.id
DO $$ BEGIN
    ALTER TABLE "ProjectDevelopmentExecution" ADD CONSTRAINT "ProjectDevelopmentExecution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ProjectBuildExecution.projectId -> Project.id
DO $$ BEGIN
    ALTER TABLE "ProjectBuildExecution" ADD CONSTRAINT "ProjectBuildExecution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ProjectTestExecution.projectId -> Project.id
DO $$ BEGIN
    ALTER TABLE "ProjectTestExecution" ADD CONSTRAINT "ProjectTestExecution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ResearchExecution.projectId -> ResearchProject.id
DO $$ BEGIN
    ALTER TABLE "ResearchExecution" ADD CONSTRAINT "ResearchExecution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ResearchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ResearchExecution.employeeId -> Employee.id
DO $$ BEGIN
    ALTER TABLE "ResearchExecution" ADD CONSTRAINT "ResearchExecution_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ResearchSource.executionId -> ResearchExecution.id
DO $$ BEGIN
    ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ResearchExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ResearchFinding.executionId -> ResearchExecution.id
DO $$ BEGIN
    ALTER TABLE "ResearchFinding" ADD CONSTRAINT "ResearchFinding_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ResearchExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ResearchFinding.sourceId -> ResearchSource.id
DO $$ BEGIN
    ALTER TABLE "ResearchFinding" ADD CONSTRAINT "ResearchFinding_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ResearchSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ResearchPerspective.projectId -> ResearchProject.id
DO $$ BEGIN
    ALTER TABLE "ResearchPerspective" ADD CONSTRAINT "ResearchPerspective_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ResearchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ResearchPerspective.executionId -> ResearchExecution.id
DO $$ BEGIN
    ALTER TABLE "ResearchPerspective" ADD CONSTRAINT "ResearchPerspective_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ResearchExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ResearchPerspective.employeeId -> Employee.id
DO $$ BEGIN
    ALTER TABLE "ResearchPerspective" ADD CONSTRAINT "ResearchPerspective_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ResearchSynthesis.projectId -> ResearchProject.id
DO $$ BEGIN
    ALTER TABLE "ResearchSynthesis" ADD CONSTRAINT "ResearchSynthesis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ResearchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: ResearchSynthesis.synthesizerId -> Employee.id
DO $$ BEGIN
    ALTER TABLE "ResearchSynthesis" ADD CONSTRAINT "ResearchSynthesis_synthesizerId_fkey" FOREIGN KEY ("synthesizerId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: V12SpatialRegion.worldId -> V12SpatialWorld.id
DO $$ BEGIN
    ALTER TABLE "V12SpatialRegion" ADD CONSTRAINT "V12SpatialRegion_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "V12SpatialWorld"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: V12SpatialCountry.regionId -> V12SpatialRegion.id
DO $$ BEGIN
    ALTER TABLE "V12SpatialCountry" ADD CONSTRAINT "V12SpatialCountry_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "V12SpatialRegion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: V12SpatialCity.countryId -> V12SpatialCountry.id
DO $$ BEGIN
    ALTER TABLE "V12SpatialCity" ADD CONSTRAINT "V12SpatialCity_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "V12SpatialCountry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: V12SpatialSite.cityId -> V12SpatialCity.id
DO $$ BEGIN
    ALTER TABLE "V12SpatialSite" ADD CONSTRAINT "V12SpatialSite_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "V12SpatialCity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: V12SpatialBuilding.siteId -> V12SpatialSite.id
DO $$ BEGIN
    ALTER TABLE "V12SpatialBuilding" ADD CONSTRAINT "V12SpatialBuilding_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "V12SpatialSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: V12SpatialFloor.buildingId -> V12SpatialBuilding.id
DO $$ BEGIN
    ALTER TABLE "V12SpatialFloor" ADD CONSTRAINT "V12SpatialFloor_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "V12SpatialBuilding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: V12SpatialRoom.floorId -> V12SpatialFloor.id
DO $$ BEGIN
    ALTER TABLE "V12SpatialRoom" ADD CONSTRAINT "V12SpatialRoom_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "V12SpatialFloor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: V12SpatialWorkspace.roomId -> V12SpatialRoom.id
DO $$ BEGIN
    ALTER TABLE "V12SpatialWorkspace" ADD CONSTRAINT "V12SpatialWorkspace_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "V12SpatialRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: V12SpatialParkingArea.siteId -> V12SpatialSite.id
DO $$ BEGIN
    ALTER TABLE "V12SpatialParkingArea" ADD CONSTRAINT "V12SpatialParkingArea_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "V12SpatialSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: Company.groupId -> AevoraGroup.id
DO $$ BEGIN
    ALTER TABLE "Company" ADD CONSTRAINT "Company_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AevoraGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: Task.parentTaskId -> Task.id
DO $$ BEGIN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: Task.departmentId -> Department.id
DO $$ BEGIN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: DepartmentBudget.budgetId -> CompanyBudget.id
DO $$ BEGIN
    ALTER TABLE "DepartmentBudget" ADD CONSTRAINT "DepartmentBudget_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "CompanyBudget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: CompanyObjective.planId -> StrategicPlan.id
DO $$ BEGIN
    ALTER TABLE "CompanyObjective" ADD CONSTRAINT "CompanyObjective_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StrategicPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: CompanyKPI.departmentId -> Department.id
DO $$ BEGIN
    ALTER TABLE "CompanyKPI" ADD CONSTRAINT "CompanyKPI_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: CompanyKPI.strategicPlanId -> StrategicPlan.id
DO $$ BEGIN
    ALTER TABLE "CompanyKPI" ADD CONSTRAINT "CompanyKPI_strategicPlanId_fkey" FOREIGN KEY ("strategicPlanId") REFERENCES "StrategicPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: CompanyKPI.strategicInitiativeId -> StrategicInitiative.id
DO $$ BEGIN
    ALTER TABLE "CompanyKPI" ADD CONSTRAINT "CompanyKPI_strategicInitiativeId_fkey" FOREIGN KEY ("strategicInitiativeId") REFERENCES "StrategicInitiative"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: CompanyRisk.objectiveId -> CompanyObjective.id
DO $$ BEGIN
    ALTER TABLE "CompanyRisk" ADD CONSTRAINT "CompanyRisk_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "CompanyObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: StrategicInitiative.departmentId -> Department.id
DO $$ BEGIN
    ALTER TABLE "StrategicInitiative" ADD CONSTRAINT "StrategicInitiative_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: AssistantMessage.groupId -> AevoraGroup.id
DO $$ BEGIN
    ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AevoraGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
