import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { MpProviderService } from './mp-provider.service';
import { MpModelService } from './mp-model.service';
import { MpKillSwitchService } from './mp-kill-switch.service';
import { MpInferenceService } from './mp-inference.service';
import { MpHealthService } from './mp-health.service';
import { MpRoutePolicyService } from './mp-route-policy.service';
import { MpPromptTemplateService } from './mp-prompt-template.service';
import { MpProviderType, MpProviderStatus, MpModelStatus, MpDeploymentState, MpKillSwitchScope, MpCapabilityType } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('model-platform')
export class ModelPlatformController {
  constructor(
    private readonly providers: MpProviderService,
    private readonly models: MpModelService,
    private readonly killSwitch: MpKillSwitchService,
    private readonly inference: MpInferenceService,
    private readonly health: MpHealthService,
    private readonly routePolicies: MpRoutePolicyService,
    private readonly promptTemplates: MpPromptTemplateService,
  ) {}

  // ─── Providers ───────────────────────────────────────────────────────────────

  @Post('providers')
  registerProvider(@Req() req, @Body() body: {
    providerType: MpProviderType;
    displayName: string;
    description?: string;
    baseUrl?: string;
  }) {
    const { companyId, actorId } = req.user; // never from body
    return this.providers.register(companyId, actorId, body);
  }

  @Get('providers')
  listProviders(@Req() req, @Query('providerType') providerType?: MpProviderType) {
    return this.providers.list(req.user.companyId, providerType);
  }

  @Get('providers/:id')
  getProvider(@Req() req, @Param('id') id: string) {
    return this.providers.get(req.user.companyId, id);
  }

  @Patch('providers/:id/status')
  setProviderStatus(@Req() req, @Param('id') id: string, @Body() body: { status: MpProviderStatus }) {
    const { companyId, actorId } = req.user;
    return this.providers.setStatus(companyId, actorId, id, body.status);
  }

  // ─── Models ──────────────────────────────────────────────────────────────────

  @Post('models')
  registerModel(@Req() req, @Body() body: {
    providerId: string;
    modelIdentifier: string;
    displayName: string;
    contextWindow?: number;
    costPerInputTokenMc?: number;
    costPerOutputTokenMc?: number;
    capabilities?: MpCapabilityType[];
  }) {
    const { companyId, actorId } = req.user;
    return this.models.register(companyId, actorId, body);
  }

  @Get('models')
  listModels(@Req() req, @Query('providerId') providerId?: string, @Query('status') status?: MpModelStatus) {
    return this.models.list(req.user.companyId, providerId, status);
  }

  @Get('models/:id')
  getModel(@Req() req, @Param('id') id: string) {
    return this.models.get(req.user.companyId, id);
  }

  @Patch('models/:id/deployment')
  advanceModelDeployment(@Req() req, @Param('id') id: string, @Body() body: { deploymentState: MpDeploymentState }) {
    const { companyId, actorId } = req.user;
    return this.models.advanceDeployment(companyId, actorId, id, body.deploymentState);
  }

  // ─── Kill Switches ────────────────────────────────────────────────────────────

  @Post('kill-switches')
  activateKillSwitch(@Req() req, @Body() body: {
    scope: MpKillSwitchScope;
    reason: string;
    providerId?: string;
    modelId?: string;
    expiresAt?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.killSwitch.activate(companyId, actorId, { ...body, expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined });
  }

  @Patch('kill-switches/:id/deactivate')
  deactivateKillSwitch(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.killSwitch.deactivate(companyId, actorId, id);
  }

  @Get('kill-switches')
  listKillSwitches(@Req() req, @Query('activeOnly') activeOnly?: string) {
    return this.killSwitch.list(req.user.companyId, activeOnly === 'true');
  }

  // ─── Inference ────────────────────────────────────────────────────────────────

  @Post('inference')
  executeInference(@Req() req, @Body() body: {
    modelId: string;
    idempotencyKey: string;
    promptContent: string;
    environment?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.inference.execute(companyId, actorId, body);
  }

  @Get('inference')
  listInference(@Req() req, @Query('modelId') modelId?: string, @Query('limit') limit?: string) {
    return this.inference.list(req.user.companyId, modelId, limit ? parseInt(limit) : 50);
  }

  // ─── Health ──────────────────────────────────────────────────────────────────

  @Post('providers/:id/health')
  recordProviderHealth(@Req() req, @Param('id') id: string, @Body() body: {
    isHealthy: boolean;
    p50LatencyMs?: number;
    errorRateBps?: number;
    notes?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.health.recordProviderHealth(companyId, actorId, id, body);
  }

  @Get('providers/:id/health')
  getProviderHealth(@Req() req, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.health.getProviderHealth(req.user.companyId, id, limit ? parseInt(limit) : 20);
  }

  @Post('models/:id/health')
  recordModelHealth(@Req() req, @Param('id') id: string, @Body() body: {
    isHealthy: boolean;
    p50LatencyMs?: number;
    p95LatencyMs?: number;
    errorRateBps?: number;
    successCount?: number;
    failureCount?: number;
  }) {
    const { companyId, actorId } = req.user;
    return this.health.recordModelHealth(companyId, actorId, id, body);
  }

  @Get('models/:id/health')
  getModelHealth(@Req() req, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.health.getModelHealth(req.user.companyId, id, limit ? parseInt(limit) : 20);
  }

  // ─── Route Policies ──────────────────────────────────────────────────────────

  @Post('route-policies')
  createRoutePolicy(@Req() req, @Body() body: {
    name: string;
    description?: string;
    requiredCapability: string;
    maxLatencyMs?: number;
    maxCostPerCallMc?: number;
    minReliabilityScore?: number;
    environment?: string;
    preferredModelId?: string;
    fallbackEnabled?: boolean;
    maxFallbackDepth?: number;
  }) {
    const { companyId, actorId } = req.user;
    return this.routePolicies.create(companyId, actorId, body);
  }

  @Get('route-policies')
  listRoutePolicies(@Req() req) {
    return this.routePolicies.list(req.user.companyId);
  }

  @Get('route-policies/:id')
  getRoutePolicy(@Req() req, @Param('id') id: string) {
    return this.routePolicies.get(req.user.companyId, id);
  }

  @Patch('route-policies/:id/deactivate')
  deactivateRoutePolicy(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.routePolicies.deactivate(companyId, actorId, id);
  }

  // ─── Prompt Templates ────────────────────────────────────────────────────────

  @Post('prompt-templates')
  createPromptTemplate(@Req() req, @Body() body: {
    name: string;
    description?: string;
    category?: string;
    systemPrompt?: string;
    userTemplate: string;
    variables?: unknown[];
  }) {
    const { companyId, actorId } = req.user;
    return this.promptTemplates.create(companyId, actorId, body);
  }

  @Get('prompt-templates')
  listPromptTemplates(@Req() req) {
    return this.promptTemplates.list(req.user.companyId);
  }

  @Get('prompt-templates/:id')
  getPromptTemplate(@Req() req, @Param('id') id: string) {
    return this.promptTemplates.get(req.user.companyId, id);
  }

  @Post('prompt-templates/:id/versions')
  createPromptVersion(@Req() req, @Param('id') id: string, @Body() body: {
    systemPrompt?: string;
    userTemplate: string;
    variables?: unknown[];
  }) {
    const { companyId, actorId } = req.user;
    return this.promptTemplates.newVersion(companyId, actorId, id, body);
  }
}
