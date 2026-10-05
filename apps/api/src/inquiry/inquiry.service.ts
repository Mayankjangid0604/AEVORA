import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskPriority, InquiryStatus } from '@prisma/client';

@Injectable()
export class InquiryService {
  constructor(private readonly prisma: PrismaService) {}

  async createInquiry(companyId: string, clientId: string | null, data: { title: string; description: string; requirements?: string; budget?: number; deadline?: Date; priority?: TaskPriority }) {
    return this.prisma.clientInquiry.create({
      data: {
        companyId,
        clientId,
        ...data,
      },
    });
  }

  async getInquiry(id: string) {
    return this.prisma.clientInquiry.findUnique({
      where: { id },
      include: { client: true },
    });
  }

  async listInquiries(companyId: string) {
    return this.prisma.clientInquiry.findMany({
      where: { companyId },
    });
  }

  async updateInquiryStatus(id: string, status: InquiryStatus) {
    return this.prisma.clientInquiry.update({
      where: { id },
      data: { status },
    });
  }

  async updateInquirySummary(id: string, requirements: string) {
    return this.prisma.clientInquiry.update({
      where: { id },
      data: { requirements },
    });
  }
}

