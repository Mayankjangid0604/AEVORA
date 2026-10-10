import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ManagementModule } from '../management/management.module';
import { SalesModule } from '../sales/sales.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { EnterpriseBrainService } from './enterprise-brain.service';
import { ConflictResolutionEngine } from './conflict-resolution.engine';
import { RelationshipGraphBuilder } from './relationship-graph.builder';
import { SignificanceFilterService } from './significance-filter.service';
import { EnterpriseBrainController } from './enterprise-brain.controller';

@Module({
  imports: [
    PrismaModule,
    ManagementModule,
    SalesModule,
    AuthorizationModule,
  ],
  controllers: [EnterpriseBrainController],
  providers: [
    EnterpriseBrainService,
    ConflictResolutionEngine,
    RelationshipGraphBuilder,
    SignificanceFilterService,
  ],
  exports: [
    EnterpriseBrainService,
    ConflictResolutionEngine,
    RelationshipGraphBuilder,
    SignificanceFilterService,
  ],
})
export class EnterpriseBrainModule {}
