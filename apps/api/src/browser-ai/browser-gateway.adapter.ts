import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ModelGateway, ModelProvider, ModelRequest, ModelResponse, ModelCapabilities } from '@aevora/model-gateway';
import { BrowserWorkerService } from './browser-worker.service';
import { BrowserConversationService } from './browser-conversation.service';

@Injectable()
export class BrowserGatewayAdapter implements ModelProvider, OnModuleInit {
  public name = 'BrowserAI';
  private readonly logger = new Logger(BrowserGatewayAdapter.name);

  public capabilities: ModelCapabilities = {
    supportsVision: false,
    supportsFunctionCalling: false,
    maxTokens: 4096,
  };

  constructor(
    private readonly worker: BrowserWorkerService,
    private readonly conversationService: BrowserConversationService,
  ) {}

  onModuleInit() {
    this.logger.log('Registering BrowserProvider with ModelGateway');
    ModelGateway.registerGlobalBrowserProvider(this);
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (!request.employeeId) {
      throw new Error('Browser execution requires employeeId');
    }

    const profiles = await this.worker.listProfiles();
    const profile = profiles.find(p => p.employeeId === request.employeeId);

    if (!profile) {
      throw new Error(`No browser profile assigned to employee ${request.employeeId}`);
    }

    // Try to open the browser if not already open
    await this.worker.openBrowser(profile.id);

    try {
      // Ensure we use one chat per provider for this employee
      const requestedProvider = 'generic'; // Or determine from request.tier
      
      let conversation = await this.conversationService.findConversation(
        request.employeeId,
        requestedProvider
      );

      if (!conversation) {
        // e.g. Open generic chat page
        await this.worker.openUrl(profile.id, 'https://chat.example.com');
        
        conversation = await this.conversationService.createConversation(
          request.employeeId,
          profile.id,
          requestedProvider,
          profile.name
        );
      } else {
        // In reality, navigate back to conversationUrl if needed
      }

      const promptText = request.systemMessage 
        ? `${request.systemMessage}\n\n${request.prompt}` 
        : request.prompt;

      const result = await this.worker.sendMessage(profile.id, promptText);

      return {
        text: result,
        provider: 'BrowserAI',
        model: 'Chrome',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      };
    } finally {
      // We don't automatically close the browser because we want persistent sessions.
      // We release the "busy" state to "assigned"
      await this.worker.releaseBrowserLock(profile.id);
    }
  }
}
