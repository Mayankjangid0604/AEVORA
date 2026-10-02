import { InboxController } from './inbox.controller';
import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { IntegrationModule } from '../integration/integration.module';
import { LeadGenModule } from '../lead-gen/lead-gen.module';
import { PrismaService } from '../prisma/prisma.service';
import { EmailOutreachService } from './email-outreach.service';
import { PhoneOutreachService } from './phone-outreach.service';
import { DiscoveryService } from './discovery.service';
import { SalesAgentWorker } from './sales-agent.worker';
import { SalesOutreachController } from './sales-outreach.controller';
import { DemoFactoryService } from './demo-factory.service';
import { WhatsAppOutreachService } from './whatsapp-outreach.service';
import { InboundMessageService } from './inbound-message.service';
import { ClientMeetingService } from './client-meeting.service';
import { ClientMeetingController } from './client-meeting.controller';

const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

@Module({
  imports: [DevicesModule, IntegrationModule, LeadGenModule],
  providers: [EmailOutreachService, PhoneOutreachService, WhatsAppOutreachService, DiscoveryService, SalesAgentWorker, DemoFactoryService, InboundMessageService, ClientMeetingService],
  controllers: [SalesOutreachController, InboxController, ClientMeetingController],
  exports: [EmailOutreachService, PhoneOutreachService, WhatsAppOutreachService, DiscoveryService, SalesAgentWorker, DemoFactoryService, InboundMessageService, ClientMeetingService],
})
export class SalesOutreachModule implements OnModuleInit {
  private readonly logger = new Logger('SalesOutreachCron');

  constructor(
    private readonly worker: SalesAgentWorker,
    private readonly inbound: InboundMessageService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    if (process.env.SALES_AUTO_PROCESS !== 'true') {
      this.logger.log('Auto-processing disabled (set SALES_AUTO_PROCESS=true to enable)');
      return;
    }

    // Run once on startup after a short delay, then every 30 minutes
    setTimeout(() => this.runCycle(), 10_000);
    setInterval(() => this.runCycle(), INTERVAL_MS);
    this.logger.log(`Auto-processing enabled — runs every ${INTERVAL_MS / 60_000} minutes`);
  }

  private async runCycle() {
    try {
      const company = await this.prisma.company.findFirst({ orderBy: { createdAt: 'desc' } });
      if (!company) return;

      this.logger.log(`Processing outreach queue for ${company.name}...`);
      const result = await this.worker.processQueue(company.id);
      this.logger.log(`Queue result: ${JSON.stringify(result)}`);

      // Poll inbound emails
      try {
        await this.inbound.pollEmailInbox(company.id);
        this.logger.log('Inbound email poll complete');
      } catch (e) {
        this.logger.warn(`Inbound poll failed: ${e.message}`);
      }
    } catch (e) {
      this.logger.error(`Outreach cycle failed: ${e.message}`);
    }
  }
}
