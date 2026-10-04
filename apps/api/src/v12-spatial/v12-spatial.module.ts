import { Module, forwardRef } from '@nestjs/common';
import { V12SpatialService } from './v12-spatial.service';
import { V12NavigationService } from './v12-navigation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WorldStateGatewayModule } from '../world-state-gateway/world-state-gateway.module';
import { V12CommandController } from './v12-command.controller';
import { V12CommandAdapter } from './v12-command.adapter';
import { V12AssistantController } from './v12-assistant.controller';
import { V12AssistantAdapter } from './v12-assistant.adapter';
import { CompanyIntelligenceModule } from '../company-intelligence/company-intelligence.module';
import { EmployeeModule } from '../employee/employee.module';
import { DepartmentModule } from '../department/department.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { CommunicationModule } from '../communication/communication.module';

@Module({
  imports: [
    PrismaModule, 
    WorldStateGatewayModule,
    CompanyIntelligenceModule,
    forwardRef(() => EmployeeModule),
    forwardRef(() => DepartmentModule),
    forwardRef(() => CommunicationModule),
    AuthorizationModule
  ],
  controllers: [V12CommandController, V12AssistantController],
  providers: [V12SpatialService, V12NavigationService, V12CommandAdapter, V12AssistantAdapter],
  exports: [V12SpatialService, V12NavigationService, V12CommandAdapter, V12AssistantAdapter],
})
export class V12SpatialModule {}
