import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { OfficeScreensService } from './office-screens.service';
import { EmployeeChatService } from './employee-chat.service';
import { CafeteriaService } from './cafeteria.service';
import { RoomScreensService } from './room-screens.service';

/** Read-only data for the 3D office's room screens (one call per room). */
@Controller('office/screens')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
export class OfficeScreensController {
  constructor(private readonly screens: OfficeScreensService, private readonly cafeteria: CafeteriaService, private readonly rooms: RoomScreensService) {}

  @Get('research')
  research(@Request() req) { return this.screens.research(req.user.companyId); }

  @Get('engineering')
  engineering(@Request() req) { return this.screens.engineering(req.user.companyId); }

  @Get('reception')
  reception(@Request() req) { return this.screens.reception(req.user.companyId); }

  /** Menu, prices in AC, and today's cafeteria sales (Chairman view). */
  @Get('cafeteria')
  cafe(@Request() req) { return this.cafeteria.today(req.user.companyId); }

  @Get('support')
  support(@Request() req) { return this.rooms.support(req.user.companyId); }

  @Get('finance')
  finance(@Request() req) { return this.rooms.finance(req.user.companyId); }

  @Get('legal')
  legal(@Request() req) { return this.rooms.legal(req.user.companyId); }

  @Get('ceo')
  ceo(@Request() req) { return this.rooms.ceo(req.user.companyId); }

  @Get('marketing')
  marketing(@Request() req) { return this.rooms.marketing(req.user.companyId); }

  @Get('knowledge-graph')
  graph(@Request() req) { return this.rooms.knowledgeGraph(req.user.companyId); }

  @Get('sales')
  sales(@Request() req) { return this.screens.sales(req.user.companyId); }

  /** Chairman sets the month's sales target (integer paise). */
  @Put('sales/target')
  setTarget(@Request() req, @Body() body: { month: string; amountPaise: number }) {
    return this.screens.setSalesTarget(req.user.companyId, req.user.actorId, body?.month, body?.amountPaise);
  }
}

/** The Chairman talks to an employee in the 3D office (rate-limited, local model). */
@Controller('office/employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
export class OfficeEmployeesController {
  constructor(private readonly chat: EmployeeChatService) {}

  @Post(':id/chat')
  talk(@Request() req, @Param('id') id: string, @Body() body: { text?: string }) {
    return this.chat.reply(req.user.companyId, id, body?.text ?? '');
  }
}

/** Chairman-maintained records behind the Support and Legal screens (no automatic source exists yet). */
@Controller('office')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
export class OfficeRecordsController {
  constructor(private readonly rooms: RoomScreensService) {}

  @Post('feedback')
  addFeedback(@Request() req, @Body() body: any) { return this.rooms.addFeedback(req.user.companyId, body); }

  @Post('feedback/:id/resolve')
  resolve(@Request() req, @Param('id') id: string) { return this.rooms.resolveFeedback(req.user.companyId, id); }

  @Post('compliance')
  addFiling(@Request() req, @Body() body: any) { return this.rooms.addFiling(req.user.companyId, body); }

  @Post('compliance/:id/filed')
  filed(@Request() req, @Param('id') id: string) { return this.rooms.markFiled(req.user.companyId, id); }

  @Delete('compliance/:id')
  remove(@Request() req, @Param('id') id: string) { return this.rooms.deleteFiling(req.user.companyId, id); }
}
