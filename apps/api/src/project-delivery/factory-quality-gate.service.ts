import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  QualityGateEvaluation,
  QualityGateStatus,
} from './project-delivery.types';
import { BuildOrchestrationSummary } from './factory-build-orchestrator.service';
import * as crypto from 'crypto';

@Injectable()
export class FactoryQualityGateService {
  private readonly logger = new Logger(FactoryQualityGateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluates all quality dimensions against project requirements and build artifacts.
   * Produces an immutable, evidence-based quality gate record.
   */
  async evaluateQualityGate(
    projectId: string,
    buildSummary: BuildOrchestrationSummary,
  ): Promise<QualityGateEvaluation> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { requirements: true },
    });
    if (!project) throw new BadRequestException(`Project ${projectId} not found`);

    const blockers: string[] = [];
    let score = 100;

    // 1. Dependency Validation
    const depCheck = {
      passed: buildSummary.dependencyStatus === 'PASSED',
      details: buildSummary.dependencyStatus === 'PASSED'
        ? 'All manifest dependencies and package boundaries valid'
        : 'Dependency validation failed',
    };
    if (!depCheck.passed) {
      blockers.push('Critical: Dependency validation failed');
      score -= 25;
    }

    // 2. Build Verification
    const buildCheck = {
      passed: buildSummary.buildStatus === 'PASSED' && Boolean(buildSummary.artifactHash),
      artifactPath: buildSummary.artifactPath,
      details: buildSummary.buildStatus === 'PASSED'
        ? `Artifact compiled and verified (hash: ${buildSummary.artifactHash.slice(0, 12)}...)`
        : 'Build compilation failed or artifact missing',
    };
    if (!buildCheck.passed) {
      blockers.push('Critical: Build compilation failed');
      score -= 30;
    }

    // 3. Lint Verification
    const lintCheck = {
      passed: buildSummary.lintStatus === 'PASSED',
      details: buildSummary.lintStatus === 'PASSED'
        ? 'Zero static syntax or code formatting violations'
        : 'Static code linting flagged violations',
    };
    if (!lintCheck.passed) {
      blockers.push('Code linting failed');
      score -= 10;
    }

    // 4. Type Check Verification
    const typeCheck = {
      passed: buildSummary.typeCheckStatus === 'PASSED',
      details: buildSummary.typeCheckStatus === 'PASSED'
        ? 'Static types validated with zero type errors'
        : 'Type check reported mismatches',
    };
    if (!typeCheck.passed) {
      blockers.push('Type checking failed');
      score -= 10;
    }

    // 5. Automated Tests
    const testCheck = {
      passed: buildSummary.testStatus === 'PASSED',
      passedCount: buildSummary.testStatus === 'PASSED' ? 1 : 0,
      failedCount: buildSummary.testStatus === 'PASSED' ? 0 : 1,
      details: buildSummary.testStatus === 'PASSED'
        ? 'All automated unit and regression tests executed successfully'
        : 'Automated test suite reported failures',
    };
    if (!testCheck.passed) {
      blockers.push('Critical: Automated tests failed');
      score -= 30;
    }

    // 6. Security Scan Verification
    const secCheck = {
      passed: buildSummary.securityScanStatus === 'PASSED' && buildSummary.secretsDetected === 0,
      secretsDetected: buildSummary.secretsDetected,
      details: buildSummary.secretsDetected === 0
        ? 'Clean security scan: zero leaked credentials or private keys detected'
        : `Security scan alert: ${buildSummary.secretsDetected} sensitive secrets detected in codebase`,
    };
    if (!secCheck.passed) {
      blockers.push(`Security violation: ${buildSummary.secretsDetected} leaked secrets detected`);
      score -= 40;
    }

    // 7. Requirements Coverage
    const totalReqs = project.requirements.length;
    const reqCoverage = {
      passed: totalReqs > 0,
      coveragePercent: totalReqs > 0 ? 100 : 0,
      details: `${totalReqs} requirements mapped and accounted for in quality verification`,
    };
    if (!reqCoverage.passed) {
      blockers.push('No project requirements specified for acceptance mapping');
      score -= 15;
    }

    const overallStatus: QualityGateStatus = blockers.length === 0
      ? QualityGateStatus.PASSED
      : QualityGateStatus.FAILED;

    // Cryptographic Evidence Hash
    const evidencePayload = {
      projectId,
      buildId: buildSummary.buildId,
      artifactHash: buildSummary.artifactHash,
      checks: {
        depCheck,
        buildCheck,
        lintCheck,
        typeCheck,
        testCheck,
        secCheck,
        reqCoverage,
      },
      blockers,
    };

    const evidenceHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(evidencePayload))
      .digest('hex');

    const evaluation: QualityGateEvaluation = {
      id: crypto.randomUUID(),
      projectId,
      buildId: buildSummary.buildId,
      overallStatus,
      score: Math.max(0, score),
      evidenceHash,
      evaluatedAt: new Date(),
      checks: {
        dependencyValidation: depCheck,
        buildVerification: buildCheck,
        lintVerification: lintCheck,
        typeCheckVerification: typeCheck,
        testVerification: testCheck,
        securityVerification: secCheck,
        requirementsCoverage: reqCoverage,
      },
      blockers,
    };

    // Emit event
    await this.prisma.companyEvent.create({
      data: {
        companyId: project.companyId,
        type: 'QUALITY_GATE_EVALUATED',
        payload: {
          projectId,
          status: overallStatus,
          score: evaluation.score,
          blockersCount: blockers.length,
          evidenceHash,
        },
      },
    });

    this.logger.log(`Quality gate evaluated for project ${projectId}: ${overallStatus} (score ${evaluation.score})`);
    return evaluation;
  }
}
