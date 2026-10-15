import { Test, TestingModule } from '@nestjs/testing';
import { LeadGenService } from './lead-gen.service';
import { LeadSearchService } from './lead-search.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../devices/realtime.gateway';
import { N8nClientService } from '../automation/n8n-client.service';

describe('LeadGenService — Automation #1 Primary Lead Source Integration', () => {
  let service: LeadGenService;
  let prismaMock: any;
  let searchMock: any;
  let realtimeMock: any;
  let n8nMock: any;

  beforeEach(async () => {
    prismaMock = {
      killSwitchConfig: { findMany: jest.fn().mockResolvedValue([]) },
      leadGenRun: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'run-101', companyId: 'comp-101' }),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'run-101', ...data })),
      },
      company: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'comp-101', chairmanId: 'chair-1' }),
      },
      leadGenConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      salesLead: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'lead-1', name: 'Test Lead', qualityScore: 80 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      leadGenAudit: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      simulationEvent: {
        create: jest.fn().mockResolvedValue({ id: 'sim-1' }),
      },
    };

    searchMock = {
      source: 'google',
      search: jest.fn(),
    };

    realtimeMock = {
      broadcastToUser: jest.fn(),
    };

    n8nMock = {
      isConfigured: jest.fn().mockReturnValue(true),
      executeWorkflow: jest.fn().mockResolvedValue({
        executed: true,
        automationId: 'automation-1-google-lead-finding',
        result: {
          success: true,
          companyId: 'comp-101',
          created: 2,
          duplicates: 1,
          count: 3,
          leads: [
            { id: 'lead-101', name: 'Downtown Dental', qualityScore: 85 },
            { id: 'lead-102', name: 'Metro Clinic', qualityScore: 75 },
          ],
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadGenService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: LeadSearchService, useValue: searchMock },
        { provide: RealtimeGateway, useValue: realtimeMock },
        { provide: N8nClientService, useValue: n8nMock },
      ],
    }).compile();

    service = module.get<LeadGenService>(LeadGenService);
  });

  it('routes Google Maps lead finding to Automation #1 via n8nClient', async () => {
    const res = await service.runForCompany('comp-101', 'MANUAL', 'operator-1');

    expect(res.status).toBe('COMPLETED');
    expect(res.totalFound).toBeGreaterThanOrEqual(3);
    expect(res.totalNew).toBeGreaterThanOrEqual(2);
    expect(n8nMock.executeWorkflow).toHaveBeenCalledWith(
      'automation-1-google-lead-finding',
      expect.objectContaining({
        category: expect.any(String),
        location: expect.any(String),
        companyId: 'comp-101',
      })
    );
    expect(searchMock.search).not.toHaveBeenCalled();
    expect(realtimeMock.broadcastToUser).toHaveBeenCalledWith(
      'chair-1',
      'lead.found',
      expect.objectContaining({ leadId: 'lead-101', businessName: 'Downtown Dental' })
    );
  });

  it('fails safely when Google provider is chosen but n8n is not configured', async () => {
    n8nMock.isConfigured.mockReturnValue(false);

    await expect(
      service.runForCompany('comp-101', 'MANUAL')
    ).rejects.toThrow(/Google Maps lead finding requires Automation #1 \(n8n\)/);
  });

  it('preserves non-Google provider fallback (e.g. OSM) without calling n8n', async () => {
    Object.defineProperty(searchMock, 'source', { value: 'osm', configurable: true });
    searchMock.search.mockResolvedValue([
      {
        googlePlaceId: 'osm-node-999',
        businessName: 'OSM Bakery',
        category: 'restaurant',
        location: 'Jaipur, India',
        qualityScore: 60,
      },
    ]);

    const res = await service.runForCompany('comp-101', 'MANUAL');
    expect(res.status).toBe('COMPLETED');
    expect(searchMock.search).toHaveBeenCalled();
    expect(n8nMock.executeWorkflow).not.toHaveBeenCalled();
  });
});
