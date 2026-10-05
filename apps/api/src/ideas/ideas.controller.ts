import { BadRequestException, Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { IdeasService } from './ideas.service';

/** Approving an idea forms a venture team (creates AI employees), so the whole section is Chairman-only. */
@Controller('ideas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
export class IdeasController {
  constructor(private readonly ideas: IdeasService) {}

  @Get()
  list(@Request() req) {
    return this.ideas.getIdeas(req.user.companyId);
  }

  @Get(':id')
  get(@Request() req, @Param('id') id: string) {
    return this.ideas.getIdea(req.user.companyId, id);
  }

  @Post()
  submit(@Request() req, @Body() body: { title: string; description: string }) {
    const title = body?.title?.trim();
    const description = body?.description?.trim();
    if (!title || !description) throw new BadRequestException('title and description are required');
    if (title.length > 200 || description.length > 5000) throw new BadRequestException('title max 200, description max 5000 characters');
    return this.ideas.submitIdea(req.user.companyId, title, description, 'CHAIRMAN');
  }

  @Post('generate/ceo')
  async generate(@Request() req) {
    const idea = await this.ideas.generateCeoIdea(req.user.companyId);
    return idea ?? { message: 'CEO already generated an idea this week, or generation failed' };
  }

  @Post(':id/answer')
  answer(@Request() req, @Param('id') id: string, @Body() body: { answer: string }) {
    const answer = body?.answer?.trim();
    if (!answer) throw new BadRequestException('answer is required');
    if (answer.length > 2000) throw new BadRequestException('answer too long (max 2000 characters)');
    return this.ideas.answerQuestion(req.user.companyId, id, answer);
  }

  @Post(':id/approve')
  approve(@Request() req, @Param('id') id: string) {
    return this.ideas.approveIdea(req.user.companyId, id);
  }

  @Post(':id/reject')
  reject(@Request() req, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.ideas.rejectIdea(req.user.companyId, id, body?.reason?.trim() || 'Rejected by Chairman');
  }
}
