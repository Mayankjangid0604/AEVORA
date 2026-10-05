import { Test, TestingModule } from '@nestjs/testing';
import { V12AssetRegistryService } from './v12-asset-registry.service';

describe('V12AssetRegistryService', () => {
  let service: V12AssetRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [V12AssetRegistryService],
    }).compile();
    service = module.get(V12AssetRegistryService);
    service.onModuleInit(); // Nest wouldn't call lifecycle hooks on a bare module.get in a unit test
  });

  it('seeds a real, resolvable asset for every vehicle class used by V12VehicleService.deriveVehicleClass', () => {
    for (const cls of ['STANDARD', 'EXECUTIVE', 'CHAIRMAN', 'CEO', 'MD']) {
      expect(service.resolveAssetId(`VEHICLE_CHASSIS_${cls}`)).not.toBeNull();
    }
  });

  it('seeds a resolvable digital-human body asset', () => {
    expect(service.resolveAssetId('DIGITAL_HUMAN_BODY')).not.toBeNull();
  });

  it('never invents an asset for an unregistered role', () => {
    expect(service.resolveAssetId('SOMETHING_NEVER_REGISTERED')).toBeNull();
  });

  it('resolution is deterministic across repeated calls', () => {
    const first = service.resolveAssetId('VEHICLE_CHASSIS_CHAIRMAN');
    const second = service.resolveAssetId('VEHICLE_CHASSIS_CHAIRMAN');
    expect(first).toBe(second);
  });

  it('version evolution: registering a new version through this service deprecates the old one and resolution follows the new version', () => {
    const current = service.getAsset(service.resolveAssetId('VEHICLE_CHASSIS_STANDARD')!)!;
    const v2 = service.registerVersion({ ...current, version: 2, replaces: current.id, provenance: 'updated-model.glb' } as any);

    expect(service.resolveAssetId('VEHICLE_CHASSIS_STANDARD')).toBe(v2.id);
    expect(service.getAsset(current.id)?.lifecycleState).toBe('DEPRECATED');
    // Historical/deprecated asset reference remains reconstructible, not deleted.
    expect(service.getAsset(current.id)).not.toBeNull();
  });

  it('historical references through listVersions remain reconstructible after evolution', () => {
    const current = service.getAsset(service.resolveAssetId('VEHICLE_CHASSIS_EXECUTIVE')!)!;
    service.registerVersion({ ...current, version: 2, replaces: current.id, provenance: 'v2-model.glb' } as any);

    const versions = service.listVersions('VEHICLE_CHASSIS_EXECUTIVE');
    expect(versions).toHaveLength(2);
    expect(versions[0].id).toBe(current.id); // the original version is still present, never deleted
  });
});
