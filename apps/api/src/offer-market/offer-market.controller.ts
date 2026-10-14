import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { OfferMarketService } from './offer-market.service';
import { OfferMarketingIntegrationService } from './offer-marketing-integration.service';
import { OfferMeasurementOptimizationService } from './offer-measurement-optimization.service';
import {
  ActivateOfferDto,
  ApproveOfferDto,
  CreateOfferDto,
  OfferCreatorRole,
  OfferStatus,
  RedeemOfferDto,
  UpdateOfferDto,
} from './offer-market.types';
import { AuthorityTier } from '../governance/authority-context.types';

@Controller('offers')
@UseGuards(JwtAuthGuard)
export class OfferMarketController {
  constructor(
    private readonly offerService: OfferMarketService,
    private readonly marketingIntegration: OfferMarketingIntegrationService,
    private readonly measurementService: OfferMeasurementOptimizationService,
  ) {}

  @Get()
  async listOffers(
    @Request() req,
    @Query('status') status?: OfferStatus,
    @Query('targetAudience') targetAudience?: string,
    @Query('creatorRole') creatorRole?: OfferCreatorRole,
  ) {
    const companyId = req.user.companyId;
    return this.offerService.listOffers(companyId, { status, targetAudience, creatorRole });
  }

  @Get(':id')
  async getOffer(@Request() req, @Param('id') id: string) {
    const companyId = req.user.companyId;
    return this.offerService.getOffer(companyId, id);
  }

  @Post()
  async createOffer(@Request() req, @Body() dto: CreateOfferDto) {
    const companyId = req.user.companyId;
    const actorId = req.user.actorId;
    const actorRole = req.user.actorRole || 'EMPLOYEE';
    return this.offerService.createOffer(companyId, actorId, actorRole, dto);
  }

  @Put(':id')
  async updateOffer(@Request() req, @Param('id') id: string, @Body() dto: UpdateOfferDto) {
    const companyId = req.user.companyId;
    const actorId = req.user.actorId;
    const actorRole = req.user.actorRole || 'EMPLOYEE';
    return this.offerService.updateOffer(companyId, actorId, actorRole, id, dto);
  }

  @Post(':id/evaluate')
  async evaluateOffer(@Request() req, @Param('id') id: string) {
    const companyId = req.user.companyId;
    const actorId = req.user.actorId;
    return this.offerService.evaluateOffer(companyId, actorId, id);
  }

  @Post(':id/approve')
  async approveOffer(@Request() req, @Param('id') id: string, @Body() dto: ApproveOfferDto) {
    const companyId = req.user.companyId;
    const actorId = req.user.actorId;
    const actorRole = req.user.actorRole || 'EMPLOYEE';
    const actorTier = actorRole === 'CHAIRMAN' ? AuthorityTier.CHAIRMAN : AuthorityTier.CEO;
    return this.offerService.approveOffer(companyId, actorId, actorRole, actorTier, id, dto);
  }

  @Post(':id/reject')
  async rejectOffer(@Request() req, @Param('id') id: string, @Body('reason') reason: string) {
    const companyId = req.user.companyId;
    const actorId = req.user.actorId;
    const actorRole = req.user.actorRole || 'EMPLOYEE';
    return this.offerService.rejectOffer(companyId, actorId, actorRole, id, reason);
  }

  @Post(':id/activate')
  async activateOffer(@Request() req, @Param('id') id: string, @Body() dto: ActivateOfferDto) {
    const companyId = req.user.companyId;
    const actorId = req.user.actorId;
    const actorRole = req.user.actorRole || 'EMPLOYEE';
    const actorTier = actorRole === 'CHAIRMAN' ? AuthorityTier.CHAIRMAN : AuthorityTier.CEO;
    return this.offerService.activateOffer(companyId, actorId, actorRole, actorTier, id, dto);
  }

  @Post(':id/suspend')
  async suspendOffer(@Request() req, @Param('id') id: string, @Body('reason') reason: string) {
    const companyId = req.user.companyId;
    const actorId = req.user.actorId;
    const actorRole = req.user.actorRole || 'EMPLOYEE';
    return this.offerService.suspendOffer(companyId, actorId, actorRole, id, reason);
  }

  @Post(':id/cancel')
  async cancelOffer(@Request() req, @Param('id') id: string) {
    const companyId = req.user.companyId;
    const actorId = req.user.actorId;
    return this.offerService.cancelOffer(companyId, actorId, id);
  }

  @Post(':id/redeem')
  async redeemOffer(@Request() req, @Param('id') id: string, @Body() dto: RedeemOfferDto) {
    const companyId = req.user.companyId;
    return this.offerService.redeemOffer(companyId, id, dto);
  }

  @Post(':id/marketing/draft')
  async generateMarketingDraft(@Request() req, @Param('id') id: string) {
    const companyId = req.user.companyId;
    const offer = await this.offerService.getOffer(companyId, id);
    return this.marketingIntegration.generateOfferCampaignDrafts(offer);
  }

  @Get(':id/measurement')
  async getMeasurement(@Request() req, @Param('id') id: string) {
    const companyId = req.user.companyId;
    return this.measurementService.getOfferMeasurement(companyId, id);
  }

  @Get(':id/optimization')
  async getOptimizationRecommendation(@Request() req, @Param('id') id: string) {
    const companyId = req.user.companyId;
    return this.measurementService.getOptimizationRecommendation(companyId, id);
  }
}
