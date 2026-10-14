import { resolveVehicleRenderDescriptor } from './asset-resolver';

describe('resolveVehicleRenderDescriptor', () => {
  it('resolves a real registered asset to its known renderer representation', () => {
    const result = resolveVehicleRenderDescriptor('asset_vehicle_chassis_chairman_v1', 'emp-irrelevant');
    expect(result).toEqual({ assetId: 'asset_vehicle_chassis_chairman_v1', resolved: true, bodyColor: '#0a0a0a', bodyLength: 2.8, isExecutiveStyle: true });
  });

  it('an unknown asset id does not silently become authoritative: resolved is false and a deterministic fallback is used', () => {
    const result = resolveVehicleRenderDescriptor('asset_vehicle_chassis_unknown_v99', 'seed-1');
    expect(result.resolved).toBe(false);
    expect(result.assetId).toBe('asset_vehicle_chassis_unknown_v99'); // the identity is preserved/reported, not discarded
  });

  it('a null assetId (registry had nothing registered) falls back deterministically, never invents an id', () => {
    const result = resolveVehicleRenderDescriptor(null, 'seed-1');
    expect(result.resolved).toBe(false);
    expect(result.assetId).toBeNull();
  });

  it('asset version evolution changes resolution deterministically: v1 and a hypothetical v2 id resolve independently', () => {
    const v1 = resolveVehicleRenderDescriptor('asset_vehicle_chassis_standard_v1', 'seed');
    const v2UnregisteredInRenderer = resolveVehicleRenderDescriptor('asset_vehicle_chassis_standard_v2', 'seed');
    expect(v1.resolved).toBe(true);
    expect(v2UnregisteredInRenderer.resolved).toBe(false); // a new version the renderer doesn't know yet falls back truthfully, not silently reusing v1's look
  });

  it('two different entities holding the SAME registered assetId render identically (identity, not per-entity hash, drives a resolved asset\'s appearance)', () => {
    const a = resolveVehicleRenderDescriptor('asset_vehicle_chassis_chairman_v1', 'entity-A');
    const b = resolveVehicleRenderDescriptor('asset_vehicle_chassis_chairman_v1', 'entity-B');
    expect(a).toEqual(b);
  });

  it('the fallback styling is deterministic per seed (same unresolved entity always renders the same fallback)', () => {
    const first = resolveVehicleRenderDescriptor(null, 'entity-X');
    const second = resolveVehicleRenderDescriptor(null, 'entity-X');
    expect(first).toEqual(second);
  });

  it('historical/deprecated assets remain resolvable: an older version id still resolves to its own known style even after a newer version exists', () => {
    const older = resolveVehicleRenderDescriptor('asset_vehicle_chassis_standard_v1', 'seed');
    expect(older.resolved).toBe(true); // v1's entry is never removed from the renderer's known styles when v2 is added elsewhere
  });
});
