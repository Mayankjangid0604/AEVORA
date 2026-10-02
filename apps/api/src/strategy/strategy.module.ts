import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ManagementModule } from '../management/management.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { StrategicThemeService } from './strategic-theme.service';
import { StrategicInitiativeService } from './strategic-initiative.service';
import { StrategicOptionService } from './strategic-option.service';
import { StrategicScenarioService } from './strategic-scenario.service';
import { StrategicForecastService } from './strategic-forecast.service';
import { StrategicExperimentService } from './strategic-experiment.service';
import { StrategyPortfolioService } from './strategy-portfolio.service';
import { StrategyReviewService } from './strategy-review.service';
import { StrategyStateService } from './strategy-state.service';
import { StrategyController } from './strategy.controller';

@Module({
  imports: [PrismaModule, ManagementModule, AuthorizationModule],
  controllers: [StrategyController],
  providers: [
    StrategicThemeService,
    StrategicInitiativeService,
    StrategicOptionService,
    StrategicScenarioService,
    StrategicForecastService,
    StrategicExperimentService,
    StrategyPortfolioService,
    StrategyReviewService,
    StrategyStateService,
  ],
  exports: [
    StrategicInitiativeService,
    StrategicForecastService,
    StrategyStateService,
  ],
})
export class StrategyModule {}
