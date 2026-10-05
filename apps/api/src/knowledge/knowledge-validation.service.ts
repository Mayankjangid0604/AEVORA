import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeValidationType, KnowledgeValidationResult, KnowledgeStatus } from '@prisma/client';

@Injectable()
export class KnowledgeValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  async validateKnowledge(
    companyId: string,
    knowledgeId: string,
    validationData: {
      validatorEmployeeId?: string;
      validationType: KnowledgeValidationType;
      result: KnowledgeValidationResult;
      reason?: string;
    }
  ) {
    await this.knowledgeService.getKnowledgeById(companyId, knowledgeId);

    // Create the validation record
    const validation = await this.prisma.knowledgeValidation.create({
      data: {
        knowledgeId,
        validatorEmployeeId: validationData.validatorEmployeeId,
        validationType: validationData.validationType,
        result: validationData.result,
        reason: validationData.reason,
      },
    });

    // Simple policy for now: If a CHAIRMAN_APPROVAL or MANAGER_REVIEW validates it as SUPPORTED, it becomes CANONICAL.
    // If it's REJECTED, it becomes REJECTED.
    // This can be expanded to use AgentPolicyService later.

    if (validationData.result === KnowledgeValidationResult.SUPPORTED) {
      if (
        validationData.validationType === KnowledgeValidationType.CHAIRMAN_APPROVAL ||
        validationData.validationType === KnowledgeValidationType.MANAGER_REVIEW
      ) {
        await this.prisma.knowledgeRecord.update({
          where: { id: knowledgeId },
          data: { status: KnowledgeStatus.CANONICAL, approvedByEmployeeId: validationData.validatorEmployeeId },
        });
      } else {
        // Just VALIDATED by a normal mechanism
        await this.prisma.knowledgeRecord.update({
          where: { id: knowledgeId },
          data: { status: KnowledgeStatus.VALIDATED },
        });
      }
    } else if (validationData.result === KnowledgeValidationResult.UNSUPPORTED) {
       await this.prisma.knowledgeRecord.update({
          where: { id: knowledgeId },
          data: { status: KnowledgeStatus.REJECTED },
        });
    }

    return validation;
  }
}
