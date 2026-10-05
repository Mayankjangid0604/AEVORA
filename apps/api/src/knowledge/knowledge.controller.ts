import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  ForbiddenException,
  Query,
} from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import { KnowledgeExtractionService } from './knowledge-extraction.service';
import { KnowledgeValidationService } from './knowledge-validation.service';
import { KnowledgeType, KnowledgeStatus, KnowledgeImportance, KnowledgeSourceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly retrievalService: KnowledgeRetrievalService,
    private readonly extractionService: KnowledgeExtractionService,
    private readonly validationService: KnowledgeValidationService,
    private readonly prisma: PrismaService,
  ) {}

  private async requireEmployeeCompany(employeeId: string) {
    if (!employeeId) throw new ForbiddenException('Missing x-employee-id header');
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new ForbiddenException('Invalid employee');
    return employee.companyId;
  }

  @Get('search')
  async searchKnowledge(
    @Headers('x-employee-id') employeeId: string,
    @Query('keyword') keyword?: string,
    @Query('type') type?: KnowledgeType,
    @Query('status') status?: KnowledgeStatus,
    @Query('importance') importance?: KnowledgeImportance,
    @Query('projectId') projectId?: string,
  ) {
    const companyId = await this.requireEmployeeCompany(employeeId);
    return this.retrievalService.searchKnowledge(companyId, {
      keyword,
      type,
      status,
      importance,
      projectId,
    });
  }

  @Get(':id')
  async getKnowledge(
    @Headers('x-employee-id') employeeId: string,
    @Param('id') knowledgeId: string,
  ) {
    const companyId = await this.requireEmployeeCompany(employeeId);
    return this.knowledgeService.getKnowledgeById(companyId, knowledgeId);
  }

  @Post('propose')
  async proposeKnowledge(
    @Headers('x-employee-id') employeeId: string,
    @Body() body: {
      sourceContent: string;
      sourceType: KnowledgeSourceType;
      sourceId: string;
      projectId?: string;
    }
  ) {
    const companyId = await this.requireEmployeeCompany(employeeId);
    return this.extractionService.proposeKnowledgeFromSource(
      companyId,
      body.sourceContent,
      {
        sourceType: body.sourceType,
        sourceId: body.sourceId,
        createdByEmployeeId: employeeId,
        projectId: body.projectId,
      }
    );
  }
}
