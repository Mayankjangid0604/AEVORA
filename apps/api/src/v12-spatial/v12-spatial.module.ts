import { Module, forwardRef } from '@nestjs/common';
import { V12SpatialService } from './v12-spatial.service';
import { V12NavigationService } from './v12-navigation.service';
import { V12VehicleService } from './v12-vehicle.service';
import { V12VRActionAdapter } from './v12-vr-action.adapter';
import { V12AssetRegistryService } from './v12-asset-registry.service';
import { V12SpatialAudioService } from './v12-spatial-audio.service';
import { V12SpatialAudioController } from './v12-spatial-audio.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WorldStateGatewayModule } from '../world-state-gateway/world-state-gateway.module';
import { V12CommandController } from './v12-command.controller';
import { V12CommandAdapter } from './v12-command.adapter';
import { V12AssistantController } from './v12-assistant.controller';
import { V12AssistantAdapter } from './v12-assistant.adapter';
import { V12VRActionController } from './v12-vr-action.controller';
import { CompanyIntelligenceModule } from '../company-intelligence/company-intelligence.module';
import { EmployeeModule } from '../employee/employee.module';
import { DepartmentModule } from '../department/department.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { CommunicationModule } from '../communication/communication.module';

import { HqCapacityService } from './hq-capacity.service';
import { HqCapacityController } from './hq-capacity.controller';

import { V12VehicleController } from './v12-vehicle.controller';

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
  controllers: [
    V12CommandController,
    V12AssistantController,
    V12VRActionController,
    V12SpatialAudioController,
    HqCapacityController,
    V12VehicleController,
  ],
  providers: [V12SpatialService, HqCapacityService, V12NavigationService, V12VehicleService, V12CommandAdapter, V12AssistantAdapter, V12VRActionAdapter, V12AssetRegistryService, V12SpatialAudioService],
  exports: [V12SpatialService, HqCapacityService, V12NavigationService, V12VehicleService, V12CommandAdapter, V12AssistantAdapter, V12VRActionAdapter, V12AssetRegistryService, V12SpatialAudioService],
})
export class V12SpatialModule {}
