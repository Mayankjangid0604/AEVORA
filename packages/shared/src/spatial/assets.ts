/**
 * V12 enterprise-aware asset pipeline foundation (decisions 89, 121, 122).
 *
 * This is the smallest real asset registry V12 needs: identity, provenance, versioning, and an
 * evolution relationship between versions — enough for a world entity to hold a deterministic
 * asset *reference* rather than inline-hardcoded geometry, and for a future real generation
 * pipeline (procedural or manually authored) to plug into the same `register` boundary without
 * V12's world-state architecture changing. It does NOT implement an AI asset generator — that
 * would be fabricating a capability. The explicit boundary this module defines is:
 *
 *   generation source (procedural algorithm OR a human-authored file)
 *     → AssetRegistration (validated input)
 *     → AssetRegistry.register()
 *     → AssetRecord (deterministic id, provenance, version, lifecycle state)
 *     → a world entity references that AssetRecord.id
 *
 * Framework/engine-agnostic: no Three.js/file-format types. A renderer resolves an asset's actual
 * geometry/texture bytes from `provenance` by whatever means it chooses; this module never touches
 * bytes, only identity and metadata.
 */

export enum AssetType {
  MESH = 'MESH',
  TEXTURE = 'TEXTURE',
  AUDIO = 'AUDIO',
  ANIMATION = 'ANIMATION',
}

export enum AssetSource {
  PROCEDURAL = 'PROCEDURAL',
  MANUAL = 'MANUAL',
}

export enum AssetLifecycleState {
  ACTIVE = 'ACTIVE',
  DEPRECATED = 'DEPRECATED', // superseded by a newer version, but still resolvable (e.g. for replay of old history)
}

export interface AssetBounds {
  width: number;
  depth: number;
  height: number;
}

export interface AssetRegistration {
  /** What this asset is for, e.g. 'DIGITAL_HUMAN_BODY', 'VEHICLE_CHASSIS_STANDARD', 'VEHICLE_CHASSIS_CHAIRMAN'. Not a business concept — a rendering role. */
  semanticRole: string;
  type: AssetType;
  source: AssetSource;
  /** Where this asset actually comes from: a file path, a procedural generator name+params, a CDN URL — opaque to this module, retained verbatim. */
  provenance: string;
  version: number;
  bounds?: AssetBounds;
  /** The asset id (not registration) this version supersedes, if any. */
  replaces?: string;
}

export interface AssetRecord extends AssetRegistration {
  id: string;
  lifecycleState: AssetLifecycleState;
  createdAt: number;
}

/** Deterministic, content-addressed-by-identity reference: same (semanticRole, version) always yields the same id. */
export function deterministicAssetId(semanticRole: string, version: number): string {
  const slug = semanticRole.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!slug) throw new Error('semanticRole must contain at least one alphanumeric character');
  if (!Number.isInteger(version) || version < 1) throw new Error('version must be a positive integer');
  return `asset_${slug}_v${version}`;
}

export class InvalidAssetError extends Error {}

/**
 * In-memory asset registry. A real deployment would back this with a table (mirroring the pattern
 * every other V12 store already uses), but the registration/validation/versioning logic — the part
 * that actually matters for decisions 121/122 — is here, storage-agnostic and fully deterministic.
 */
export class AssetRegistry {
  private assets = new Map<string, AssetRecord>();
  /** semanticRole -> ordered list of asset ids, lowest version first. */
  private byRole = new Map<string, string[]>();

  register(input: AssetRegistration): AssetRecord {
    if (!input.semanticRole || !input.semanticRole.trim()) throw new InvalidAssetError('semanticRole is required');
    if (!input.provenance || !input.provenance.trim()) throw new InvalidAssetError('provenance is required');
    if (!Object.values(AssetType).includes(input.type)) throw new InvalidAssetError(`invalid asset type: ${input.type}`);
    if (!Object.values(AssetSource).includes(input.source)) throw new InvalidAssetError(`invalid asset source: ${input.source}`);

    const id = deterministicAssetId(input.semanticRole, input.version);
    if (this.assets.has(id)) throw new InvalidAssetError(`asset ${id} is already registered (duplicate version)`);

    if (input.replaces) {
      const previous = this.assets.get(input.replaces);
      if (!previous) throw new InvalidAssetError(`cannot replace unknown asset ${input.replaces}`);
      if (previous.semanticRole !== input.semanticRole) {
        throw new InvalidAssetError(`asset ${input.replaces} has a different semanticRole; an asset can only evolve within its own role`);
      }
      this.assets.set(previous.id, { ...previous, lifecycleState: AssetLifecycleState.DEPRECATED });
    }

    const record: AssetRecord = { ...input, id, lifecycleState: AssetLifecycleState.ACTIVE, createdAt: Date.now() };
    this.assets.set(id, record);
    const list = this.byRole.get(input.semanticRole) ?? [];
    list.push(id);
    this.byRole.set(input.semanticRole, list);

    return record;
  }

  get(id: string): AssetRecord | null {
    return this.assets.get(id) ?? null;
  }

  /** Deterministic: the highest-version ACTIVE asset for a role, or null if the role has never been registered or every version was deprecated without a replacement. */
  getActiveByRole(semanticRole: string): AssetRecord | null {
    const ids = this.byRole.get(semanticRole) ?? [];
    for (let i = ids.length - 1; i >= 0; i--) {
      const asset = this.assets.get(ids[i])!;
      if (asset.lifecycleState === AssetLifecycleState.ACTIVE) return asset;
    }
    return null;
  }

  /** All versions of a role, in version order — including deprecated ones, for replay/history resolution against an old reference. */
  listVersions(semanticRole: string): AssetRecord[] {
    return (this.byRole.get(semanticRole) ?? []).map((id) => this.assets.get(id)!);
  }
}
