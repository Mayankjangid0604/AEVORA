import { AssetRegistry, AssetType, AssetSource, AssetLifecycleState, deterministicAssetId, InvalidAssetError } from './assets';

describe('deterministicAssetId', () => {
  it('is deterministic: the same role+version always produces the same id', () => {
    expect(deterministicAssetId('DIGITAL_HUMAN_BODY', 1)).toBe(deterministicAssetId('DIGITAL_HUMAN_BODY', 1));
  });
  it('normalizes the role into a slug', () => {
    expect(deterministicAssetId('Digital Human Body', 1)).toBe('asset_digital_human_body_v1');
  });
  it('rejects a non-positive version', () => {
    expect(() => deterministicAssetId('role', 0)).toThrow();
    expect(() => deterministicAssetId('role', -1)).toThrow();
  });
});

describe('AssetRegistry', () => {
  let registry: AssetRegistry;
  beforeEach(() => { registry = new AssetRegistry(); });

  const reg = (overrides: Partial<Parameters<AssetRegistry['register']>[0]> = {}) => ({
    semanticRole: 'VEHICLE_CHASSIS_STANDARD',
    type: AssetType.MESH,
    source: AssetSource.MANUAL,
    provenance: 'models/vehicle_standard.glb',
    version: 1,
    ...overrides,
  });

  it('registers an asset with a deterministic id and ACTIVE lifecycle', () => {
    const asset = registry.register(reg());
    expect(asset.id).toBe('asset_vehicle_chassis_standard_v1');
    expect(asset.lifecycleState).toBe(AssetLifecycleState.ACTIVE);
  });

  it('retains provenance exactly as given', () => {
    const asset = registry.register(reg({ provenance: 'procgen://vehicle/standard?seed=42' }));
    expect(asset.provenance).toBe('procgen://vehicle/standard?seed=42');
  });

  it('version evolution: registering v2 with replaces=v1 deprecates v1 and makes v2 the active version', () => {
    const v1 = registry.register(reg({ version: 1 }));
    const v2 = registry.register(reg({ version: 2, replaces: v1.id }));

    expect(registry.get(v1.id)?.lifecycleState).toBe(AssetLifecycleState.DEPRECATED);
    expect(registry.get(v2.id)?.lifecycleState).toBe(AssetLifecycleState.ACTIVE);
    expect(registry.getActiveByRole('VEHICLE_CHASSIS_STANDARD')?.id).toBe(v2.id);
  });

  it('listVersions returns every version including deprecated ones, for historical/replay resolution', () => {
    const v1 = registry.register(reg({ version: 1 }));
    const v2 = registry.register(reg({ version: 2, replaces: v1.id }));
    const versions = registry.listVersions('VEHICLE_CHASSIS_STANDARD');
    expect(versions.map((v) => v.id)).toEqual([v1.id, v2.id]);
  });

  it('rejects registering a duplicate (semanticRole, version) pair', () => {
    registry.register(reg({ version: 1 }));
    expect(() => registry.register(reg({ version: 1 }))).toThrow(InvalidAssetError);
  });

  it('rejects an invalid asset: missing provenance', () => {
    expect(() => registry.register(reg({ provenance: '' }))).toThrow(InvalidAssetError);
  });

  it('rejects an invalid asset: missing semanticRole', () => {
    expect(() => registry.register(reg({ semanticRole: '' }))).toThrow(InvalidAssetError);
  });

  it('rejects replacing an asset that does not exist', () => {
    expect(() => registry.register(reg({ version: 2, replaces: 'asset_ghost_v1' }))).toThrow(InvalidAssetError);
  });

  it('rejects replacing an asset of a different semanticRole (evolution must stay within one role)', () => {
    const other = registry.register(reg({ semanticRole: 'VEHICLE_CHASSIS_CHAIRMAN', version: 1 }));
    expect(() => registry.register(reg({ semanticRole: 'VEHICLE_CHASSIS_STANDARD', version: 1, replaces: other.id }))).toThrow(InvalidAssetError);
  });

  it('getActiveByRole returns null for an unregistered role (never invents a default asset)', () => {
    expect(registry.getActiveByRole('NOTHING_REGISTERED')).toBeNull();
  });

  it('replay consistency: replaying the same sequence of register() calls on a fresh registry produces an identical final state', () => {
    const calls = [reg({ version: 1 }), reg({ version: 2, replaces: deterministicAssetId('VEHICLE_CHASSIS_STANDARD', 1) })];

    const registryA = new AssetRegistry();
    for (const c of calls) registryA.register(c);

    const registryB = new AssetRegistry();
    for (const c of calls) registryB.register(c);

    expect(registryA.getActiveByRole('VEHICLE_CHASSIS_STANDARD')).toEqual(
      { ...registryB.getActiveByRole('VEHICLE_CHASSIS_STANDARD')!, createdAt: expect.any(Number) },
    );
    expect(registryA.listVersions('VEHICLE_CHASSIS_STANDARD').map((v) => v.lifecycleState))
      .toEqual(registryB.listVersions('VEHICLE_CHASSIS_STANDARD').map((v) => v.lifecycleState));
  });

  it('distinguishes procedural from manually authored sources', () => {
    const manual = registry.register(reg({ version: 1, source: AssetSource.MANUAL }));
    const procedural = registry.register(reg({ semanticRole: 'OTHER_ROLE', version: 1, source: AssetSource.PROCEDURAL }));
    expect(manual.source).toBe(AssetSource.MANUAL);
    expect(procedural.source).toBe(AssetSource.PROCEDURAL);
  });
});
