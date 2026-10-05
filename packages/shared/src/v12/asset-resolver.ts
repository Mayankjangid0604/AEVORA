/**
 * Renderer-side asset resolution contract (decisions 89/121/122's browser consumption boundary).
 *
 * Deliberately pure and renderer-agnostic (no Three.js types) so it's testable outside a browser.
 * Resolves a registered `assetId` (from `V12AssetRegistryService`/`AssetRegistry`) to a concrete
 * renderer representation — today, deterministic primitive-geometry styling, because no GLTF/mesh
 * files exist in this repository and none are fabricated here. If a future asset has a real model
 * file, its entry in `KNOWN_VEHICLE_RENDER_STYLES` would point the renderer at that file instead;
 * the contract (assetId → descriptor, `resolved: true/false`) does not need to change.
 *
 * `resolved: false` is the explicit, observable signal that the given assetId had no renderer
 * representation and a deterministic fallback was used — the fallback is never reported as if it
 * were the authoritative asset.
 */
export interface VehicleRenderDescriptor {
  assetId: string | null;
  resolved: boolean;
  bodyColor: string;
  bodyLength: number;
  isExecutiveStyle: boolean;
}

interface VehicleRenderStyle {
  bodyColor: string;
  bodyLength: number;
  isExecutiveStyle: boolean;
}

/** One entry per renderer-supported asset *version* — a new vehicle-chassis version gets its own id and, if visually distinct, its own entry here; an unlisted version falls back deterministically rather than being silently treated as a known one. */
const KNOWN_VEHICLE_RENDER_STYLES: Record<string, VehicleRenderStyle> = {
  asset_vehicle_chassis_standard_v1: { bodyColor: '#1d4ed8', bodyLength: 2.5, isExecutiveStyle: false },
  asset_vehicle_chassis_executive_v1: { bodyColor: '#0a0a0a', bodyLength: 2.8, isExecutiveStyle: true },
  asset_vehicle_chassis_chairman_v1: { bodyColor: '#0a0a0a', bodyLength: 2.8, isExecutiveStyle: true },
  asset_vehicle_chassis_ceo_v1: { bodyColor: '#0a0a0a', bodyLength: 2.8, isExecutiveStyle: true },
  asset_vehicle_chassis_md_v1: { bodyColor: '#0a0a0a', bodyLength: 2.8, isExecutiveStyle: true },
};

const FALLBACK_COLORS = ['#1d4ed8', '#047857', '#b45309', '#be123c', '#4338ca', '#374151', '#f87171'];

/**
 * Resolves a vehicle's render descriptor by registered asset identity. `fallbackSeed` (typically
 * the entity id) only drives the deterministic *fallback* styling when the asset is unresolved —
 * it never participates in resolving a genuinely registered asset's appearance, so the same assetId
 * always renders identically regardless of which entity holds it.
 */
export function resolveVehicleRenderDescriptor(assetId: string | null | undefined, fallbackSeed: string): VehicleRenderDescriptor {
  if (assetId && KNOWN_VEHICLE_RENDER_STYLES[assetId]) {
    return { assetId, resolved: true, ...KNOWN_VEHICLE_RENDER_STYLES[assetId] };
  }
  const hash = fallbackSeed.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return {
    assetId: assetId ?? null,
    resolved: false,
    bodyColor: FALLBACK_COLORS[hash % FALLBACK_COLORS.length],
    bodyLength: 2.5,
    isExecutiveStyle: false,
  };
}

export interface PersonRenderDescriptor {
  assetId: string | null;
  resolved: boolean;
  shirtColor: string;
}

const KNOWN_PERSON_RENDER_STYLES: Record<string, { shirtColor: string }> = {
  asset_digital_human_body_v1: { shirtColor: '#6366f1' }, // Specific color for the registered asset
};

export function resolvePersonRenderDescriptor(assetId: string | null | undefined, fallbackSeed: string): PersonRenderDescriptor {
  if (assetId && KNOWN_PERSON_RENDER_STYLES[assetId]) {
    return { assetId, resolved: true, ...KNOWN_PERSON_RENDER_STYLES[assetId] };
  }
  const hash = fallbackSeed.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return {
    assetId: assetId ?? null,
    resolved: false,
    shirtColor: FALLBACK_COLORS[hash % FALLBACK_COLORS.length],
  };
}

export interface BuildingRenderDescriptor {
  assetId: string | null;
  resolved: boolean;
  materialColor: string;
}

const KNOWN_BUILDING_RENDER_STYLES: Record<string, { materialColor: string }> = {
  asset_building_default_v1: { materialColor: '#6b7280' },
};

export function resolveBuildingRenderDescriptor(assetId: string | null | undefined, fallbackSeed: string): BuildingRenderDescriptor {
  if (assetId && KNOWN_BUILDING_RENDER_STYLES[assetId]) {
    return { assetId, resolved: true, ...KNOWN_BUILDING_RENDER_STYLES[assetId] };
  }
  return {
    assetId: assetId ?? null,
    resolved: false,
    materialColor: '#9ca3af',
  };
}

