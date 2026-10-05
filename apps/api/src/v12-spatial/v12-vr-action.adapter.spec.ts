import { Test, TestingModule } from '@nestjs/testing';
import { V12VRActionAdapter, V12VRAction } from './v12-vr-action.adapter';
import { V12AssistantAdapter } from './v12-assistant.adapter';
import { V12IntentType } from '@aevora/shared';

describe('V12VRActionAdapter', () => {
  let adapter: V12VRActionAdapter;
  const mockAssistantAdapter = { processQuestion: jest.fn() };
  const context = { timestamp: '1', correlationId: 'c1', currentCompanyId: 'comp-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        V12VRActionAdapter,
        { provide: V12AssistantAdapter, useValue: mockAssistantAdapter },
      ],
    }).compile();
    adapter = module.get(V12VRActionAdapter);
  });

  it('SELECT delegates to the existing INSPECT_ENTITY intent through the real assistant adapter (same authorization path)', async () => {
    mockAssistantAdapter.processQuestion.mockResolvedValue({ status: 'SUCCESS', correlationId: 'c1' });
    await adapter.handle('user-1', V12VRAction.SELECT, context, { selectedEntityId: 'emp-1' });
    expect(mockAssistantAdapter.processQuestion).toHaveBeenCalledWith('user-1', V12IntentType.INSPECT_ENTITY, context, { selectedEntityId: 'emp-1' }, undefined);
  });

  it('INSPECT delegates to the same INSPECT_ENTITY intent as SELECT', async () => {
    mockAssistantAdapter.processQuestion.mockResolvedValue({ status: 'SUCCESS', correlationId: 'c1' });
    await adapter.handle('user-1', V12VRAction.INSPECT, context, {});
    expect(mockAssistantAdapter.processQuestion).toHaveBeenCalledWith('user-1', V12IntentType.INSPECT_ENTITY, context, {}, undefined);
  });

  it('MOVE delegates to the existing NAVIGATE_TO intent (the real navigation/pathfinding path)', async () => {
    mockAssistantAdapter.processQuestion.mockResolvedValue({ status: 'SUCCESS', correlationId: 'c1' });
    await adapter.handle('user-1', V12VRAction.MOVE, context, { targetName: 'Research' });
    expect(mockAssistantAdapter.processQuestion).toHaveBeenCalledWith('user-1', V12IntentType.NAVIGATE_TO, context, { targetName: 'Research' }, undefined);
  });

  it('OPEN_EXECUTIVE_UI never calls the assistant adapter — it is a local concern, not a business mutation', async () => {
    const result = await adapter.handle('user-1', V12VRAction.OPEN_EXECUTIVE_UI, context);
    expect(mockAssistantAdapter.processQuestion).not.toHaveBeenCalled();
    expect(result.status).toBe('SUCCESS');
  });

  it('INTERACT reports UNSUPPORTED truthfully rather than guessing at a command', async () => {
    const result = await adapter.handle('user-1', V12VRAction.INTERACT, context);
    expect(mockAssistantAdapter.processQuestion).not.toHaveBeenCalled();
    expect(result.status).toBe('UNSUPPORTED');
  });

  it('propagates REPLAY_READ_ONLY from the underlying assistant adapter unchanged (no VR-specific authorization bypass)', async () => {
    mockAssistantAdapter.processQuestion.mockResolvedValue({ status: 'REPLAY_READ_ONLY', correlationId: 'c1' });
    const result = await adapter.handle('user-1', V12VRAction.MOVE, context, {}, 'REPLAY' as any);
    expect(result.status).toBe('REPLAY_READ_ONLY');
    expect(mockAssistantAdapter.processQuestion).toHaveBeenCalledWith('user-1', V12IntentType.NAVIGATE_TO, context, {}, 'REPLAY');
  });

  it('resolves a real ray hit into context.selectedEntityId before delegating SELECT (physical targeting, not a fabricated id)', async () => {
    mockAssistantAdapter.processQuestion.mockResolvedValue({ status: 'SUCCESS', correlationId: 'c1' });
    const ray = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } };
    const candidates = [{ entityId: 'emp-real-1', position: { x: 0, y: 0, z: 5 }, radius: 0.6 }];

    await adapter.handle('user-1', V12VRAction.SELECT, context, { ray, candidates });

    expect(mockAssistantAdapter.processQuestion).toHaveBeenCalledWith(
      'user-1', V12IntentType.INSPECT_ENTITY,
      expect.objectContaining({ selectedEntityId: 'emp-real-1' }),
      { ray, candidates }, undefined,
    );
  });

  it('resolves a real ray hit for MOVE too, routing through the real navigation path with the hit entity as the target', async () => {
    mockAssistantAdapter.processQuestion.mockResolvedValue({ status: 'SUCCESS', correlationId: 'c1' });
    const ray = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } };
    const candidates = [{ entityId: 'room-research', position: { x: 0, y: 0, z: 3 }, radius: 1 }];

    await adapter.handle('user-1', V12VRAction.MOVE, context, { ray, candidates });

    expect(mockAssistantAdapter.processQuestion).toHaveBeenCalledWith(
      'user-1', V12IntentType.NAVIGATE_TO,
      expect.objectContaining({ selectedEntityId: 'room-research' }),
      { ray, candidates }, undefined,
    );
  });

  it('a ray that hits nothing leaves context unchanged — never fabricates a target', async () => {
    mockAssistantAdapter.processQuestion.mockResolvedValue({ status: 'AMBIGUOUS', correlationId: 'c1' });
    const ray = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } };
    const candidates = [{ entityId: 'behind-controller', position: { x: 0, y: 0, z: -5 }, radius: 0.6 }];

    await adapter.handle('user-1', V12VRAction.SELECT, context, { ray, candidates });

    expect(mockAssistantAdapter.processQuestion).toHaveBeenCalledWith('user-1', V12IntentType.INSPECT_ENTITY, context, { ray, candidates }, undefined);
  });

  it('propagates UNAUTHORIZED from the underlying assistant adapter unchanged', async () => {
    mockAssistantAdapter.processQuestion.mockResolvedValue({ status: 'UNAUTHORIZED', correlationId: 'c1' });
    const result = await adapter.handle('user-1', V12VRAction.SELECT, context, {});
    expect(result.status).toBe('UNAUTHORIZED');
  });
});
