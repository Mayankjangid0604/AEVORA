import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import type { BackgroundJob } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JobService, scopedJobKey } from '../job/job.service';
import { JobHandlerRegistry } from '../job/job-handler.registry';
import { SERVICES } from './intake';

export const INQUIRY_TRIAGE_JOB = 'INQUIRY_TRIAGE';
const SYSTEM = { actorId: 'AUTOMATION', actorType: 'SYSTEM' } as const;
const EMAIL_RE = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i;

/** Rules a new request must satisfy before automation moves it NEW -> UNDER_REVIEW. Pure, so it is unit-testable. */
export function triageRules(inq: { contactEmail: string | null; businessName: string | null; contactName: string | null; description: string; serviceRequested: string | null }) {
  const failures: string[] = [];
  if (!inq.contactEmail || !EMAIL_RE.test(inq.contactEmail)) failures.push('valid contact email');
  if (!inq.businessName || inq.businessName.trim().length < 2) failures.push('business name');
  if (!inq.contactName || inq.contactName.trim().length < 2) failures.push('contact name');
  if (!inq.serviceRequested || !(SERVICES as readonly string[]).includes(inq.serviceRequested)) failures.push('known service type');
  if ((inq.description ?? '').trim().length < 20) failures.push('description of at least 20 characters');
  if (((inq.description ?? '').match(/https?:\/\//gi) ?? []).length > 3) failures.push('at most 3 links');
  return failures;
}

/**
 * Background triage for newly received requests. It is deliberately limited to internal, reversible bookkeeping:
 * a complete request is moved to UNDER_REVIEW with an audit entry and a note; an incomplete one stays NEW with a note
 * saying what is missing. It never qualifies, converts, prices, proposes, approves, emails or messages anyone.
 *
 * Idempotent: the job key is per request, the status change is compare-and-set from NEW, so a retry or replay is a
 * no-op. Pause switch: INQUIRY_AUTOMATION_ENABLED=false (nothing is enqueued, and any job already queued is recorded
 * as skipped rather than run). Job status/attempts/lastError are visible through GET /job and /inquiries/:id/automation.
 * Limitation: the worker is an in-process 5 s poller; with several API replicas the BackgroundJob lease prevents double
 * processing, but local single-process operation is the supported mode.
 */
@Injectable()
export class InquiryAutomationService implements OnModuleInit {
  private readonly logger = new Logger(InquiryAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobService,
    @Optional() private readonly registry?: JobHandlerRegistry,
  ) {}

  onModuleInit() {
    this.registry?.register(INQUIRY_TRIAGE_JOB, (job) => this.handle(job));
  }

  isEnabled() {
    return (process.env.INQUIRY_AUTOMATION_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
  }

  /** Never throws: a queueing problem must not fail the customer's submission (the request stays NEW for manual review). */
  async enqueueSafe(companyId: string, inquiryId: string) {
    try {
      if (!this.isEnabled()) {
        await this.audit(companyId, inquiryId, 'INQUIRY_AUTOMATION_SKIPPED', { reason: 'automation disabled' });
        return null;
      }
      return await this.enqueue(companyId, inquiryId);
    } catch (e: any) {
      this.logger.error(`Could not enqueue triage for ${inquiryId}: ${e?.message}`);
      return null;
    }
  }

  enqueue(companyId: string, inquiryId: string) {
    return this.jobs.enqueue({
      type: INQUIRY_TRIAGE_JOB, companyId, payload: { companyId, inquiryId }, idempotencyKey: `inquiry-triage:${inquiryId}`, correlationId: inquiryId,
    });
  }

  /** Job state for one request (tenant-scoped). Nothing from the payload is returned. */
  async status(companyId: string, inquiryId: string) {
    const job = await this.prisma.backgroundJob.findUnique({ where: { idempotencyKey: scopedJobKey(companyId, `inquiry-triage:${inquiryId}`) } });
    if (!job || job.companyId !== companyId) return { enabled: this.isEnabled(), state: 'NOT_QUEUED' as const };
    return { enabled: this.isEnabled(), state: job.status, jobId: job.id, attempts: job.attempts, maxAttempts: job.maxAttempts, lastError: job.lastError, completedAt: job.completedAt };
  }

  /** Worker entry point. Throwing makes the worker retry with backoff and finally mark the job FAILED with lastError. */
  async handle(job: BackgroundJob) {
    const p = (job.payload ?? {}) as { companyId?: string; inquiryId?: string };
    if (!job.companyId || p.companyId !== job.companyId || typeof p.inquiryId !== 'string') throw new Error('Malformed triage job (company/inquiry mismatch)');
    const { companyId, inquiryId } = p as { companyId: string; inquiryId: string };

    if (!this.isEnabled()) {
      await this.audit(companyId, inquiryId, 'INQUIRY_AUTOMATION_SKIPPED', { reason: 'automation disabled', jobId: job.id });
      return;
    }
    const inq = await this.prisma.clientInquiry.findFirst({ where: { id: inquiryId, companyId } });
    if (!inq) throw new Error('Request not found for this company');
    if (inq.status !== 'NEW') {
      await this.audit(companyId, inquiryId, 'INQUIRY_AUTOMATION_SKIPPED', { reason: `status is ${inq.status}`, jobId: job.id });
      return;
    }

    const failures = triageRules(inq);
    if (failures.length) {
      await this.note(companyId, inquiryId, `[auto-triage] Needs manual review. Missing or invalid: ${failures.join(', ')}.`);
      await this.audit(companyId, inquiryId, 'INQUIRY_AUTO_TRIAGE_NEEDS_REVIEW', { failures, jobId: job.id });
      return;
    }
    const cas = await this.prisma.clientInquiry.updateMany({ where: { id: inquiryId, companyId, status: 'NEW' }, data: { status: 'UNDER_REVIEW' } });
    if (!cas.count) return; // someone else moved it first: nothing to do
    await this.note(companyId, inquiryId, `[auto-triage] Complete request (${inq.serviceRequested}). Moved to review. A person must qualify it; no price, proposal or message was created.`);
    await this.audit(companyId, inquiryId, 'INQUIRY_AUTO_TRIAGED', { from: 'NEW', to: 'UNDER_REVIEW', jobId: job.id, rules: 'complete-contact-service-description' }, { status: 'NEW' });
  }

  private note(companyId: string, inquiryId: string, text: string) {
    const line = `[${new Date().toISOString()} AUTOMATION] ${text}`;
    return this.prisma.$executeRaw`UPDATE "ClientInquiry" SET "internalNotes" = COALESCE("internalNotes" || E'\n', '') || ${line}, "updatedAt" = now() WHERE "id" = ${inquiryId} AND "companyId" = ${companyId}`;
  }

  private audit(companyId: string, inquiryId: string, action: string, newValue: object, oldValue?: object) {
    return this.prisma.customerAuditEvent.create({
      data: { companyId, actorId: SYSTEM.actorId, actorType: SYSTEM.actorType, action, objectType: 'ClientInquiry', objectId: inquiryId, oldValue, newValue },
    });
  }
}
