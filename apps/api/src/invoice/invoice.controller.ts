import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { ExecutionEnvironment } from '@prisma/client';

@Controller('invoice')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post()
  async createInvoice(@Body() body: any, @Request() req) {
    return this.invoiceService.createInvoice({
      companyId: req.user.companyId,
      clientId: body.clientId,
      projectId: body.projectId,
      environment: body.environment || ExecutionEnvironment.SIMULATION,
      currency: body.currency,
      lineItems: body.lineItems,
      taxRate: body.taxRate,
    });
  }
}
