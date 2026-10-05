import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEnvironment, InvoiceStatus } from '@prisma/client';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import { StructuredLoggerService } from '../logger/structured-logger.service';

export interface CreateInvoiceOptions {
  companyId: string;
  clientId: string;
  projectId?: string;
  environment?: ExecutionEnvironment;
  currency?: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
  taxRate?: number;
  approvalId?: string;
}

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalValidation: ApprovalValidationService,
    private readonly logger: StructuredLoggerService
  ) {}

  async createInvoice(options: CreateInvoiceOptions) {
    const environment = options.environment || ExecutionEnvironment.SIMULATION;
    const taxRate = options.taxRate || 0;
    
    // Cross-tenant isolation checks (C2)
    const client = await this.prisma.client.findUnique({
      where: { id: options.clientId }
    });
    
    if (!client) {
      throw new Error('Client not found');
    }
    
    if (client.companyId !== options.companyId) {
      throw new Error('UNAUTHORIZED: Client belongs to a different company');
    }
    
    if (options.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: options.projectId }
      });
      
      if (!project) {
        throw new Error('Project not found');
      }
      
      if (project.companyId !== options.companyId) {
        throw new Error('UNAUTHORIZED: Project belongs to a different company');
      }
    }
    
    let subtotal = 0;
    const itemsData = options.lineItems.map(item => {
      const total = item.quantity * item.unitPrice;
      subtotal += total;
      return {
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total,
      };
    });

    const taxAmount = Math.round(subtotal * taxRate);
    const total = subtotal + taxAmount;
    
    // Require approval for production operations
    if (environment === ExecutionEnvironment.PRODUCTION && !options.approvalId) {
      throw new Error('UNAUTHORIZED: Production invoices require an approvalId');
    }

    if (options.approvalId && options.companyId) {
      // Validate and consume the approval BEFORE creating the record
      await this.approvalValidation.validateAndConsumeApproval(options.approvalId, {
        companyId: options.companyId,
        action: 'CREATE_INVOICE', // must match the action requested in tests
        targetType: 'CLIENT',
        targetId: options.clientId,
        environment,
        params: {
          clientId: options.clientId,
          projectId: options.projectId,
          currency: options.currency || 'INR',
          subtotal,
          taxAmount,
          total,
          lineItems: itemsData
        },
      });
    }

    const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const invoice = await this.prisma.invoice.create({
      data: {
        companyId: options.companyId,
        clientId: options.clientId,
        projectId: options.projectId,
        environment,
        invoiceNumber,
        currency: options.currency || 'INR',
        subtotal,
        taxAmount,
        total,
        status: InvoiceStatus.DRAFT,
        approvalId: options.approvalId,
        lineItems: {
          create: itemsData
        }
      },
      include: {
        lineItems: true
      }
    });

    this.logger.log(
      `Created invoice ${invoice.invoiceNumber} in ${environment} for total ${total}`,
      InvoiceService.name,
      { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, companyId: options.companyId, approvalId: options.approvalId }
    );
    return invoice;
  }

  async markAsIssued(invoiceId: string, companyId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId }
    });
    
    if (!invoice) throw new Error('Invoice not found');
    
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { 
        status: InvoiceStatus.ISSUED,
        issueDate: new Date()
      }
    });
  }

  async requestFinalPayment(projectId: string, companyId: string, amount: number) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
      include: { client: true }
    });
    
    if (!project) throw new Error('Project not found');
    if (project.status !== 'ACCEPTED') throw new Error('Project must be ACCEPTED to request final payment');

    // Prevent duplicates
    const existing = await this.prisma.invoice.findFirst({
      where: { projectId, companyId, notes: 'FINAL_PAYMENT' }
    });
    if (existing) return existing;

    const invoice = await this.createInvoice({
      companyId,
      clientId: project.clientId,
      projectId,
      environment: ExecutionEnvironment.SANDBOX,
      currency: 'INR',
      lineItems: [
        { description: 'Final Payment for Project Completion', quantity: 1, unitPrice: amount }
      ]
    });

    const finalInvoice = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { notes: 'FINAL_PAYMENT' }
    });

    return finalInvoice;
  }
}
