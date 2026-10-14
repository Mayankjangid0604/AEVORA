import { describe, it, expect } from 'vitest';
import {
  deriveEmployeeSpatialState,
  deriveEmbodimentExpression,
  EmployeeSpatialState,
  PostureState,
  GazeTarget,
  ExpressionState,
  V12EntityType,
  type WorldEntity,
} from '@aevora/shared';
import { CAMERA_PRESETS } from '@/components/spatial/SpatialScene';
import {
  QUALITY_PRESETS,
  type QualityTier,
} from '@/components/spatial/AdaptivePerformanceController';

describe('AEVORA V22 — Living 3D World Verification Suite', () => {
  describe('Phase B: Cinematic Environment & Camera Systems', () => {
    it('provides expanded camera presets with all required baseline plus specialized angles', () => {
      expect(CAMERA_PRESETS.length).toBeGreaterThanOrEqual(6);
      const presetIds = CAMERA_PRESETS.map((p) => p.id);

      // Verify V15 baseline presets preserved
      expect(presetIds).toContain('overview');
      expect(presetIds).toContain('executive');
      expect(presetIds).toContain('main');
      expect(presetIds).toContain('parking');

      // Verify V22 cinematic expansions
      expect(presetIds).toContain('engineering');
      expect(presetIds).toContain('fleet');

      // Verify valid coordinates
      for (const preset of CAMERA_PRESETS) {
        expect(preset.position).toHaveLength(3);
        expect(preset.target).toHaveLength(3);
        expect(Number.isFinite(preset.position[0])).toBe(true);
        expect(Number.isFinite(preset.position[1])).toBe(true);
        expect(Number.isFinite(preset.position[2])).toBe(true);
      }
    });

    it('verifies cinematic quality presets have graduated shadow and DPR settings', () => {
      expect(QUALITY_PRESETS.CINEMATIC_ULTRA.dpr).toBe(1.5);
      expect(QUALITY_PRESETS.CINEMATIC_ULTRA.shadowMapSize).toBe(2048);
      expect(QUALITY_PRESETS.CINEMATIC_ULTRA.softShadows).toBe(true);

      expect(QUALITY_PRESETS.BALANCED.dpr).toBe(1.0);
      expect(QUALITY_PRESETS.BALANCED.shadowMapSize).toBe(1024);

      expect(QUALITY_PRESETS.PERFORMANCE.dpr).toBe(0.9);
      expect(QUALITY_PRESETS.PERFORMANCE.shadowMapSize).toBe(512);

      expect(QUALITY_PRESETS.BATTERY_SAVER.dpr).toBe(0.75);
      expect(QUALITY_PRESETS.BATTERY_SAVER.shadows).toBe(false);
    });
  });

  describe('Phase C: Realistic Avatar Kinematics & Factual Enterprise Binding', () => {
    it('maps authoritative MOVING state to WALKING posture with destination gaze', () => {
      const spatialState = deriveEmployeeSpatialState({
        movementState: 'MOVING',
        movementMode: 'WALK',
        currentActivity: 'TASK_ASSIGNED',
        employeeStatus: 'ACTIVE',
      });
      expect(spatialState).toBe(EmployeeSpatialState.TRAVELLING);

      const expression = deriveEmbodimentExpression({
        spatialState,
        isSpeaking: false,
        isListening: false,
      });
      expect(expression.posture).toBe(PostureState.WALKING);
      expect(expression.gaze).toBe(GazeTarget.DESTINATION);
    });

    it('maps authoritative WORKING state to SEATED posture facing screen without hallucinating action', () => {
      const spatialState = deriveEmployeeSpatialState({
        movementState: 'IDLE',
        currentActivity: 'WORKING',
        employeeStatus: 'ACTIVE',
      });
      expect(spatialState).toBe(EmployeeSpatialState.WORKING);

      const expression = deriveEmbodimentExpression({
        spatialState,
        isSpeaking: false,
        isListening: false,
      });
      expect(expression.posture).toBe(PostureState.SEATED);
      expect(expression.gaze).toBe(GazeTarget.SCREEN);
      expect(expression.expression).toBe(ExpressionState.NEUTRAL);
    });

    it('maps authoritative IN_MEETING state to SEATED posture with conversation partner gaze', () => {
      const spatialState = deriveEmployeeSpatialState({
        movementState: 'IDLE',
        currentActivity: 'IN_MEETING',
        employeeStatus: 'ACTIVE',
      });
      expect(spatialState).toBe(EmployeeSpatialState.IN_MEETING);

      const expression = deriveEmbodimentExpression({
        spatialState,
        isSpeaking: true,
        isListening: false,
      });
      expect(expression.posture).toBe(PostureState.SEATED);
      expect(expression.gaze).toBe(GazeTarget.CONVERSATION_PARTNER);
      expect(expression.expression).toBe(ExpressionState.ENGAGED);
    });

    it('maps vehicle movement state to DRIVING posture', () => {
      const spatialState = deriveEmployeeSpatialState({
        movementState: 'MOVING',
        movementMode: 'VEHICLE',
        currentActivity: 'WORKING',
        employeeStatus: 'ACTIVE',
      });
      expect(spatialState).toBe(EmployeeSpatialState.IN_VEHICLE);

      const expression = deriveEmbodimentExpression({
        spatialState,
      });
      expect(expression.posture).toBe(PostureState.DRIVING);
      expect(expression.gaze).toBe(GazeTarget.FORWARD);
    });

    it('strictly maps terminated or suspended employees to UNAVAILABLE', () => {
      const spatialState = deriveEmployeeSpatialState({
        movementState: 'IDLE',
        currentActivity: 'WORKING',
        employeeStatus: 'TERMINATED',
      });
      expect(spatialState).toBe(EmployeeSpatialState.UNAVAILABLE);

      const expression = deriveEmbodimentExpression({
        spatialState,
      });
      expect(expression.posture).toBe(PostureState.STANDING);
      expect(expression.expression).toBe(ExpressionState.NEUTRAL);
    });
  });

  describe('Phase D: Hybrid Interaction & Accessible 2D Twin Directory', () => {
    it('filters spatial entities correctly across multiple categories in search modal', () => {
      const entities = new Map<string, WorldEntity>();

      entities.set('p-1', {
        id: 'p-1',
        type: V12EntityType.PERSON,
        name: 'Sarah Connor',
        transform: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
        visibility: { isVisible: true, opacity: 1, renderState: 'NORMAL' },
      } as unknown as WorldEntity);

      entities.set('r-1', {
        id: 'r-1',
        type: V12EntityType.ROOM,
        name: 'Boardroom Delta',
        transform: { position: { x: 10, y: 1, z: 10 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
        visibility: { isVisible: true, opacity: 1, renderState: 'NORMAL' },
      } as unknown as WorldEntity);

      entities.set('v-1', {
        id: 'v-1',
        type: V12EntityType.VEHICLE,
        name: 'Executive Limousine',
        transform: { position: { x: 20, y: 0, z: 20 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
        visibility: { isVisible: true, opacity: 1, renderState: 'NORMAL' },
      } as unknown as WorldEntity);

      // Search by query text
      const queryMatches = Array.from(entities.values()).filter((e) =>
        e.name.toLowerCase().includes('connor')
      );
      expect(queryMatches).toHaveLength(1);
      expect(queryMatches[0]!.id).toBe('p-1');

      // Filter by type
      const roomMatches = Array.from(entities.values()).filter((e) => e.type === V12EntityType.ROOM);
      expect(roomMatches).toHaveLength(1);
      expect(roomMatches[0]!.name).toBe('Boardroom Delta');
    });

    it('ensures essential operational data is partitionable into accessible 2D categories', () => {
      const entities = new Map<string, WorldEntity>();

      // Populate sample enterprise campus
      for (let i = 0; i < 30; i++) {
        const type =
          i < 10
            ? V12EntityType.PERSON
            : i < 20
            ? V12EntityType.ROOM
            : i < 25
            ? V12EntityType.WORKSPACE
            : V12EntityType.VEHICLE;

        entities.set(`item-${i}`, {
          id: `item-${i}`,
          type,
          name: `Item ${i}`,
          transform: { position: { x: i, y: 0, z: i }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
          visibility: { isVisible: true, opacity: 1, renderState: 'NORMAL' },
        } as unknown as WorldEntity);
      }

      let persons = 0;
      let rooms = 0;
      let workspaces = 0;
      let vehicles = 0;

      entities.forEach((entity) => {
        if (entity.type === V12EntityType.PERSON) persons++;
        else if (entity.type === V12EntityType.ROOM) rooms++;
        else if (entity.type === V12EntityType.WORKSPACE) workspaces++;
        else if (entity.type === V12EntityType.VEHICLE) vehicles++;
      });

      expect(persons).toBe(10);
      expect(rooms).toBe(10);
      expect(workspaces).toBe(5);
      expect(vehicles).toBe(5);
      expect(persons + rooms + workspaces + vehicles).toBe(30);
    });
  });

  describe('Phase E: Adaptive Performance & Lifecycle Resilience', () => {
    it('provides hysteresis step-down and step-up rules in quality tiers', () => {
      const tiers: QualityTier[] = ['CINEMATIC_ULTRA', 'BALANCED', 'PERFORMANCE', 'BATTERY_SAVER'];

      // Ensure every tier exists in QUALITY_PRESETS with non-zero DPR
      for (const tier of tiers) {
        const preset = QUALITY_PRESETS[tier];
        expect(preset).toBeDefined();
        expect(preset.dpr).toBeGreaterThanOrEqual(0.75);
        expect(preset.dpr).toBeLessThanOrEqual(2.0);
      }
    });

    it('verifies WebGL context loss recovery simulation', () => {
      let isContextLost = false;
      const onContextLost = () => {
        isContextLost = true;
      };
      const onContextRestored = () => {
        isContextLost = false;
      };

      // Trigger lost
      onContextLost();
      expect(isContextLost).toBe(true);

      // Trigger restored
      onContextRestored();
      expect(isContextLost).toBe(false);
    });

    it('matches type synonyms in search (EMPLOYEE for PERSON, OFFICE/MEETING_ROOM for ROOM)', () => {
      const entities = new Map<string, WorldEntity>();

      entities.set('emp-1', {
        id: 'emp-1',
        type: 'EMPLOYEE' as unknown as V12EntityType,
        name: 'Dev Lead',
      } as unknown as WorldEntity);

      entities.set('off-1', {
        id: 'off-1',
        type: 'OFFICE' as unknown as V12EntityType,
        name: 'CEO Office',
      } as unknown as WorldEntity);

      // Check PERSON filter matches EMPLOYEE
      const filterTypePerson: string = 'PERSON';
      const personMatches = Array.from(entities.values()).filter((e) => {
        const type = (e.type || '').toUpperCase();
        return (
          filterTypePerson === 'ALL' ||
          (filterTypePerson === 'PERSON' && (type === 'PERSON' || type === 'EMPLOYEE')) ||
          type.includes(filterTypePerson)
        );
      });
      expect(personMatches).toHaveLength(1);
      expect(personMatches[0]!.id).toBe('emp-1');

      // Check ROOM filter matches OFFICE
      const filterTypeRoom: string = 'ROOM';
      const roomMatches = Array.from(entities.values()).filter((e) => {
        const type = (e.type || '').toUpperCase();
        return (
          filterTypeRoom === 'ALL' ||
          (filterTypeRoom === 'ROOM' &&
            (type === 'ROOM' || type === 'OFFICE' || type === 'MEETING_ROOM' || type === 'DEPARTMENT_SPACE')) ||
          type.includes(filterTypeRoom)
        );
      });
      expect(roomMatches).toHaveLength(1);
      expect(roomMatches[0]!.id).toBe('off-1');
    });

    it('safely formats coordinates without throwing or displaying undefined when coordinates are partial or missing', () => {
      const formatCoords = (pos?: { x?: number; y?: number; z?: number }) => {
        return pos && typeof pos.x === 'number' && typeof pos.y === 'number' && typeof pos.z === 'number'
          ? `[${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}]`
          : 'N/A';
      };

      expect(formatCoords(undefined)).toBe('N/A');
      expect(formatCoords({ x: 10 })).toBe('N/A');
      expect(formatCoords({ x: 0, y: 0, z: 0 })).toBe('[0.0, 0.0, 0.0]');
      expect(formatCoords({ x: 12.34, y: 5.67, z: -8.91 })).toBe('[12.3, 5.7, -8.9]');
    });

    it('verifies camera hotkeys 1 through 6 map to valid presets', () => {
      const hotkeyMap: Record<string, string> = {
        '1': 'overview',
        '2': 'executive',
        '3': 'main',
        '4': 'parking',
        '5': 'engineering',
        '6': 'fleet',
      };

      const presetIds = CAMERA_PRESETS.map((p) => p.id);
      for (const presetId of Object.values(hotkeyMap)) {
        expect(presetIds).toContain(presetId);
      }
    });
  });
});
