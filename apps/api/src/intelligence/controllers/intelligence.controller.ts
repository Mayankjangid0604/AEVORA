import { Controller, Get, Param, ParseUUIDPipe, UseGuards, Request, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../authorization/jwt-auth.guard';

@Controller('intelligence')
@UseGuards(JwtAuthGuard)
export class IntelligenceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('sessions/:id')
  async getSession(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    // Bound to the caller's company (V14 closure); another tenant's session is indistinguishable from a missing one.
    const session = await this.prisma.intelligenceSession.findFirst({
      where: { id, companyId: req.user.companyId ?? '__none__' },
      include: {
        assessments: { include: { evidence: true } },
        plans: { include: { steps: true } },
        proposals: { include: { options: true, reviews: true } },
      },
    });
    if (!session) throw new NotFoundException('Intelligence session not found');
    return session;
  }

  @Get('company/:companyId/proposals')
  async getCompanyProposals(@Param('companyId', ParseUUIDPipe) companyId: string, @Request() req) {
    if (req.user.companyId !== companyId) throw new ForbiddenException();
    return this.prisma.decisionProposal.findMany({
      where: { companyId },
      include: { options: true, reviews: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('company/:companyId/assistance-requests')
  async getAssistanceRequests(@Param('companyId', ParseUUIDPipe) companyId: string, @Request() req) {
    if (req.user.companyId !== companyId) throw new ForbiddenException();
    return this.prisma.assistanceRequest.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
