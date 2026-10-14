import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { VRActionAdapter, V12VRAction } from './vr-action.adapter';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { V12ExecutiveAssistantContext, V12AssistantResponse, WorldMode } from '@aevora/shared';

/**
 * The real HTTP transport for normalized VR actions (decisions 99/119's missing endpoint).
 * Deliberately mirrors `V12CommandController`/`V12AssistantController` exactly — same guard, same
 * "client-supplied companyId can never override the authenticated company context" security rule
 * that already protects every other V12 entry point. No VR-specific authorization is introduced:
 * this controller does nothing but parse the request and hand it to `VRActionAdapter`, which
 * itself does nothing but delegate to the same `V12AssistantAdapter` every other client uses.
 */
@Controller(['spatial/vr-action', 'v12-vr-action'])
@UseGuards(JwtAuthGuard)
export class VRActionController {
  constructor(private readonly vrActionAdapter: VRActionAdapter) {}

  @Post('execute')
  async executeAction(
    @Request() req,
    @Body() body: { action: V12VRAction; context: V12ExecutiveAssistantContext; parameters: any; mode?: WorldMode }
  ): Promise<V12AssistantResponse> {
    const userId = req.user.actorId ?? req.user.id;

    // Security Embodiment: Client-provided companyId cannot override authenticated company context
    // — the same rule every other V12 controller enforces, not a VR-specific carve-out.
    if (req.user.companyId) {
      if (!body.context) body.context = { timestamp: new Date().toISOString(), correlationId: '' };
      body.context.currentCompanyId = req.user.companyId;
    }

    return this.vrActionAdapter.handle(userId, body.action, body.context, body.parameters, body.mode);
  }
}

export const V12VRActionController = VRActionController;
export type V12VRActionController = VRActionController;
