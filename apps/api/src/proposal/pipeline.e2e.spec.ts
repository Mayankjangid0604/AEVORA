/**
 * Inquiry -> triage -> client/opportunity -> proposal -> approval -> project -> tasks -> completion, through the REAL HTTP
 * stack (real JwtAuthGuard, RolesGuard, controllers, services, job worker, Postgres). Disposable Postgres :5444 ONLY.
 * Run via scripts/verify-disposable-db.sh (matches "e2e.spec"). Synthetic data; nothing is sent or published.
 */
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { InquiryController, PublicIntakeController } from '../inquiry/inquiry.controller';
import { InquiryService } from '../inquiry/inquiry.service';
import { InquiryAutomationService, INQUIRY_TRIAGE_JOB } from '../inquiry/inquiry-automation.service';
import { JobService } from '../job/job.service';
import { JobHandlerRegistry } from '../job/job-handler.registry';
import { JobWorkerService } from '../job/job-worker.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import { StructuredLoggerService } from '../logger/structured-logger.service';
import { OpportunityController } from '../opportunity/opportunity.controller';
import { ProposalController } from './proposal.controller';
import { ProposalFlowService } from './proposal-flow.service';
import { ProjectController } from '../project/project.controller';
import { ProjectFlowService } from '../project/project-flow.service';

const run = process.env.E2E_DB === '1' && /:(5444)\//.test(process.env.DATABASE_URL ?? '') ? describe : describe.skip;

run('Pipeline: inquiry → triage → client/opportunity → proposal → project → delivery (real HTTP + disposable DB)', () => {
  jest.setTimeout(180_000);
  const netFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('NETWORK CALL ATTEMPTED'); });
  const prisma = new PrismaService();
  const SECRET = 'pipeline-e2e-secret';
  const tag = `pipe-${Date.now()}`;
  let app: any; let jwt: JwtService; let A: string; let B: string; let chairmanId: string; let employeeA: string; let employeeB: string;
  let worker: JobWorkerService; let automation: InquiryAutomationService; let jobs: JobService;
  let inquiryId: string; let ref: string; let opportunityId: string; let clientId: string; let proposalId: string; let projectId: string; let taskId: string;
  const roleIds: string[] = [];
  const http = () => request(app.getHttpServer());
  const as = (p: any, company?: string) => ({ Authorization: `Bearer ${jwt.sign(p)}`, ...(company ? { 'x-company-id': company } : {}) });
  const chair = () => as({ actorId: chairmanId, actorRole: 'CHAIRMAN' }, A);
  const mgrA = () => as({ actorId: 'pipe-mgr-A', actorRole: 'MANAGEMENT', companyId: A });
  const empA = () => as({ actorId: 'pipe-emp-A', actorRole: 'EMPLOYEE', companyId: A });
  const mgrB = () => as({ actorId: 'pipe-mgr-B', actorRole: 'MANAGEMENT', companyId: B });
  const body = (n: string) => ({ businessName: `Sim Pipeline ${n}`, contactName: `Sim Owner ${n}`, email: 'sim.owner@pipeline.test', phone: '+91 90000 00001', service: 'WEBSITE', description: `We need a simple website for our ${n} business with a contact page. ${tag}` });
  const pollUntil = async (fn: () => Promise<boolean>, tries = 12) => { for (let i = 0; i < tries; i++) { await (worker as any).poll(); if (await fn()) return true; } return false; };

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;
    delete process.env.INQUIRY_AUTOMATION_ENABLED;
    const chairman = await prisma.chairman.findFirstOrThrow();
    chairmanId = chairman.id;
    [A, B] = await Promise.all(['A', 'B'].map(async (l) => (await prisma.company.create({ data: { name: `${tag}-${l}`, chairmanId } })).id));
    process.env.PUBLIC_INTAKE_COMPANY_ID = A;
    const mk = async (companyId: string, name: string) => {
      const dept = await prisma.department.create({ data: { name: `${tag} Delivery`, companyId } });
      const role = await prisma.role.create({ data: { title: `${tag} ${name}` } as any }); roleIds.push(role.id);
      return (await prisma.employee.create({ data: { name, identitySeed: `${tag}-${name}`, companyId, departmentId: dept.id, roleId: role.id, status: 'ACTIVE' } as any })).id;
    };
    employeeA = await mk(A, 'Dev A'); employeeB = await mk(B, 'Dev B');
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '5m' } })],
      controllers: [PublicIntakeController, InquiryController, OpportunityController, ProposalController, ProjectController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard }, RolesGuard, { provide: PrismaService, useValue: prisma },
        { provide: ApprovalValidationService, useValue: {} }, { provide: StructuredLoggerService, useValue: { log() {}, warn() {}, error() {} } },
        JobService, JobHandlerRegistry, InquiryAutomationService, InquiryService, ProposalFlowService, ProjectFlowService,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init(); // runs InquiryAutomationService.onModuleInit -> registers the handler
    jwt = moduleRef.get(JwtService);
    automation = moduleRef.get(InquiryAutomationService);
    jobs = moduleRef.get(JobService);
    worker = new JobWorkerService(prisma, undefined, 'pipeline-e2e-worker', moduleRef.get(JobHandlerRegistry));
  });

  afterAll(async () => {
    await app?.close();
    for (const companyId of [A, B].filter(Boolean)) {
      await prisma.customerAuditEvent.deleteMany({ where: { companyId } });
      await prisma.task.deleteMany({ where: { companyId } });
      await prisma.project.deleteMany({ where: { companyId } });
      await prisma.proposalApproval.deleteMany({ where: { proposal: { opportunity: { companyId } } } });
      await prisma.proposal.deleteMany({ where: { opportunity: { companyId } } });
      await prisma.opportunity.deleteMany({ where: { companyId } });
      await prisma.clientInquiry.deleteMany({ where: { companyId } });
      await prisma.clientContact.deleteMany({ where: { client: { companyId } } });
      await prisma.client.deleteMany({ where: { companyId } });
      await prisma.backgroundJob.deleteMany({ where: { companyId } });
      await prisma.managementAuditEvent.deleteMany({ where: { companyId } });
      await prisma.employee.deleteMany({ where: { companyId } });
      await prisma.department.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } }).catch((e) => console.warn(`left behind: ${e.message}`));
    }
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } }).catch(() => undefined);
    await prisma.$disconnect();
    expect(netFetch).not.toHaveBeenCalled();
  });

  // ---------------- intake + automation ----------------

  it('submission is stored, a traceable triage job is queued, and a duplicate submit creates nothing new', async () => {
    const r = await http().post('/public/requests').send(body('Hostel')).expect(201);
    ref = r.body.reference;
    const row = await prisma.clientInquiry.findFirstOrThrow({ where: { companyId: A, publicRef: ref } });
    inquiryId = row.id;
    expect(row.status).toBe('NEW');
    const st = await http().get(`/inquiries/${inquiryId}/automation`).set(chair()).expect(200);
    expect(st.body).toMatchObject({ enabled: true, state: 'QUEUED', attempts: 0 });
    const dup = await http().post('/public/requests').send(body('Hostel')).expect(201);
    expect(dup.body.reference).toBe(ref);
    expect(await prisma.clientInquiry.count({ where: { companyId: A } })).toBe(1);
    expect(await prisma.backgroundJob.count({ where: { companyId: A, type: INQUIRY_TRIAGE_JOB } })).toBe(1);
    expect((await http().get(`/inquiries/${inquiryId}/automation`).set(mgrB()).expect(404)).body.message).toMatch(/not found/i);
  });

  it('the worker runs the triage: complete request → UNDER_REVIEW, audited as SYSTEM, nothing commercial or external created', async () => {
    expect(await pollUntil(async () => (await prisma.backgroundJob.findFirstOrThrow({ where: { companyId: A, type: INQUIRY_TRIAGE_JOB } })).status === 'COMPLETED')).toBe(true);
    const row = await prisma.clientInquiry.findFirstOrThrow({ where: { id: inquiryId } });
    expect(row.status).toBe('UNDER_REVIEW');
    expect(row.internalNotes).toContain('[auto-triage]');
    const ev = await prisma.customerAuditEvent.findMany({ where: { companyId: A, objectId: inquiryId, action: 'INQUIRY_AUTO_TRIAGED' } });
    expect(ev).toHaveLength(1);
    expect(ev[0].actorType).toBe('SYSTEM');
    expect(await prisma.client.count({ where: { companyId: A } })).toBe(0);
    expect(await prisma.opportunity.count({ where: { companyId: A } })).toBe(0);
    const st = await http().get(`/inquiries/${inquiryId}/automation`).set(chair()).expect(200);
    expect(st.body).toMatchObject({ state: 'COMPLETED', attempts: 1, lastError: null });
  });

  it('re-running the same job is a no-op (idempotent retry)', async () => {
    const job = await prisma.backgroundJob.findFirstOrThrow({ where: { companyId: A, type: INQUIRY_TRIAGE_JOB } });
    await automation.handle(job); await automation.handle(job);
    expect(await prisma.customerAuditEvent.count({ where: { companyId: A, objectId: inquiryId, action: 'INQUIRY_AUTO_TRIAGED' } })).toBe(1);
    expect((await prisma.clientInquiry.findFirstOrThrow({ where: { id: inquiryId } })).status).toBe('UNDER_REVIEW');
    // an operator "retry" on a COMPLETED job must not create a second job
    await http().post(`/inquiries/${inquiryId}/automation/retry`).set(chair()).expect(201);
    expect(await prisma.backgroundJob.count({ where: { companyId: A, type: INQUIRY_TRIAGE_JOB } })).toBe(1);
  });

  it('pause switch: with INQUIRY_AUTOMATION_ENABLED=false nothing is queued and the request stays NEW', async () => {
    process.env.INQUIRY_AUTOMATION_ENABLED = 'false';
    try {
      const r = await http().post('/public/requests').send(body('Paused')).expect(201);
      const row = await prisma.clientInquiry.findFirstOrThrow({ where: { companyId: A, publicRef: r.body.reference } });
      expect(row.status).toBe('NEW');
      expect(await prisma.backgroundJob.count({ where: { companyId: A, type: INQUIRY_TRIAGE_JOB } })).toBe(1); // still only the first one
      expect(await prisma.customerAuditEvent.count({ where: { companyId: A, objectId: row.id, action: 'INQUIRY_AUTOMATION_SKIPPED' } })).toBe(1);
      expect((await http().get(`/inquiries/${row.id}/automation`).set(chair())).body).toMatchObject({ enabled: false, state: 'NOT_QUEUED' });
    } finally { delete process.env.INQUIRY_AUTOMATION_ENABLED; }
  });

  it('an incomplete request is left NEW with a note of what is missing; a job for a missing request fails visibly and is retried', async () => {
    const bad = await prisma.clientInquiry.create({ data: { companyId: A, title: 'Walk-in', description: 'too short', source: 'RECEPTIONIST', status: 'NEW' } });
    const j = await automation.enqueue(A, bad.id);
    await automation.handle(j);
    const after = await prisma.clientInquiry.findFirstOrThrow({ where: { id: bad.id } });
    expect(after.status).toBe('NEW');
    expect(after.internalNotes).toMatch(/Needs manual review.*description/);

    const ghost = await automation.enqueue(A, '00000000-0000-4000-8000-000000000000');
    expect(await pollUntil(async () => (await prisma.backgroundJob.findUniqueOrThrow({ where: { id: ghost.id } })).attempts >= 1)).toBe(true);
    const failed = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: ghost.id } });
    expect(failed.lastError).toMatch(/not found/i);
    expect(failed.status).toBe('QUEUED'); // will retry with backoff; becomes FAILED after maxAttempts
    expect(failed.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    const s = await automation.status(A, '00000000-0000-4000-8000-000000000000');
    expect(s).toMatchObject({ state: 'QUEUED', attempts: 1 });
    await prisma.backgroundJob.delete({ where: { id: ghost.id } });
    await prisma.clientInquiry.delete({ where: { id: bad.id } });
  });

  // ---------------- qualification + conversion ----------------

  it('qualification and conversion create one client and one opportunity; repeating changes nothing', async () => {
    await http().post(`/inquiries/${inquiryId}/transition`).set(mgrA()).send({ from: 'UNDER_REVIEW', to: 'QUALIFIED' }).expect(201);
    const c = await http().post(`/inquiries/${inquiryId}/transition`).set(mgrA()).send({ from: 'QUALIFIED', to: 'CONVERTED' }).expect(201);
    opportunityId = c.body.opportunityId; clientId = c.body.clientId;
    await http().post(`/inquiries/${inquiryId}/transition`).set(mgrA()).send({ from: 'QUALIFIED', to: 'CONVERTED' }).expect(409); // compare-and-set: already converted
    await http().post(`/inquiries/${inquiryId}/transition`).set(mgrA()).send({ from: 'CONVERTED', to: 'CONVERTED' }).expect(400);
    expect(await prisma.client.count({ where: { companyId: A } })).toBe(1);
    expect(await prisma.opportunity.count({ where: { companyId: A } })).toBe(1);
  });

  // ---------------- proposals ----------------

  it('opportunity list is tenant-scoped and readable by staff', async () => {
    const list = await http().get('/opportunity').set(empA()).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: opportunityId, client: { id: clientId }, inquiry: { publicRef: ref } });
    expect((await http().get('/opportunity').set(mgrB()).expect(200)).body).toHaveLength(0);
    await http().get(`/opportunity/${opportunityId}`).set(mgrB()).expect(404);
  });

  it('generating a proposal needs management, is a placeholder draft, and repeated or concurrent requests return the same one', async () => {
    await http().post(`/opportunity/${opportunityId}/proposals`).set(empA()).send({}).expect(403);
    await http().post(`/opportunity/${opportunityId}/proposals`).set(mgrB()).send({}).expect(404);
    const [first, ...rest] = await Promise.all(Array.from({ length: 5 }, () => http().post(`/opportunity/${opportunityId}/proposals`).set(mgrA()).send({})));
    expect(first.status).toBe(201);
    proposalId = first.body.proposal.id;
    for (const r of rest) expect(r.body.proposal.id).toBe(proposalId);
    expect(await prisma.proposal.count({ where: { opportunityId } })).toBe(1);
    const p = first.body.proposal;
    expect(p).toMatchObject({ status: 'DRAFT', version: 1, customerId: clientId, unitPrice: 0, total: 0 });
    expect(p.customer.name).toBe('Sim Pipeline Hostel');
    expect(p.scope).toContain('simple website');          // customer requirement carried over
    expect(p.deliverables).toContain('DRAFT PLACEHOLDER'); // never invented
    expect(p.paymentTerms).toBeNull();
    expect((await http().post(`/opportunity/${opportunityId}/proposals`).set(mgrA()).send({})).body.created).toBe(false);
  });

  it('an incomplete draft cannot be submitted; editing validates input and recomputes the total', async () => {
    const r = await http().post(`/proposal/${proposalId}/submit`).set(mgrA()).expect(400);
    expect(r.body.message).toMatch(/deliverables.*price.*timeline.*payment terms/);
    await http().post(`/proposal/${proposalId}/update`).set(mgrA()).send({ unitPrice: '-5' }).expect(400);
    await http().post(`/proposal/${proposalId}/update`).set(mgrA()).send({ unitPrice: 'abc' }).expect(400);
    await http().post(`/proposal/${proposalId}/update`).set(mgrA()).send({ currency: 'XXX' }).expect(400);
    await http().post(`/proposal/${proposalId}/update`).set(mgrA()).send({ discount: '999999', unitPrice: '100' }).expect(400);
    await http().post(`/proposal/${proposalId}/update`).set(mgrA()).send({}).expect(400);
    await http().post(`/proposal/${proposalId}/update`).set(empA()).send({ title: 'x' }).expect(403);
    await http().post(`/proposal/${proposalId}/update`).set(mgrB()).send({ title: 'x' }).expect(404);
    const u = await http().post(`/proposal/${proposalId}/update`).set(mgrA()).send({
      deliverables: 'A 5-page website and a contact form.', unitPrice: '40000', quantity: '1', tax: '7200', discount: '2000',
      estimatedTimeline: '21', paymentTerms: '50% in advance, 50% on delivery', currency: 'inr',
    }).expect(201);
    expect(u.body).toMatchObject({ total: 45200, proposedPrice: 45200, currency: 'INR', estimatedTimeline: 21, status: 'DRAFT' });
    expect(u.body.lineItems[0]).toMatchObject({ quantity: 1, unitPrice: 40000 });
  });

  it('approval rules: submit, only the Chairman decides, changes requested returns to draft, approval is idempotent', async () => {
    await http().post(`/proposal/${proposalId}/submit`).set(mgrA()).expect(201);
    await http().post(`/proposal/${proposalId}/update`).set(mgrA()).send({ title: 'x' }).expect(409); // locked once submitted
    await http().post(`/proposal/${proposalId}/decision`).set(mgrA()).send({ decision: 'APPROVE' }).expect(403);
    await http().post(`/proposal/${proposalId}/decision`).set(chair()).send({ decision: 'REQUEST_CHANGES' }).expect(400); // reason required
    await http().post(`/proposal/${proposalId}/mark-sent`).set(mgrA()).expect(403); // not approved yet
    await http().post(`/proposal/${proposalId}/decision`).set(chair()).send({ decision: 'REQUEST_CHANGES', reason: 'Add hosting scope' }).expect(201);
    expect((await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } })).status).toBe('DRAFT');
    await http().post(`/proposal/${proposalId}/update`).set(mgrA()).send({ assumptions: 'Hosting is billed separately.' }).expect(201);
    await http().post(`/proposal/${proposalId}/submit`).set(mgrA()).expect(201);
    await http().post(`/proposal/${proposalId}/mark-sent`).set(mgrA()).expect(403); // last decision was REQUEST_CHANGES, not APPROVE
    await http().post(`/proposal/${proposalId}/decision`).set(chair()).send({ decision: 'APPROVE' }).expect(201);
    await http().post(`/proposal/${proposalId}/decision`).set(chair()).send({ decision: 'APPROVE' }).expect(201);
    const approvals = await prisma.proposalApproval.findMany({ where: { proposalId }, orderBy: { timestamp: 'asc' } });
    expect(approvals.map((a) => a.decision)).toEqual(['REQUEST_CHANGES', 'APPROVE']);
    expect(approvals[1].actorId).toBe(chairmanId);
  });

  it('send and customer response are recorded by people (nothing is emailed); a project cannot start before acceptance', async () => {
    await http().post(`/proposal/${proposalId}/project`).set(mgrA()).expect(409); // approved but not sent/accepted
    await http().post(`/proposal/${proposalId}/customer-response`).set(mgrA()).send({ response: 'ACCEPTED' }).expect(409); // not sent
    await http().post(`/proposal/${proposalId}/mark-sent`).set(mgrA()).expect(201);
    await http().post(`/proposal/${proposalId}/mark-sent`).set(mgrA()).expect(201); // idempotent
    await http().post(`/proposal/${proposalId}/project`).set(mgrA()).expect(409); // sent, customer has not accepted
    await http().post(`/proposal/${proposalId}/customer-response`).set(mgrA()).send({ response: 'MAYBE' }).expect(400);
    await http().post(`/proposal/${proposalId}/customer-response`).set(mgrA()).send({ response: 'ACCEPTED' }).expect(201);
    await http().post(`/proposal/${proposalId}/customer-response`).set(mgrA()).send({ response: 'ACCEPTED' }).expect(201); // idempotent
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } })).status).toBe('APPROVED');
    const got = await http().get(`/proposal/${proposalId}`).set(empA()).expect(200);
    expect(got.body.approvals).toHaveLength(2);
    await http().get(`/proposal/${proposalId}`).set(mgrB()).expect(404);
    expect((await http().get(`/proposal?opportunityId=${opportunityId}`).set(empA()).expect(200)).body).toHaveLength(1);
    await http().get(`/proposal?opportunityId=${opportunityId}`).set(mgrB()).expect(404);
  });

  // ---------------- project hand-off + delivery ----------------

  it('an accepted, approved proposal becomes exactly one linked project, even for repeated or concurrent requests', async () => {
    await http().post(`/proposal/${proposalId}/project`).set(empA()).expect(403);
    await http().post(`/proposal/${proposalId}/project`).set(mgrB()).expect(404);
    const rs = await Promise.all(Array.from({ length: 5 }, () => http().post(`/proposal/${proposalId}/project`).set(mgrA())));
    for (const r of rs) expect(r.status).toBe(201);
    expect(rs.filter((r) => r.body.created).length).toBe(1);
    projectId = rs[0].body.project.id;
    expect(new Set(rs.map((r) => r.body.project.id)).size).toBe(1);
    expect(await prisma.project.count({ where: { companyId: A } })).toBe(1);
    const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(p).toMatchObject({ companyId: A, clientId, opportunityId, proposalId, status: 'PLANNED', quotedPrice: 45200 });
    const d = (await http().get(`/project/${projectId}`).set(empA()).expect(200)).body;
    expect(d.client.name).toBe('Sim Pipeline Hostel');
    expect(d.proposal.id).toBe(proposalId);
    expect((await http().get('/project').set(empA()).expect(200)).body).toHaveLength(1);
    expect((await http().get('/project').set(mgrB()).expect(200)).body).toHaveLength(0);
    await http().get(`/project/${projectId}`).set(mgrB()).expect(404);
  });

  it('tasks: create (no duplicates), assign within the company only, valid transitions, stale updates conflict', async () => {
    await http().post(`/project/${projectId}/tasks`).set(empA()).send({ title: 'x' }).expect(403);
    await http().post(`/project/${projectId}/tasks`).set(mgrB()).send({ title: 'x' }).expect(404);
    await http().post(`/project/${projectId}/tasks`).set(mgrA()).send({ title: '' }).expect(400);
    await http().post(`/project/${projectId}/tasks`).set(mgrA()).send({ title: 'Design', priority: 'SUPER' }).expect(400);
    await http().post(`/project/${projectId}/tasks`).set(mgrA()).send({ title: 'Design', assignedEmployeeId: employeeB }).expect(400); // other company's employee
    const t = await http().post(`/project/${projectId}/tasks`).set(mgrA()).send({ title: 'Design the home page', priority: 'HIGH' }).expect(201);
    taskId = t.body.task.id;
    expect((await http().post(`/project/${projectId}/tasks`).set(mgrA()).send({ title: 'Design the home page' }).expect(201)).body.created).toBe(false);
    expect(await prisma.task.count({ where: { projectId } })).toBe(1);
    await http().post(`/project/${projectId}/tasks/${taskId}/assign`).set(mgrA()).send({ employeeId: employeeB }).expect(400);
    await http().post(`/project/${projectId}/tasks/${taskId}/assign`).set(mgrA()).send({ employeeId: employeeA }).expect(201);
    const mv = (from: string, to: string) => http().post(`/project/${projectId}/tasks/${taskId}/status`).set(mgrA()).send({ from, to });
    await mv('BACKLOG', 'COMPLETED').expect(400);
    await mv('BACKLOG', 'READY').expect(201);
    await mv('BACKLOG', 'READY').expect(409); // stale
    await mv('READY', 'IN_PROGRESS').expect(201);
    await mv('IN_PROGRESS', 'REVIEW').expect(201);
    const done = await mv('REVIEW', 'COMPLETED').expect(201);
    expect(done.body.tasks[0]).toMatchObject({ status: 'COMPLETED', assignedEmployeeId: employeeA });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).completedAt).not.toBeNull();
    await http().post(`/project/${projectId}/tasks/${taskId}/status`).set(mgrB()).send({ from: 'BACKLOG', to: 'READY' }).expect(404);
    await mv('COMPLETED', 'READY').expect(400); // terminal
  });

  it('project status: valid transitions only; acceptance is Chairman-only; completion needs finished tasks', async () => {
    const st = (from: string, to: string, who = mgrA) => http().post(`/project/${projectId}/status`).set(who()).send({ from, to });
    await st('PLANNED', 'COMPLETED').expect(400);
    await st('PLANNED', 'ACTIVE').expect(201);
    await st('PLANNED', 'ACTIVE').expect(409); // stale: already ACTIVE
    await st('ACTIVE', 'IN_QA').expect(201);
    await st('IN_QA', 'DELIVERED').expect(201);
    await st('DELIVERED', 'ACCEPTED').expect(403); // management cannot record customer acceptance
    await st('DELIVERED', 'ACCEPTED', chair).expect(201);
    const open = await prisma.task.create({ data: { companyId: A, projectId, createdBy: 'pipe', title: 'Open item' } });
    const blocked = await st('ACCEPTED', 'COMPLETED').expect(409);
    expect(blocked.body.message).toMatch(/1 task/);
    await prisma.task.update({ where: { id: open.id }, data: { status: 'CANCELLED' } });
    const fin = await st('ACCEPTED', 'COMPLETED').expect(201);
    expect(fin.body.status).toBe('COMPLETED');
    await http().post(`/project/${projectId}/tasks`).set(mgrA()).send({ title: 'Late task' }).expect(409);
  });

  it('history records every step, and the pipeline sent nothing and left other data intact', async () => {
    const hist = (await http().get(`/project/${projectId}/history`).set(empA()).expect(200)).body as { action: string }[];
    const actions = hist.map((h) => h.action);
    expect(actions).toEqual(expect.arrayContaining(['PROJECT_CREATED_FROM_PROPOSAL', 'TASK_CREATED', 'TASK_ASSIGNED', 'TASK_STATUS_CHANGED', 'PROJECT_STATUS_CHANGED']));
    await http().get(`/project/${projectId}/history`).set(mgrB()).expect(404);
    const proposalActions = (await prisma.customerAuditEvent.findMany({ where: { companyId: A, objectType: 'Proposal', objectId: proposalId } })).map((e) => e.action);
    expect(proposalActions).toEqual(expect.arrayContaining(['PROPOSAL_DRAFT_GENERATED', 'PROPOSAL_EDITED', 'PROPOSAL_SUBMITTED_FOR_APPROVAL', 'PROPOSAL_APPROVE', 'PROPOSAL_REQUEST_CHANGES', 'PROPOSAL_MARKED_SENT', 'PROPOSAL_CUSTOMER_ACCEPTED']));
    expect(await prisma.client.count({ where: { companyId: A } })).toBe(1);
    expect(await prisma.proposal.count({ where: { opportunityId } })).toBe(1);
    expect(await prisma.project.count({ where: { companyId: A } })).toBe(1);
    expect(await prisma.client.count({ where: { companyId: B } })).toBe(0);
    expect(jobs).toBeDefined();
  });
});
