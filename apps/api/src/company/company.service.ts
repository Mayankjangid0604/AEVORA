import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyStatus } from '@prisma/client';

@Injectable()
export class CompanyService {
  constructor(private prisma: PrismaService) {}

  async createCompany(name: string, legalName: string, description: string, chairmanId: string) {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name,
          legalName,
          description,
          chairmanId,
          status: CompanyStatus.ACTIVE,
        },
      });

      await tx.companyEvent.create({
        data: {
          companyId: company.id,
          type: 'COMPANY_CREATED',
          payload: { name },
        }
      });

      return company;
    });
  }

  async getCompany(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async listCompanies() {
    return this.prisma.company.findMany();
  }

  async updateCompany(id: string, updates: { name?: string; legalName?: string; description?: string }) {
    return this.prisma.company.update({
      where: { id },
      data: updates,
    });
  }

  async pauseCompany(id: string) {
    const company = await this.getCompany(id);
    if (company.status !== CompanyStatus.ACTIVE) throw new BadRequestException('Company must be ACTIVE to pause');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id },
        data: { status: CompanyStatus.PAUSED },
      });
      await tx.companyEvent.create({
        data: { companyId: id, type: 'COMPANY_PAUSED', payload: {} }
      });
      return updated;
    });
  }

  async resumeCompany(id: string) {
    const company = await this.getCompany(id);
    if (company.status !== CompanyStatus.PAUSED) throw new BadRequestException('Company must be PAUSED to resume');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id },
        data: { status: CompanyStatus.ACTIVE },
      });
      await tx.companyEvent.create({
        data: { companyId: id, type: 'COMPANY_RESUMED', payload: {} }
      });
      return updated;
    });
  }

  async closeCompany(id: string) {
    const company = await this.getCompany(id);
    if (company.status === CompanyStatus.CLOSED) throw new BadRequestException('Company is already CLOSED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id },
        data: { status: CompanyStatus.CLOSED },
      });
      await tx.companyEvent.create({
        data: { companyId: id, type: 'COMPANY_CLOSED', payload: {} }
      });
      return updated;
    });
  }
}
