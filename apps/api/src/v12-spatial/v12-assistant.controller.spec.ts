import { Test, TestingModule } from '@nestjs/testing';
import { V12AssistantController } from './v12-assistant.controller';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { V12AssistantAdapter } from './v12-assistant.adapter';
import { V12IntentType } from '@aevora/shared';

describe('V12AssistantController', () => {
  let controller: V12AssistantController;
  let adapter: jest.Mocked<V12AssistantAdapter>;

  beforeEach(async () => {
    const mockAdapter = {
      processQuestion: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [V12AssistantController],
      providers: [
        { provide: V12AssistantAdapter, useValue: mockAdapter },
      ],
    })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .compile();

    controller = module.get<V12AssistantController>(V12AssistantController);
    adapter = module.get(V12AssistantAdapter);
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
        intent: V12IntentType.NAVIGATE_TO,
        context: {
          currentCompanyId: 'company_spoofed_99',
          timestamp: 'now',
          correlationId: '123'
        },
        parameters: {}
      };

      await controller.askQuestion(req, body);

      expect(adapter.processQuestion).toHaveBeenCalledWith(
        'actor1',
        V12IntentType.NAVIGATE_TO,
        {
          currentCompanyId: 'company_auth_1',
          timestamp: 'now',
          correlationId: '123'
        },
        {},
        undefined
      );
    });
  });
});
