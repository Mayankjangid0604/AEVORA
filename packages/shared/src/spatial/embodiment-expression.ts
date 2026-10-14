/**
 * V12 digital-human expression/posture/gaze/gesture state (decision 93).
 *
 * This is explicitly the ARCHITECTURE for intelligent expression, not photorealistic facial
 * animation — there is no face mesh, no blend shapes, no skeletal rig anywhere in this repository,
 * and this module does not claim otherwise. What it provides is the same deterministic-derivation
 * pattern as `employee-spatial-state.ts`: a pure function from authoritative context (the
 * employee's spatial state, whether they're speaking/listening, executive status) to a small,
 * explicit set of posture/gaze/gesture/expression states. It never invents an emotion — every state
 * is a direct, defensible mapping from an authoritative context value, never random.
 *
 * A renderer maps these enum values to whatever visual treatment it has (today: none beyond the
 * primitive mesh in DigitalHuman.tsx). That mapping is a rendering concern; this module only
 * defines WHAT the state should be, never HOW it looks.
 */

import { EmployeeSpatialState } from './employee-spatial-state';

export enum PostureState {
  STANDING = 'STANDING',
  SEATED = 'SEATED',
  WALKING = 'WALKING',
  DRIVING = 'DRIVING',
}

export enum GazeTarget {
  FORWARD = 'FORWARD',
  CONVERSATION_PARTNER = 'CONVERSATION_PARTNER',
  DESTINATION = 'DESTINATION',
  SCREEN = 'SCREEN',
}

export enum GestureState {
  NONE = 'NONE',
  LISTENING_NOD = 'LISTENING_NOD',
  PRESENTING = 'PRESENTING',
  GREETING = 'GREETING',
}

export enum ExpressionState {
  NEUTRAL = 'NEUTRAL',
  FOCUSED = 'FOCUSED',
  ENGAGED = 'ENGAGED',
  ALERT = 'ALERT',
}

export interface EmbodimentExpressionInputs {
  spatialState: EmployeeSpatialState;
  /** True while the Assistant/voice pipeline reports this employee is actively speaking. */
  isSpeaking?: boolean;
  /** True while in a meeting but not the current speaker. */
  isListening?: boolean;
  /** Derived from Role.accessLevel (CHAIRMAN/MANAGEMENT) — executives get a slightly more attentive default, never a different authority. */
  isExecutive?: boolean;
}

export interface EmbodimentExpression {
  posture: PostureState;
  gaze: GazeTarget;
  gesture: GestureState;
  expression: ExpressionState;
}

/**
 * Deterministic: the same inputs always produce the same output. Precedence:
 * 1. In a vehicle -> DRIVING posture, forward gaze (a physical fact, overrides everything else).
 * 2. Actively moving on foot -> WALKING posture, gaze toward the destination.
 * 3. In a meeting -> SEATED, speaking/listening-specific gaze/gesture/expression.
 * 4. Unavailable (terminated/blocked/etc.) -> NEUTRAL, no gesture — never an invented "sad" or "alert" emotion.
 * 5. Otherwise (working/idle/at workspace) -> STANDING, forward gaze, neutral-to-focused by activity.
 */
export function deriveEmbodimentExpression(inputs: EmbodimentExpressionInputs): EmbodimentExpression {
  const { spatialState, isSpeaking, isListening, isExecutive } = inputs;

  if (spatialState === EmployeeSpatialState.IN_VEHICLE) {
    return { posture: PostureState.DRIVING, gaze: GazeTarget.FORWARD, gesture: GestureState.NONE, expression: ExpressionState.FOCUSED };
  }

  if (spatialState === EmployeeSpatialState.TRAVELLING || spatialState === EmployeeSpatialState.MOVING) {
    return { posture: PostureState.WALKING, gaze: GazeTarget.DESTINATION, gesture: GestureState.NONE, expression: ExpressionState.NEUTRAL };
  }

  if (spatialState === EmployeeSpatialState.IN_MEETING) {
    if (isSpeaking) {
      return { posture: PostureState.SEATED, gaze: GazeTarget.CONVERSATION_PARTNER, gesture: GestureState.PRESENTING, expression: ExpressionState.ENGAGED };
    }
    if (isListening) {
      return { posture: PostureState.SEATED, gaze: GazeTarget.CONVERSATION_PARTNER, gesture: GestureState.LISTENING_NOD, expression: ExpressionState.FOCUSED };
    }
    return { posture: PostureState.SEATED, gaze: GazeTarget.CONVERSATION_PARTNER, gesture: GestureState.NONE, expression: ExpressionState.ENGAGED };
  }

  if (spatialState === EmployeeSpatialState.UNAVAILABLE) {
    return { posture: PostureState.STANDING, gaze: GazeTarget.FORWARD, gesture: GestureState.NONE, expression: ExpressionState.NEUTRAL };
  }

  if (spatialState === EmployeeSpatialState.WORKING) {
    return { posture: PostureState.SEATED, gaze: GazeTarget.SCREEN, gesture: GestureState.NONE, expression: isExecutive ? ExpressionState.FOCUSED : ExpressionState.NEUTRAL };
  }

  // AT_WORKSPACE, AT_OFFICE, IDLE, ON_BREAK
  return { posture: PostureState.STANDING, gaze: GazeTarget.FORWARD, gesture: GestureState.NONE, expression: ExpressionState.NEUTRAL };
}
