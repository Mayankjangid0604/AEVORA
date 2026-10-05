import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyStatus } from '@prisma/client';

@Injectable()
export class CompanyService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async createCompany(name: string, legalName: string, description: string, chairmanId: string, groupId?: string) {
    const res = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name,
          legalName,
          description,
          chairmanId,
          groupId,
          status: CompanyStatus.ACTIVE,
          departments: {
            create: [{ name: 'Executive' }]
          }
        },
        include: { departments: true }
      });

      const executiveDept = company.departments.find(d => d.name === 'Executive');
      if (executiveDept) {
        await tx.employee.create({
          data: {
            name: 'CEO',
            identitySeed: `${company.id}-ceo-seed`,
            status: 'ACTIVE',
            company: { connect: { id: company.id } },
            department: { connect: { id: executiveDept.id } },
            role: {
              create: {
                title: 'CEO',
                level: 1,
                accessLevel: 'MANAGEMENT',
                company: { connect: { id: company.id } },
              }
            }
          }
        });
      }

      await tx.companyEvent.create({
        data: {
          companyId: company.id,
          type: 'COMPANY_CREATED',
          payload: { name },
        }
      });

      return company;
    });
    return res;
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
    const res = await this.prisma.company.update({
      where: { id },
      data: updates,
    });
    return res;
  }

  async pauseCompany(id: string) {
    const company = await this.getCompany(id);
    if (company.status !== CompanyStatus.ACTIVE) throw new BadRequestException('Company must be ACTIVE to pause');

    const res = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id },
        data: { status: CompanyStatus.PAUSED },
      });
      await tx.companyEvent.create({
        data: { companyId: id, type: 'COMPANY_PAUSED', payload: {} }
      });
      return updated;
    });
    return res;
  }

  async resumeCompany(id: string) {
    const company = await this.getCompany(id);
    if (company.status !== CompanyStatus.PAUSED) throw new BadRequestException('Company must be PAUSED to resume');

    const res = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id },
        data: { status: CompanyStatus.ACTIVE },
      });
      await tx.companyEvent.create({
        data: { companyId: id, type: 'COMPANY_RESUMED', payload: {} }
      });
      return updated;
    });
    return res;
  }

  async closeCompany(id: string) {
    const company = await this.getCompany(id);
    if (company.status === CompanyStatus.CLOSED) throw new BadRequestException('Company is already CLOSED');

    const res = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id },
        data: { status: CompanyStatus.CLOSED },
      });
      await tx.companyEvent.create({
        data: { companyId: id, type: 'COMPANY_CLOSED', payload: {} }
      });
      return updated;
    });
    return res;
  }
}
