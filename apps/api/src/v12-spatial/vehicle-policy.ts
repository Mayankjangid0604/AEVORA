/**
 * Deterministic vehicle policy for Aevora enterprise spatial fleets.
 * Governs fleet expansion thresholds, capacity limits, parking slot layouts,
 * and supported vehicle classifications.
 */
export interface VehiclePolicy {
  defaultSpotsPerParkingArea: number;
  maxCapacityPerArea: number;
  maxParkingAreasPerSite: number;
  expansionThreshold: number;
  defaultVehicleClass: 'STANDARD' | 'EXECUTIVE' | 'ASSISTANT' | 'CHAIRMAN' | 'CEO' | 'MD';
  allowedVehicleClasses: Array<'STANDARD' | 'EXECUTIVE' | 'ASSISTANT' | 'CHAIRMAN' | 'CEO' | 'MD'>;
  slotSpacingX: number;
  slotSpacingZ: number;
  slotsPerRow: number;
}

export const DEFAULT_VEHICLE_POLICY: VehiclePolicy = {
  defaultSpotsPerParkingArea: 10,
  maxCapacityPerArea: 20,
  maxParkingAreasPerSite: 8,
  expansionThreshold: 1.0,
  defaultVehicleClass: 'STANDARD',
  allowedVehicleClasses: ['STANDARD', 'EXECUTIVE', 'ASSISTANT', 'CHAIRMAN', 'CEO', 'MD'],
  slotSpacingX: 3.0,
  slotSpacingZ: 5.0,
  slotsPerRow: 5,
};

export interface SlotCoordinate {
  x: number;
  y: number;
  z: number;
  slotIndex: number;
  row: number;
  col: number;
}

/**
 * Computes deterministic 3D coordinates for a parking slot given the parking area's
 * world transform and the vehicle's 0-indexed slot assignment.
 */
export function calculateSlotCoordinate(
  parkingArea: { posX: number; posY: number; posZ: number },
  slotIndex: number,
  policy: VehiclePolicy = DEFAULT_VEHICLE_POLICY,
): SlotCoordinate {
  const row = Math.floor(slotIndex / policy.slotsPerRow);
  const col = slotIndex % policy.slotsPerRow;

  // Center the columns around the parking area origin
  const offsetX = (col - Math.floor(policy.slotsPerRow / 2)) * policy.slotSpacingX;
  // Two rows: row 0 sits at -Z offset, row 1 sits at +Z offset
  const offsetZ = (row % 2 === 0 ? -1 : 1) * (policy.slotSpacingZ / 2) + Math.floor(row / 2) * (policy.slotSpacingZ + 2);

  return {
    x: parkingArea.posX + offsetX,
    y: parkingArea.posY + 0.35, // Procedural ground clearance
    z: parkingArea.posZ + offsetZ,
    slotIndex,
    row,
    col,
  };
}

/**
 * Computes deterministic campus coordinates for newly provisioned parking areas.
 */
export function calculateParkingAreaPosition(
  areaIndex: number,
  baseOffset = { x: 45, y: 0, z: 45 },
  spacing = 22,
): { posX: number; posY: number; posZ: number } {
  const col = areaIndex % 3;
  const row = Math.floor(areaIndex / 3);

  return {
    posX: baseOffset.x + col * spacing,
    posY: 0,
    posZ: baseOffset.z + row * spacing,
  };
}
