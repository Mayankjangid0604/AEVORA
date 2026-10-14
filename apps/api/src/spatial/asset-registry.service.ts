import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AssetRegistry, AssetType, AssetSource, AssetRecord } from '@aevora/shared';

/**
 * The real, deployed consumer boundary for the V12 AssetRegistry (decisions 89/121/122): a single
 * process-wide registry, seeded at startup with the manually-authored assets V12 actually ships
 * (the primitive-geometry chassis classes `V12VehicleService.deriveVehicleClass` already produces).
 * This is NOT a professional asset-generation toolchain — it is the honest consumption boundary:
 * world entities resolve their asset by deterministic id through this service rather than
 * silently constructing arbitrary unregistered geometry. A future procedural generator, or real
 * authored mesh files, would call `register()` here; nothing about the rest of V12 would need to
 * change, because consumers only ever ask for "the active asset for role X."
 */
@Injectable()
export class AssetRegistryService implements OnModuleInit {
  private readonly logger = new Logger(V12AssetRegistryService.name);
  private readonly registry = new AssetRegistry();

  onModuleInit() {
    this.seed();
  }

  private seed() {
    const vehicleClasses = ['STANDARD', 'EXECUTIVE', 'CHAIRMAN', 'CEO', 'MD'];
    for (const cls of vehicleClasses) {
      this.registry.register({
        semanticRole: `VEHICLE_CHASSIS_${cls}`,
        type: AssetType.MESH,
        source: AssetSource.MANUAL,
        provenance: `v12-asset-mesh#chassis-${cls.toLowerCase()}`,
        version: 1,
        bounds: { width: 1.8, depth: 4.5, height: 1.6 },
      });
    }
    this.registry.register({
      semanticRole: 'DIGITAL_HUMAN_BODY',
      type: AssetType.MESH,
      source: AssetSource.MANUAL,
      provenance: 'v12-asset-mesh#digital-human-body',
      version: 1,
      bounds: { width: 0.6, depth: 0.6, height: 1.8 },
    });
    this.logger.log('Asset registry seeded with manually-authored chassis/body assets');
  }

  /** Returns the active asset id for a semantic role, or null if none is registered — never guesses. */
  resolveAssetId(semanticRole: string): string | null {
    return this.registry.getActiveByRole(semanticRole)?.id ?? null;
  }

  getAsset(id: string): AssetRecord | null {
    return this.registry.get(id);
  }

  /** Registers a new asset version, evolving (deprecating) a previous one if given. Exposed for a future real generation/upload pipeline — never called with invented data by V12 itself. */
  registerVersion(input: Parameters<AssetRegistry['register']>[0]): AssetRecord {
    return this.registry.register(input);
  }

  listVersions(semanticRole: string): AssetRecord[] {
    return this.registry.listVersions(semanticRole);
  }
}

export const V12AssetRegistryService = AssetRegistryService;
export type V12AssetRegistryService = AssetRegistryService;
