import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoleStatus } from '@prisma/client';

@Injectable()
export class RoleService {
  constructor(private prisma: PrismaService) {}

  async createRole(title: string, level: number, permissions: string[], companyId?: string, description?: string) {
    return this.prisma.role.create({
      data: {
        title,
        level,
        permissions,
        companyId,
        description,
        status: RoleStatus.ACTIVE,
      }
    });
  }

  async getRole(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async listRoles(companyId?: string) {
    // List global roles and company-specific roles
    return this.prisma.role.findMany({
      where: companyId ? { OR: [{ companyId }, { companyId: null }] } : { companyId: null }
    });
  }
}
