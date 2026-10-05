import { Module } from '@nestjs/common';
import { ModelPlatformController } from './model-platform.controller';
import { MpProviderService } from './mp-provider.service';
import { MpModelService } from './mp-model.service';
import { MpKillSwitchService } from './mp-kill-switch.service';
import { MpInferenceService } from './mp-inference.service';
import { MpHealthService } from './mp-health.service';
import { MpRoutePolicyService } from './mp-route-policy.service';
import { MpPromptTemplateService } from './mp-prompt-template.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ManagementModule } from '../management/management.module';

@Module({
  imports: [PrismaModule, ManagementModule],
  controllers: [ModelPlatformController],
  providers: [
    MpProviderService,
    MpModelService,
    MpKillSwitchService,
    MpInferenceService,
    MpHealthService,
    MpRoutePolicyService,
    MpPromptTemplateService,
  ],
  exports: [MpKillSwitchService, MpInferenceService],
})
export class ModelPlatformModule {}
