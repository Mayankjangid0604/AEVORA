import { Module, forwardRef } from '@nestjs/common';
import { SpatialService } from './spatial.service';
import { NavigationService } from './navigation.service';
import { VehicleService } from './vehicle.service';
import { VRActionAdapter } from './vr-action.adapter';
import { AssetRegistryService } from './asset-registry.service';
import { SpatialAudioService } from './spatial-audio.service';
import { SpatialAudioController } from './spatial-audio.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WorldStateGatewayModule } from '../world-state-gateway/world-state-gateway.module';
import { CommandController } from './command.controller';
import { CommandAdapter } from './command.adapter';
import { AssistantController } from './assistant.controller';
import { AssistantAdapter } from './assistant.adapter';
import { VRActionController } from './vr-action.controller';
import { CompanyIntelligenceModule } from '../company-intelligence/company-intelligence.module';
import { EmployeeModule } from '../employee/employee.module';
import { DepartmentModule } from '../department/department.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { CommunicationModule } from '../communication/communication.module';

import { HqCapacityService } from './hq-capacity.service';
import { HqCapacityController } from './hq-capacity.controller';

import { VehicleController } from './vehicle.controller';

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
    CommandController,
    AssistantController,
    VRActionController,
    SpatialAudioController,
    HqCapacityController,
    VehicleController,
  ],
  providers: [
    SpatialService,
    HqCapacityService,
    NavigationService,
    VehicleService,
    CommandAdapter,
    AssistantAdapter,
    VRActionAdapter,
    AssetRegistryService,
    SpatialAudioService,
    // Backwards compatibility aliases for DI tokens if needed
    { provide: 'V12SpatialService', useExisting: SpatialService },
    { provide: 'V12NavigationService', useExisting: NavigationService },
    { provide: 'V12VehicleService', useExisting: VehicleService },
    { provide: 'V12CommandAdapter', useExisting: CommandAdapter },
    { provide: 'V12AssistantAdapter', useExisting: AssistantAdapter },
    { provide: 'V12VRActionAdapter', useExisting: VRActionAdapter },
    { provide: 'V12AssetRegistryService', useExisting: AssetRegistryService },
    { provide: 'V12SpatialAudioService', useExisting: SpatialAudioService },
  ],
  exports: [
    SpatialService,
    HqCapacityService,
    NavigationService,
    VehicleService,
    CommandAdapter,
    AssistantAdapter,
    VRActionAdapter,
    AssetRegistryService,
    SpatialAudioService,
  ],
})
export class SpatialModule {}
export const V12SpatialModule = SpatialModule;
export type V12SpatialModule = SpatialModule;
