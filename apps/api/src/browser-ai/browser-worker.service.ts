import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import puppeteer, { Browser, Page } from 'puppeteer';

@Injectable()
export class BrowserWorkerService implements OnApplicationShutdown {
  private readonly logger = new Logger(BrowserWorkerService.name);
  private browsers = new Map<string, Browser>();
  private activePages = new Map<string, Page>();

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationShutdown(signal?: string) {
    this.logger.log(`Shutting down BrowserWorkerService (signal: ${signal}). Cleaning up browsers...`);
    for (const [profileId, browser] of this.browsers.entries()) {
      try {
        await browser.close();
        await this.prisma.browserProfile.update({
          where: { id: profileId },
          data: { status: 'AVAILABLE' }
        });
      } catch (e) {
        this.logger.error(`Error closing browser ${profileId}`, e);
      }
    }
  }

  async listProfiles() {
    return this.prisma.browserProfile.findMany();
  }

  async assignProfile(employeeId: string, profileId: string): Promise<void> {
    await this.prisma.browserProfile.update({
      where: { id: profileId },
      data: { employeeId, status: 'ASSIGNED' },
    });
  }

  async releaseProfile(profileId: string): Promise<void> {
    await this.prisma.browserProfile.update({
      where: { id: profileId },
      data: { employeeId: null, status: 'AVAILABLE' },
    });
  }

  async openBrowser(profileId: string): Promise<void> {
    const profile = await this.prisma.browserProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new Error('Profile not found');

    if (this.browsers.has(profileId)) {
      return;
    }

    this.logger.log(`Launching Chrome for profile ${profileId} at ${profile.chromeProfileDirectory}`);

    const browser = await puppeteer.launch({
      headless: false,
      userDataDir: profile.chromeProfileDirectory,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.browsers.set(profileId, browser);
    
    await this.prisma.browserProfile.update({
      where: { id: profileId },
      data: { status: 'BUSY', lastUsedAt: new Date() }
    });
  }

  async openUrl(profileId: string, url: string): Promise<Page> {
    const browser = this.browsers.get(profileId);
    if (!browser) throw new Error('Browser not open');
    
    const page = await browser.newPage();
    this.activePages.set(profileId, page);
    await page.goto(url, { waitUntil: 'networkidle2' });
    return page;
  }

  async sendMessage(profileId: string, message: string): Promise<string> {
    // Basic generic implementation for demonstration.
    // In a real system, provider adapters would do this based on the specific DOM.
    const page = this.activePages.get(profileId);
    if (!page) throw new Error('No active page for this profile');
    
    // Abstract logic:
    // await page.type('textarea', message);
    // await page.keyboard.press('Enter');
    // const response = await extractResponse(page);
    return "Mock Response from Browser worker";
  }

  async releaseBrowserLock(profileId: string): Promise<void> {
    await this.prisma.browserProfile.update({
      where: { id: profileId },
      data: { status: 'ASSIGNED' }
    });
  }

  async closeBrowser(profileId: string): Promise<void> {
    const browser = this.browsers.get(profileId);
    if (browser) {
      await browser.close();
      this.browsers.delete(profileId);
      this.activePages.delete(profileId);
    }
    
    await this.prisma.browserProfile.update({
      where: { id: profileId },
      data: { status: 'ASSIGNED' } // Returns to assigned but not busy
    });
  }
}
