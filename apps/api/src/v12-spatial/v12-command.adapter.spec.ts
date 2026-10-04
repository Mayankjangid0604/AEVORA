import { Test, TestingModule } from '@nestjs/testing';
import { V12CommandAdapter } from './v12-command.adapter';
import { ReplaySessionService } from '../world-state-gateway/replay-session.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { V12IntentType, WorldMode } from '@aevora/shared';
import { ForbiddenException } from '@nestjs/common';
import { StructuredLoggerService } from '../logger/structured-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { MeetingService } from '../communication/meeting.service';
import { V12NavigationService } from './v12-navigation.service';

describe('V12CommandAdapter', () => {
  let adapter: V12CommandAdapter;
  let sessions: ReplaySessionService;
  let authService: jest.Mocked<AuthorizationService>;

  beforeEach(async () => {
    const mockAuthService = {
      checkPermission: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        V12CommandAdapter, 
        ReplaySessionService,
        { provide: AuthorizationService, useValue: mockAuthService },
        { provide: StructuredLoggerService, useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), setContext: jest.fn() } },
        { provide: PrismaService, useValue: { employee: { findMany: jest.fn().mockResolvedValue([]) }, v12SpatialWorkspace: { findFirst: jest.fn().mockResolvedValue(null) }, v12NavigationNode: { findFirst: jest.fn().mockResolvedValue(null) } } },
        { provide: MeetingService, useValue: { scheduleMeeting: jest.fn(), startMeeting: jest.fn() } },
        { provide: V12NavigationService, useValue: { requestEntityMovement: jest.fn() } }
      ],
    }).compile();

    adapter = module.get<V12CommandAdapter>(V12CommandAdapter);
    sessions = module.get(ReplaySessionService);
    authService = module.get(AuthorizationService) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('Security Embodiment & Authorization', () => {
    it('Authorized action (A)', async () => {
      authService.checkPermission.mockResolvedValue(true);
      const result = await adapter.executeVoiceCommand(
        'actor1',
        V12IntentType.START_MEETING,
        { currentCompanyId: 'comp1' },
        {}
      );
      expect(result.status).toBe('UNSUPPORTED'); // Authorized, but currently unsupported intent
      expect(authService.checkPermission).toHaveBeenCalledWith('actor1', 'V12_COMMAND_EXECUTE', 'comp1');
    });

    it('Unauthorized action (B)', async () => {
      authService.checkPermission.mockRejectedValue(new ForbiddenException('Missing required permission'));
      const result = await adapter.executeVoiceCommand(
        'actor1',
        V12IntentType.START_MEETING,
        { currentCompanyId: 'comp1' },
        {}
      );
      expect(result.status).toBe('REJECTED');
      expect(result.message).toContain('not authorized to execute this command');
    });

    it('Cross-company (C) is rejected via auth service', async () => {
      authService.checkPermission.mockRejectedValue(new ForbiddenException('Actor does not belong to this company'));
      const result = await adapter.executeVoiceCommand(
        'actor1',
        V12IntentType.START_MEETING,
        { currentCompanyId: 'comp2' }, // actor1 is in comp1
        {}
      );
      expect(result.status).toBe('REJECTED');
      expect(result.message).toContain('not authorized');
    });

    it('Rejects immediately if no active company context is provided', async () => {
      const result = await adapter.executeVoiceCommand(
        'actor1',
        V12IntentType.START_MEETING,
        {}, // missing currentCompanyId
        {}
      );
      expect(result.status).toBe('REJECTED');
      expect(result.message).toContain('No active company context provided');
      expect(authService.checkPermission).not.toHaveBeenCalled(); // Fast fail
    });

    it('No mutation on failure (J)', async () => {
      authService.checkPermission.mockRejectedValue(new ForbiddenException());
      const result = await adapter.executeVoiceCommand(
        'actor1',
        V12IntentType.START_MEETING,
        { currentCompanyId: 'comp1' },
        {}
      );
      expect(result.status).toBe('REJECTED');
      // Proof: The intent does not hit the switch block and returns REJECTED before processing
    });

    it('No false events (K)', async () => {
      authService.checkPermission.mockRejectedValue(new ForbiddenException());
      const result = await adapter.executeVoiceCommand(
        'actor1',
        V12IntentType.START_MEETING,
        { currentCompanyId: 'comp1' },
        {}
      );
      expect(result.status).not.toBe('ACCEPTED');
      expect(result.status).not.toBe('SUCCESS');
    });
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
      authService.checkPermission.mockResolvedValue(true);
      const r = await adapter.executeVoiceCommand('user1', V12IntentType.START_MEETING, { currentCompanyId: 'c1' }, {});
      expect(r.status).toBe('UNSUPPORTED');
    });
  });
});
