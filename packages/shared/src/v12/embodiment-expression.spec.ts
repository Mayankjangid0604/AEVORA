import { deriveEmbodimentExpression, PostureState, GazeTarget, GestureState, ExpressionState } from './embodiment-expression';
import { EmployeeSpatialState } from './employee-spatial-state';

describe('deriveEmbodimentExpression', () => {
  it('IN_VEHICLE -> DRIVING posture regardless of other context (a physical fact overrides everything)', () => {
    const result = deriveEmbodimentExpression({ spatialState: EmployeeSpatialState.IN_VEHICLE, isSpeaking: true });
    expect(result.posture).toBe(PostureState.DRIVING);
    expect(result.gesture).toBe(GestureState.NONE);
  });

  it('TRAVELLING/MOVING -> WALKING posture, gaze toward destination', () => {
    expect(deriveEmbodimentExpression({ spatialState: EmployeeSpatialState.TRAVELLING }).posture).toBe(PostureState.WALKING);
    expect(deriveEmbodimentExpression({ spatialState: EmployeeSpatialState.MOVING }).gaze).toBe(GazeTarget.DESTINATION);
  });

  it('IN_MEETING + speaking -> PRESENTING gesture, ENGAGED expression', () => {
    const result = deriveEmbodimentExpression({ spatialState: EmployeeSpatialState.IN_MEETING, isSpeaking: true });
    expect(result).toEqual({ posture: PostureState.SEATED, gaze: GazeTarget.CONVERSATION_PARTNER, gesture: GestureState.PRESENTING, expression: ExpressionState.ENGAGED });
  });

  it('IN_MEETING + listening -> LISTENING_NOD gesture, FOCUSED expression', () => {
    const result = deriveEmbodimentExpression({ spatialState: EmployeeSpatialState.IN_MEETING, isListening: true });
    expect(result.gesture).toBe(GestureState.LISTENING_NOD);
    expect(result.expression).toBe(ExpressionState.FOCUSED);
  });

  it('IN_MEETING with neither speaking nor listening flag -> still SEATED facing the conversation, no gesture', () => {
    const result = deriveEmbodimentExpression({ spatialState: EmployeeSpatialState.IN_MEETING });
    expect(result.posture).toBe(PostureState.SEATED);
    expect(result.gesture).toBe(GestureState.NONE);
  });

  it('UNAVAILABLE -> neutral, no invented emotion like "sad" or "alarmed"', () => {
    const result = deriveEmbodimentExpression({ spatialState: EmployeeSpatialState.UNAVAILABLE });
    expect(result.expression).toBe(ExpressionState.NEUTRAL);
    expect(result.gesture).toBe(GestureState.NONE);
  });

  it('WORKING executives get a FOCUSED expression; non-executives get NEUTRAL — a defensible, non-random distinction', () => {
    expect(deriveEmbodimentExpression({ spatialState: EmployeeSpatialState.WORKING, isExecutive: true }).expression).toBe(ExpressionState.FOCUSED);
    expect(deriveEmbodimentExpression({ spatialState: EmployeeSpatialState.WORKING, isExecutive: false }).expression).toBe(ExpressionState.NEUTRAL);
  });

  it('AT_WORKSPACE/IDLE -> STANDING, forward gaze, neutral', () => {
    const result = deriveEmbodimentExpression({ spatialState: EmployeeSpatialState.AT_WORKSPACE });
    expect(result).toEqual({ posture: PostureState.STANDING, gaze: GazeTarget.FORWARD, gesture: GestureState.NONE, expression: ExpressionState.NEUTRAL });
  });

  it('is a pure deterministic function: identical inputs always produce an identical result', () => {
    const inputs = { spatialState: EmployeeSpatialState.IN_MEETING, isSpeaking: true, isExecutive: true };
    const results = new Set(Array.from({ length: 10 }, () => JSON.stringify(deriveEmbodimentExpression(inputs))));
    expect(results.size).toBe(1);
  });
});
