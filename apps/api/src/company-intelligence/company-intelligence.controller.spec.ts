import { Test, TestingModule } from '@nestjs/testing';
import { CompanyIntelligenceController } from './company-intelligence.controller';
import { CompanyIntelligenceService } from './company-intelligence.service';
import { GroupIntelligenceService } from './group-intelligence.service';
import { ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Reflector } from '@nestjs/core';

describe('CompanyIntelligenceController', () => {
  let controller: CompanyIntelligenceController;
  let companyIntelligenceService: CompanyIntelligenceService;
  let groupIntelligenceService: GroupIntelligenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompanyIntelligenceController],
      providers: [
        {
          provide: CompanyIntelligenceService,
          useValue: {
            generateCompanyIntelligence: jest.fn(),
          },
        },
        {
          provide: GroupIntelligenceService,
          useValue: {
            generateGroupIntelligence: jest.fn(),
          },
        },
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<CompanyIntelligenceController>(CompanyIntelligenceController);
    companyIntelligenceService = module.get<CompanyIntelligenceService>(CompanyIntelligenceService);
    groupIntelligenceService = module.get<GroupIntelligenceService>(GroupIntelligenceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCompanyIntelligence', () => {
    it('should throw ForbiddenException if user.companyId does not match requested companyId', async () => {
      const req = { user: { companyId: 'different-company-id' } };
      await expect(controller.getCompanyIntelligence('comp-1', {}, req))
        .rejects
        .toThrow(ForbiddenException);
    });

    it('should call generateCompanyIntelligence if user is authorized', async () => {
      const req = { user: { companyId: 'comp-1' } };
      (companyIntelligenceService.generateCompanyIntelligence as jest.Mock).mockResolvedValue({ status: 'ok' });

      const result = await controller.getCompanyIntelligence('comp-1', {}, req);
      expect(companyIntelligenceService.generateCompanyIntelligence).toHaveBeenCalledWith('comp-1', {});
      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('getGroupIntelligence', () => {
    it('should call generateGroupIntelligence', async () => {
      const req = { user: { actorId: 'chairman-1' } };
      (groupIntelligenceService.generateGroupIntelligence as jest.Mock).mockResolvedValue({ status: 'ok' });

      const result = await controller.getGroupIntelligence('group-1', {}, req);
      expect(groupIntelligenceService.generateGroupIntelligence).toHaveBeenCalledWith('group-1', 'chairman-1', {});
      expect(result).toEqual({ status: 'ok' });
    });
  });
});
