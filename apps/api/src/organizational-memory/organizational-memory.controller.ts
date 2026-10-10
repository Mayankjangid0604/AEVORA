import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { ExecutiveMemoryService } from './executive-memory.service';
import { OutcomeEvaluationService } from './outcome-evaluation.service';
import { StrategicReflectionService } from './strategic-reflection.service';
import {
  DecisionOutcomeEvaluation,
  StrategicReflectionReport,
  StructuredMemoryRecord,
  MemoryCategory,
} from './organizational-memory.types';

@Controller('api/organizational-memory')
@UseGuards(JwtAuthGuard)
export class OrganizationalMemoryController {
  constructor(
    private readonly executiveMemory: ExecutiveMemoryService,
    private readonly outcomeEvaluation: OutcomeEvaluationService,
    private readonly reflectionService: StrategicReflectionService,
  ) {}

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  async evaluateOutcome(
    @Req() req: any,
    @Body() body: { decisionId: string; companyId?: string; actualMetrics?: any },
  ): Promise<DecisionOutcomeEvaluation> {
    const companyId = req.user?.companyId || body.companyId;
    if (body.companyId && req.user?.companyId && body.companyId !== req.user.companyId) {
      throw new ForbiddenException('Cross-company evaluation is prohibited.');
    }
    return this.outcomeEvaluation.evaluateDecisionOutcome(companyId, body.decisionId, body.actualMetrics);
  }

  @Post('record')
  @HttpCode(HttpStatus.CREATED)
  async recordMemory(
    @Req() req: any,
    @Body()
    body: {
      companyId?: string;
      category: MemoryCategory;
      subject: string;
      content: string;
      confidence?: number;
      applicableDomain?: string;
      sourceDecisionId?: string;
    },
  ): Promise<StructuredMemoryRecord> {
    const companyId = req.user?.companyId || body.companyId;
    const actorId = req.user?.id || req.user?.sub || 'system';
    return this.executiveMemory.recordMemory(companyId, actorId, body);
  }

  @Post('reflect')
  @HttpCode(HttpStatus.OK)
  async performReflection(
    @Req() req: any,
    @Body() body: { companyId?: string; periodDays?: number },
  ): Promise<StrategicReflectionReport> {
    const companyId = req.user?.companyId || body.companyId;
    const actorId = req.user?.id || req.user?.sub || 'system';
    return this.reflectionService.performStrategicReflection(companyId, {
      periodDays: body.periodDays,
      actorId,
    });
  }

  @Get('relevant')
  async getRelevantMemories(
    @Req() req: any,
    @Query('domain') domain?: string,
    @Query('category') category?: MemoryCategory,
    @Query('maxResults') maxResults?: string,
  ): Promise<StructuredMemoryRecord[]> {
    const companyId = req.user?.companyId;
    return this.executiveMemory.getRelevantMemoriesForContext(companyId, {
      domain,
      category,
      maxResults: maxResults ? parseInt(maxResults, 10) : 5,
    });
  }

  @Get()
  async getCompanyMemories(@Req() req: any): Promise<StructuredMemoryRecord[]> {
    const companyId = req.user?.companyId;
    return this.executiveMemory.getCompanyMemories(companyId);
  }
}
