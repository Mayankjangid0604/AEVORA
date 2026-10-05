import { MapDataController } from './map-data.controller';
import { Module, forwardRef } from '@nestjs/common';
import { ChairmanController } from './chairman.controller';
import { ChairmanCommandService } from './chairman-command.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CeoModule } from '../ceo/ceo.module';
import { EconomyModule } from '../economy/economy.module';
import { SimulationModule } from '../simulation/simulation.module';
import { CompanyOperationsModule } from '../company-operations/company-operations.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { CommunicationModule } from '../communication/communication.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { OperatingLoopModule } from '../operating-loop/operating-loop.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => CeoModule),
    EconomyModule,
    SimulationModule,
    CompanyOperationsModule,
    AuthorizationModule,
    CommunicationModule,
    KnowledgeModule,
    OperatingLoopModule,
  ],
  controllers: [ChairmanController, MapDataController],
  providers: [ChairmanCommandService],
})
export class ChairmanModule {}
