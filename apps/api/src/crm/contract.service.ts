import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEnvironment, ContractStatus } from '@prisma/client';
import { ProductionExecutionGateService } from '../production/production-execution-gate.service';

@Injectable()
export class ContractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: ProductionExecutionGateService
  ) {}

  async draftContract(companyId: string, clientId: string, title: string, content: string, commercialTerms: any = {}, parties: any[] = [], effectiveDate: any = null): Promise<any> {
    if (!companyId || !clientId) throw new BadRequestException('Company and Client are required');
    const { hashMaterialParams } = require('../approval/parameter-binding.util');
    const hashInputDraft = {
      title,
      content,
      commercialTerms,
      parties,
      effectiveDate
    };
    const contentHash = hashMaterialParams(hashInputDraft);

    return this.prisma.contract.create({
      data: {
        companyId,
        clientId,
        title,
        content,
        contentHash,
        commercialTerms,
        parties,
        version: 1,
        status: ContractStatus.DRAFT
      }
    });
  }

  async commitContract(companyId: string, actorId: string, contractId: string, approvalId: string): Promise<any> {
    const { hashMaterialParams } = require('../approval/parameter-binding.util');
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new BadRequestException('Contract not found');
    if (contract.companyId !== companyId) throw new BadRequestException('Contract does not belong to company');
    if (contract.status !== ContractStatus.DRAFT && contract.status !== ContractStatus.REVIEW) {
      throw new BadRequestException('Contract is not in a committable state');
    }
    const hashInput = {
      title: contract.title,
      content: contract.content,
      commercialTerms: contract.commercialTerms, 
      parties: contract.parties,
      effectiveDate: contract.effectiveDate
    };
    const contentHash = hashMaterialParams(hashInput);

    await this.gate.authorizeProductionAction({
      companyId,
      actorId,
      environment: ExecutionEnvironment.PRODUCTION,
      capability: 'COMMIT_CONTRACT',
      action: 'COMMIT',
      resourceId: contractId,
      parameters: { contractId, contractVersion: contract.version, contentHash, clientId: contract.clientId },
      approvalId
    });
    
    return this.prisma.contract.update({
      where: { id: contractId, companyId, version: contract.version },
      data: { 
        status: ContractStatus.APPROVED,
        approvalId 
      }
    });
  }
}
