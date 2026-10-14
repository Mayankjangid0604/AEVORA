import { Injectable, Logger } from '@nestjs/common';
import { V12AssistantAdapter } from './assistant.adapter';
import { V12IntentType, V12ExecutiveAssistantContext, V12AssistantResponse, WorldMode, Ray, RayTargetCandidate, resolveRayTarget } from '@aevora/shared';

/**
 * Normalized VR action → existing Aevora command path (decisions 99/118/119's missing follow-through).
 *
 * WebXR controller event → WebXRSessionManager's XRControllerAction (raw SELECT/SQUEEZE/MOVE,
 * packages/shared/src/v12/webxr.ts) → a renderer-side decision about WHICH business-level action
 * that represents (not this adapter's concern) → this adapter's V12VRAction → the SAME
 * V12AssistantAdapter.processQuestion every other client (voice, text command) already uses.
 *
 * This adapter adds no authorization of its own and performs no business mutation itself — it only
 * translates a VR action name into the matching existing intent and delegates. Company isolation,
 * replay-read-only gating, and permission checks all come from `V12AssistantAdapter` unchanged.
 */
export enum V12VRAction {
  SELECT = 'SELECT',
  INSPECT = 'INSPECT',
  MOVE = 'MOVE',
  INTERACT = 'INTERACT',
  OPEN_EXECUTIVE_UI = 'OPEN_EXECUTIVE_UI',
}

@Injectable()
export class VRActionAdapter {
  private readonly logger = new Logger(V12VRActionAdapter.name);

  constructor(private readonly assistantAdapter: V12AssistantAdapter) {}

  async handle(
    userId: string,
    action: V12VRAction,
    context: V12ExecutiveAssistantContext,
    parameters: any = {},
    mode?: WorldMode,
  ): Promise<V12AssistantResponse> {
    // Physical interaction layer (decisions 99/119): if the caller supplied a real controller ray
    // and the real candidate entities currently in the scene, resolve an actual target via the
    // same deterministic ray/sphere test used everywhere else — never a fabricated entity id. A
    // SELECT/MOVE with no ray (or a ray that hits nothing) falls through with no resolved target,
    // exactly as if the user hadn't pointed at anything; existing AMBIGUOUS/NOT_FOUND handling in
    // V12AssistantAdapter takes it from there.
    let resolvedContext = context;
    if ((action === V12VRAction.SELECT || action === V12VRAction.INSPECT || action === V12VRAction.MOVE || action === V12VRAction.INTERACT) && parameters?.ray && parameters?.candidates) {
      const targetId = resolveRayTarget(parameters.ray as Ray, parameters.candidates as RayTargetCandidate[]);
      if (targetId) {
        this.logger.log(`VR ray resolved to real entity ${targetId} for action ${action}`);
        resolvedContext = { ...context, selectedEntityId: targetId };
      }
    }

    switch (action) {
      case V12VRAction.SELECT:
      case V12VRAction.INSPECT:
        return this.assistantAdapter.processQuestion(userId, V12IntentType.INSPECT_ENTITY, resolvedContext, parameters, mode);

      case V12VRAction.MOVE:
        return this.assistantAdapter.processQuestion(userId, V12IntentType.NAVIGATE_TO, resolvedContext, parameters, mode);

      case V12VRAction.OPEN_EXECUTIVE_UI:
        // A local presentation toggle, not an enterprise mutation — there is no Aevora command for
        // "open a UI panel," so this truthfully reports that no backend action was needed rather
        // than inventing one.
        return { status: 'SUCCESS', correlationId: context.correlationId, responseText: 'Executive UI is a client-side presentation concern; no backend action required.' };

      case V12VRAction.INTERACT:
        // Generic "interact with whatever is selected" has no single mapped Aevora command yet —
        // reported truthfully as unsupported rather than guessing at a command to call.
        return { status: 'UNSUPPORTED', correlationId: context.correlationId, responseText: 'Generic interaction has no mapped Aevora command yet.' };

      default:
        return { status: 'UNSUPPORTED', correlationId: context.correlationId, responseText: `Unknown VR action: ${action}` };
    }
  }
}

export const V12VRActionAdapter = VRActionAdapter;
export type V12VRActionAdapter = VRActionAdapter;
