import { Test, TestingModule } from '@nestjs/testing';
import { V12CommandAdapter } from './v12-command.adapter';
import { ReplaySessionService } from '../world-state-gateway/replay-session.service';
import { V12IntentType, WorldMode } from '@aevora/shared';

describe('V12CommandAdapter', () => {
  let adapter: V12CommandAdapter;
  let sessions: ReplaySessionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [V12CommandAdapter, ReplaySessionService],
    }).compile();

    adapter = module.get<V12CommandAdapter>(V12CommandAdapter);
    sessions = module.get(ReplaySessionService);
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  it('should return UNSUPPORTED for BRING_EXECUTIVE since it is not backed by existing orchestration', async () => {
    const result = await adapter.executeVoiceCommand(
      'user1',
      V12IntentType.BRING_EXECUTIVE,
      {},
      {}
    );

    expect(result.status).toBe('UNSUPPORTED');
    expect(result.message).toContain('BACKEND CAPABILITY NOT AVAILABLE');
    expect(result.correlationId).toBeDefined();
  });

  it('should return UNSUPPORTED for START_MEETING', async () => {
    const result = await adapter.executeVoiceCommand(
      'user1',
      V12IntentType.START_MEETING,
      {},
      {}
    );

    expect(result.status).toBe('UNSUPPORTED');
    expect(result.message).toContain('BACKEND CAPABILITY NOT AVAILABLE');
    expect(result.correlationId).toBeDefined();
  });

  describe('REPLAY_READ_ONLY (server-enforced)', () => {
    it('rejects when the client declares REPLAY', async () => {
      const r = await adapter.executeVoiceCommand('user1', V12IntentType.START_MEETING, {}, {}, WorldMode.REPLAY);
      expect(r.status).toBe('REPLAY_READ_ONLY');
      expect(r.intent).toBe(V12IntentType.START_MEETING);
    });

    it('rejects when the server session is active even if the client claims LIVE', async () => {
      sessions.enter('user1', 'c1');
      const r = await adapter.executeVoiceCommand('user1', V12IntentType.BRING_EXECUTIVE, {}, {}, WorldMode.LIVE);
      expect(r.status).toBe('REPLAY_READ_ONLY');
    });

    it('rejects when the server session is active and the client omits mode', async () => {
      sessions.enter('user1', 'c1');
      const r = await adapter.executeVoiceCommand('user1', V12IntentType.CALL_EXECUTIVE, {}, {});
      expect(r.status).toBe('REPLAY_READ_ONLY');
    });

    it('does not block other actors', async () => {
      sessions.enter('user2', 'c1');
      const r = await adapter.executeVoiceCommand('user1', V12IntentType.START_MEETING, {}, {});
      expect(r.status).toBe('UNSUPPORTED');
    });

    it('allows commands again after the session expires or is exited', async () => {
      sessions.enter('user1', 'c1', Date.now() - sessions.ttlMs - 1);
      expect((await adapter.executeVoiceCommand('user1', V12IntentType.START_MEETING, {}, {})).status).toBe('UNSUPPORTED');
      sessions.enter('user1', 'c1');
      sessions.exit('user1');
      expect((await adapter.executeVoiceCommand('user1', V12IntentType.START_MEETING, {}, {})).status).toBe('UNSUPPORTED');
    });
  });
});
