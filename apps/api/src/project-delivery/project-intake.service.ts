import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectIntakeDto, StructuredRequirement } from './project-delivery.types';

@Injectable()
export class ProjectIntakeService {
  private readonly logger = new Logger(ProjectIntakeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Performs structured intake analysis on incoming project requests.
   * Validates company, client boundaries, creates project record, and decomposes requirements.
   */
  async processIntake(dto: ProjectIntakeDto) {
    const { companyId, clientId, name, description, rawRequirements = [], budgetPaise, targetDeadline } = dto;

    if (!companyId) throw new BadRequestException('Company ID is required for project intake');
    if (!clientId) throw new BadRequestException('Client ID is required for project intake');
    if (!name || name.trim().length < 3) {
      throw new BadRequestException('Project name must be at least 3 characters');
    }

    // 1. Verify Company & Client Existence & Boundary
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException(`Company ${companyId} not found`);

    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException(`Client ${clientId} not found`);
    if (client.companyId !== companyId) {
      throw new BadRequestException(`Client ${clientId} does not belong to company ${companyId}`);
    }

    // 2. Structured Requirements Decomposition
    const structuredReqs = this.decomposeRequirements(rawRequirements, description);

    // 3. Create or Link Opportunity & Proposal if not passed
    let opportunityId = dto.opportunityId;
    if (!opportunityId) {
      const opp = await this.prisma.opportunity.create({
        data: {
          companyId,
          clientId,
          title: name,
          description,
          status: 'WON',
          estimatedValue: budgetPaise ? Math.floor(budgetPaise / 100) : 10000,
        },
      });
      opportunityId = opp.id;
    }

    let proposalId = dto.proposalId;
    if (!proposalId) {
      const price = budgetPaise ? Math.floor(budgetPaise / 100) : 10000;
      const prop = await this.prisma.proposal.create({
        data: {
          opportunity: { connect: { id: opportunityId } },
          title: `Proposal for ${name}`,
          scope: description,
          deliverables: 'Functional software deliverables and verified tests',
          total: price,
          proposedPrice: price,
          status: 'ACCEPTED',
        },
      });
      proposalId = prop.id;
    }

    // 4. Create Project
    const project = await this.prisma.project.create({
      data: {
        companyId,
        clientId,
        opportunityId,
        proposalId,
        name,
        description,
        type: dto.projectType === 'WEBSITE' ? 'WEBSITE' : 'NODE',
        quotedPrice: budgetPaise ?? 1000000,
        estimatedCost: budgetPaise ? Math.floor(budgetPaise * 0.6) : 600000,
        margin: 40,
        status: 'PLANNED',
        targetEndDate: targetDeadline ? new Date(targetDeadline) : null,
      },
    });

    // 5. Persist Structured Requirements
    const createdRequirements = [];
    for (const req of structuredReqs) {
      const pr = await this.prisma.projectRequirement.create({
        data: {
          projectId: project.id,
          title: req.title,
          description: req.description,
          priority: req.priority,
          acceptanceCriteria: req.acceptanceCriteria.join('; '),
          source: 'INTAKE_DECOMPOSITION',
          status: 'OPEN',
        },
      });
      createdRequirements.push(pr);
    }

    // 6. Emit Company Event
    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'PROJECT_INTAKE_COMPLETED',
        payload: {
          projectId: project.id,
          name: project.name,
          requirementsCount: createdRequirements.length,
          budgetPaise: project.quotedPrice,
        },
      },
    });

    this.logger.log(`Project intake completed successfully for project ${project.id} (${project.name})`);

    return {
      project,
      requirements: createdRequirements,
      structuredAnalysis: structuredReqs,
    };
  }

  /**
   * Deterministically parses and decomposes raw text requirements into structured specifications.
   */
  decomposeRequirements(rawRequirements: string[], description: string): StructuredRequirement[] {
    const list = rawRequirements.length > 0
      ? rawRequirements
      : description.split('.').map(s => s.trim()).filter(s => s.length > 5);

    if (list.length === 0) {
      return [
        {
          title: 'Core System Implementation',
          description: description || 'Deliver functional system adhering to project scope.',
          priority: 'URGENT',
          category: 'FUNCTIONAL',
          acceptanceCriteria: [
            'System compiles without syntax or type errors',
            'Core features execute as described',
            'Automated tests pass with 100% success rate',
          ],
          technicalSpecs: ['TypeScript/Node.js runtime', 'Strict typing enabled'],
        },
      ];
    }

    return list.map((raw, idx) => {
      let priority: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW' = 'NORMAL';
      let category: 'FUNCTIONAL' | 'NON_FUNCTIONAL' | 'SECURITY' | 'INTEGRATION' = 'FUNCTIONAL';

      const lower = raw.toLowerCase();
      if (lower.includes('security') || lower.includes('auth') || lower.includes('credential')) {
        priority = 'URGENT';
        category = 'SECURITY';
      } else if (lower.includes('integration') || lower.includes('api') || lower.includes('webhook')) {
        priority = 'HIGH';
        category = 'INTEGRATION';
      } else if (lower.includes('performance') || lower.includes('latency') || lower.includes('scale')) {
        priority = 'HIGH';
        category = 'NON_FUNCTIONAL';
      } else if (idx === 0) {
        priority = 'URGENT';
      }

      return {
        title: `REQ-${idx + 1}: ${raw.slice(0, 50)}${raw.length > 50 ? '...' : ''}`,
        description: raw,
        priority,
        category,
        acceptanceCriteria: [
          `Verification that "${raw.slice(0, 40)}" is functionally demonstrated`,
          'Unit test coverage validating acceptance',
          'Zero regressions in existing test suite',
        ],
        technicalSpecs: [`Specification for ${category} requirement #${idx + 1}`],
      };
    });
  }
}
