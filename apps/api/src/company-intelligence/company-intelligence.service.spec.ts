import { Test, TestingModule } from '@nestjs/testing';
import { CompanyIntelligenceService } from './company-intelligence.service';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyStateService } from '../management/company-state.service';
import { SalesPipelineService } from '../sales/sales-pipeline.service';

describe('CompanyIntelligenceService', () => {
  let service: CompanyIntelligenceService;
  let prisma: PrismaService;
  let companyState: CompanyStateService;
  let salesPipeline: SalesPipelineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyIntelligenceService,
        {
          provide: PrismaService,
          useValue: {
            company: {
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: CompanyStateService,
          useValue: {
            collectState: jest.fn(),
          },
        },
        {
          provide: SalesPipelineService,
          useValue: {
            getPipelineMetrics: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CompanyIntelligenceService>(CompanyIntelligenceService);
    prisma = module.get<PrismaService>(PrismaService);
    companyState = module.get<CompanyStateService>(CompanyStateService);
    salesPipeline = module.get<SalesPipelineService>(SalesPipelineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateCompanyIntelligence', () => {
    it('should generate intelligence correctly and include missing data limitations', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({ id: 'comp-1' });
      (companyState.collectState as jest.Mock).mockResolvedValue({
        snapshotAt: new Date(),
        workforce: { totalEmployees: 0, departments: 0 },
        projects: { active: 0, blocked: 0 },
        finance: { acBalance: 0, totalRevenue: 0, openInvoices: 0 },
        strategicPlanning: { criticalRisks: 1 },
        kpis: { critical: 0, improving: 0, declining: 0 },
        sales: { openOpportunities: 0 }
      });
      (salesPipeline.getPipelineMetrics as jest.Mock).mockRejectedValue(new Error('No pipeline'));

      const result = await service.generateCompanyIntelligence('comp-1');

      expect(result.missingData).toContain('No workforce data available.');
      expect(result.missingData).toContain('No significant financial activity recorded.');
      expect(result.risks).toEqual([{ title: 'Critical Strategic Risks', count: 1 }]);
      expect(result.facts.length).toBeGreaterThan(0);
      expect(result.provenance.length).toBeGreaterThan(0);
      expect(result.sourceFreshness).toHaveProperty('CompanyState');
    });
  });
});
