import { Module } from '@nestjs/common';
import { ProductFactoryController } from './product-factory.controller';
import { PfProductService } from './pf-product.service';
import { PfIdeaService } from './pf-idea.service';
import { PfRequirementsService } from './pf-requirements.service';
import { PfFeatureService } from './pf-feature.service';
import { PfSecurityReviewService } from './pf-security-review.service';
import { PfQAService } from './pf-qa.service';
import { PfReleaseService } from './pf-release.service';
import { PfLaunchService } from './pf-launch.service';
import { PfFeedbackService } from './pf-feedback.service';
import { PfAnalyticsService } from './pf-analytics.service';
import { PfAuditService } from './pf-audit.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ManagementModule } from '../management/management.module';

@Module({
  imports: [PrismaModule, ManagementModule],
  controllers: [ProductFactoryController],
  providers: [
    PfProductService,
    PfIdeaService,
    PfRequirementsService,
    PfFeatureService,
    PfSecurityReviewService,
    PfQAService,
    PfReleaseService,
    PfLaunchService,
    PfFeedbackService,
    PfAnalyticsService,
    PfAuditService,
  ],
  exports: [PfProductService, PfAuditService],
})
export class ProductFactoryModule {}
