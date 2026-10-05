import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClientService {
  constructor(private readonly prisma: PrismaService) {}

  async createClient(companyId: string, data: { name: string; organizationName?: string; description?: string }) {
    return this.prisma.client.create({
      data: {
        companyId,
        ...data,
      },
    });
  }

  async getClient(id: string) {
    return this.prisma.client.findUnique({
      where: { id },
      include: { contacts: true, inquiries: true, opportunities: true, projects: true },
    });
  }

  async listClients(companyId: string) {
    return this.prisma.client.findMany({
      where: { companyId },
    });
  }

  async addContact(clientId: string, data: { name: string; email?: string; role?: string; phone?: string }) {
    return this.prisma.clientContact.create({
      data: {
        clientId,
        ...data,
      },
    });
  }
}

