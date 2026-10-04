import { Test, TestingModule } from '@nestjs/testing';
import { V12CommandController } from './v12-command.controller';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { V12CommandAdapter } from './v12-command.adapter';
import { V12IntentType } from '@aevora/shared';

describe('V12CommandController', () => {
  let controller: V12CommandController;
  let adapter: jest.Mocked<V12CommandAdapter>;

  beforeEach(async () => {
    const mockAdapter = {
      executeVoiceCommand: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [V12CommandController],
      providers: [
        { provide: V12CommandAdapter, useValue: mockAdapter },
      ],
    })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .compile();

    controller = module.get<V12CommandController>(V12CommandController);
    adapter = module.get(V12CommandAdapter);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('Security Embodiment', () => {
    it('Client-provided companyId cannot override authenticated company context', async () => {
      const req = {
        user: { actorId: 'actor1', companyId: 'company_auth_1' },
      };
      
      const body = {
        intent: V12IntentType.START_MEETING,
        context: {
          currentCompanyId: 'company_spoofed_99'
        },
        parameters: {}
      };

      await controller.executeCommand(req, body);

      // The controller should have overridden the spoofed companyId with the authenticated one.
      expect(adapter.executeVoiceCommand).toHaveBeenCalledWith(
        'actor1',
        V12IntentType.START_MEETING,
        { currentCompanyId: 'company_auth_1' },
        {},
        undefined
      );
    });

    it('creates context if none provided and populates companyId', async () => {
      const req = {
        user: { actorId: 'actor1', companyId: 'company_auth_1' },
      };
      
      const body = {
        intent: V12IntentType.START_MEETING,
        context: undefined as any,
        parameters: {}
      };

      await controller.executeCommand(req, body);

      expect(adapter.executeVoiceCommand).toHaveBeenCalledWith(
        'actor1',
        V12IntentType.START_MEETING,
        { currentCompanyId: 'company_auth_1' },
        {},
        undefined
      );
    });
  });
});
