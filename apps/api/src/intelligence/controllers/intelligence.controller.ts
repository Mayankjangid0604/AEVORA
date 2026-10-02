import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('intelligence')
export class IntelligenceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('sessions/:id')
  async getSession(@Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.intelligenceSession.findUnique({
      where: { id },
      include: {
        assessments: { include: { evidence: true } },
        plans: { include: { steps: true } },
        proposals: { include: { options: true, reviews: true } },
      },
    });
  }

  @Get('company/:companyId/proposals')
  async getCompanyProposals(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.prisma.decisionProposal.findMany({
      where: { companyId },
      include: { options: true, reviews: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('company/:companyId/assistance-requests')
  async getAssistanceRequests(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.prisma.assistanceRequest.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
