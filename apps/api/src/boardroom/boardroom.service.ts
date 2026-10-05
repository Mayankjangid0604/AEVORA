import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Meeting, MeetingLeader, Prisma } from '@prisma/client';
import { ModelGateway, ModelTier } from '@aevora/model-gateway';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../devices/realtime.gateway';
import { CeoDialogueService } from '../ceo/ceo-dialogue.service';
import { findCeo } from '../ceo/ceo-review.service';
import { chairmanMailer } from '../notifications/chairman-mailer';
import { companyProfile } from '../config/company';
import {
  BoardAction, MAX_AGENDA_ITEMS, TranscriptLine, dueAction, needsChairman, nextDay, nextTurn, parseImportance, splitDecisions, transition,
} from './boardroom.logic';
import { buildSummaryPdf } from './summary-pdf';

const TICK_MS = 60_000;
const MAX_LOOP = 80;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Roughly how long a line takes to say, so listeners keep up: 3-20 s. */
/** Models sometimes answer "Alice: …" or in quotes; keep just the line. */
export function stripSpeaker(text: string, name: string) {
  let t = text.trim();
  const prefix = `${name.toLowerCase()}:`;
  while (t.toLowerCase().startsWith(prefix)) t = t.slice(prefix.length).trim();
  return t.replace(/^["']|["']$/g, '').trim();
}
export const paceMs = (text: string) => Math.min(20_000, Math.max(3000, 1500 + text.split(/\s+/).length * 380));
const MAX_PARTICIPANTS = 6;
const filesDir = () => process.env.BOARDROOM_FILES_DIR || path.join(process.cwd(), '.data', 'boardroom');
const MEETING_INCLUDE = {
  agendaItems: { orderBy: { order: 'asc' } },
  participants: { include: { employee: { select: { id: true, name: true, role: { select: { title: true } }, department: { select: { name: true } }, voiceProfile: true } } } },
} satisfies Prisma.MeetingInclude;
type FullMeeting = Prisma.MeetingGetPayload<{ include: typeof MEETING_INCLUDE }>;

export interface ScheduleInput { title: string; agenda: string[]; importance?: string; scheduledAt?: string | Date; participantIds?: string[]; ledBy?: MeetingLeader }

/**
 * Board meetings in the Boardroom: scheduling, Chairman notifications (join / reschedule / delegate), the AI discussion
 * (one line at a time, cost-capped), and the Assistant's summary (PDF emailed only to the Chairman's own address).
 * The Assistant never approves money, hiring, pricing or outreach: those become CEO questions for the Chairman.
 */
@Injectable()
export class BoardroomService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BoardroomService.name);
  private readonly gateway = new ModelGateway();
  private readonly busy = new Set<string>(); // meeting ids with a turn or a summary in flight
  private readonly running = new Set<string>(); // meetings whose discussion loop runs in this process
  private readonly paused = new Set<string>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly ceoDialogue: CeoDialogueService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => { this.tick().catch((e) => this.logger.warn(`Boardroom tick failed: ${e.message}`)); }, TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  // ── scheduling ────────────────────────────────────────────────────────────
  /** CEO + department heads (management roles), active only. */
  async defaultParticipants(companyId: string): Promise<string[]> {
    const ceo = await findCeo(this.prisma, companyId);
    const heads = await this.prisma.employee.findMany({
      where: {
        companyId, status: 'ACTIVE', id: ceo ? { not: ceo.id } : undefined,
        role: { OR: [{ accessLevel: 'MANAGEMENT' }, { title: { contains: 'head', mode: 'insensitive' } }, { title: { contains: 'director', mode: 'insensitive' } }, { title: { contains: 'chief', mode: 'insensitive' } }] },
      },
      orderBy: { hireDate: 'asc' },
      take: MAX_PARTICIPANTS - (ceo ? 1 : 0),
      select: { id: true },
    });
    return [...(ceo ? [ceo.id] : []), ...heads.map((h) => h.id)];
  }

  async schedule(companyId: string, input: ScheduleInput, opts: { startNow?: boolean } = {}) {
    const title = String(input.title ?? '').trim().slice(0, 200);
    const agenda = (Array.isArray(input.agenda) ? input.agenda : []).map((a) => String(a).trim().slice(0, 200)).filter(Boolean).slice(0, MAX_AGENDA_ITEMS);
    if (!title) throw new BadRequestException('title is required');
    if (!agenda.length) throw new BadRequestException('agenda needs at least one item');
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
    if (Number.isNaN(scheduledAt.getTime())) throw new BadRequestException('scheduledAt is not a valid date');

    const ceo = await findCeo(this.prisma, companyId); // the CEO sits in on every board meeting (left of the Chairman)
    let ids = [...new Set([...(ceo ? [ceo.id] : []), ...(input.participantIds?.length ? input.participantIds : await this.defaultParticipants(companyId))])];
    ids = (await this.prisma.employee.findMany({ where: { id: { in: ids }, companyId, status: 'ACTIVE' }, select: { id: true } })).map((e) => e.id).slice(0, MAX_PARTICIPANTS);
    if (!ids.length) throw new BadRequestException('no active participants (hire a CEO or department heads first)');

    const meeting = await this.prisma.meeting.create({
      data: {
        companyId, title, kind: 'BOARD', importance: parseImportance(input.importance), scheduledAt, durationMinutes: 30,
        ledBy: input.ledBy ?? null,
        ...(opts.startNow ? { status: 'IN_PROGRESS', startedAt: new Date() } : {}),
        agendaItems: { create: agenda.map((t, i) => ({ title: t, order: i })) },
        participants: { create: ids.map((employeeId) => ({ employeeId })) },
      },
      include: MEETING_INCLUDE,
    });
    if (opts.startNow) { await this.broadcast(meeting, { start: true }); this.run(meeting.id); }
    else await this.notify(meeting);
    return meeting;
  }

  private async chairmanOf(companyId: string) {
    return (await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { chairmanId: true } })).chairmanId;
  }

  private async broadcast(m: FullMeeting, extra: Record<string, unknown> = {}) {
    this.realtime.broadcastToUser(await this.chairmanOf(m.companyId), 'boardroom.meeting', {
      id: m.id, title: m.title, importance: m.importance, status: m.status, scheduledAt: m.scheduledAt, ledBy: m.ledBy,
      agenda: m.agendaItems.map((a) => a.title), participantIds: m.participants.map((p) => p.employeeId), participantCount: m.participants.length,
      ...extra,
    });
  }

  /** Tell the Chairman (WS + mobile push + Chairman Mail) and mark NOTIFIED. */
  private async notify(m: FullMeeting) {
    const next = transition(m.status, 'NOTIFY');
    if (next) {
      m = await this.prisma.meeting.update({ where: { id: m.id }, data: { status: next, notifiedAt: new Date() }, include: MEETING_INCLUDE });
    }
    await this.broadcast(m, { notify: true });
  }

  // ── Chairman actions ──────────────────────────────────────────────────────
  private async load(companyId: string, id: string): Promise<FullMeeting> {
    const m = await this.prisma.meeting.findFirst({ where: { id, companyId, kind: 'BOARD' }, include: MEETING_INCLUDE });
    if (!m) throw new NotFoundException('Board meeting not found');
    return m;
  }

  /** Atomic status change: only succeeds if nobody else changed the status meanwhile. */
  private async move(m: Meeting, action: BoardAction, data: Prisma.MeetingUpdateManyMutationInput = {}) {
    const next = transition(m.status, action);
    if (!next) throw new BadRequestException(`Cannot ${action.toLowerCase()} a ${m.status} meeting`);
    const r = await this.prisma.meeting.updateMany({ where: { id: m.id, status: m.status }, data: { status: next, ...data } });
    if (!r.count) throw new BadRequestException('Meeting changed meanwhile, try again');
    return this.prisma.meeting.findUniqueOrThrow({ where: { id: m.id }, include: MEETING_INCLUDE });
  }

  async join(companyId: string, id: string) {
    const m = await this.load(companyId, id);
    const out = await this.move(m, 'JOIN', { ledBy: 'CHAIRMAN', ...(m.startedAt ? {} : { startedAt: new Date() }) });
    await this.broadcast(out, { start: true });
    this.run(out.id);
    return out;
  }

  async delegate(companyId: string, id: string) {
    const m = await this.load(companyId, id);
    const out = await this.move(m, 'DELEGATE', { ledBy: 'ASSISTANT' });
    if (out.scheduledAt.getTime() <= Date.now()) return this.startAssistant(out);
    return out;
  }

  async reschedule(companyId: string, id: string, at: string | Date) {
    const when = new Date(at);
    if (!at || Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) throw new BadRequestException('reschedule needs a future time');
    const m = await this.load(companyId, id);
    const out = await this.move(m, 'RESCHEDULE', { scheduledAt: when, rescheduleCount: { increment: 1 }, ledBy: null });
    await this.notify(out);
    return out;
  }

  async cancel(companyId: string, id: string) {
    const out = await this.move(await this.load(companyId, id), 'CANCEL', { endedAt: new Date() });
    await this.broadcast(out);
    return out;
  }

  // ── start time ────────────────────────────────────────────────────────────
  async tick(now = new Date()) {
    const due = await this.prisma.meeting.findMany({
      where: { kind: 'BOARD', status: { in: ['SCHEDULED', 'NOTIFIED', 'RESCHEDULED'] }, scheduledAt: { lte: now } },
      include: MEETING_INCLUDE, take: 20,
    });
    for (const m of due) {
      try {
        const action = dueAction(m, now);
        if (action === 'AUTO_RESCHEDULE') {
          const out = await this.move(m, 'RESCHEDULE', { scheduledAt: nextDay(m.scheduledAt), rescheduleCount: { increment: 1 } });
          await this.notify(out);
        } else if (action === 'AUTO_DELEGATE' || action === 'START_ASSISTANT') {
          await this.startAssistant(m);
        } else if (action === 'START_CHAIRMAN') {
          await this.broadcast(await this.move(m, 'START', { startedAt: now }), { start: true });
          this.run(m.id);
        }
      } catch (e: any) {
        this.logger.warn(`Board meeting ${m.id}: ${e.message}`);
      }
    }
    // After an API restart: pick up meetings that were live.
    const live = await this.prisma.meeting.findMany({ where: { kind: 'BOARD', status: 'IN_PROGRESS' }, select: { id: true }, take: 20 });
    for (const m of live) this.run(m.id);
    const summarizing = await this.prisma.meeting.findMany({ where: { kind: 'BOARD', status: 'SUMMARIZING' }, select: { id: true }, take: 20 });
    for (const m of summarizing) void this.completeSummary(m.id);
  }

  /** The Assistant leads: claim the meeting, then run the whole discussion in the background. */
  private async startAssistant(m: Meeting) {
    const out = await this.move(m, 'START', { ledBy: 'ASSISTANT', startedAt: new Date() });
    await this.broadcast(out, { start: true });
    this.run(out.id);
    return out;
  }

  /**
   * Server-driven discussion for every live meeting (Chairman- or Assistant-led): one line at speaking pace, broadcast
   * as `boardroom.line`, so it runs with only the phone connected (or nothing at all). Assistant-led meetings end and
   * send the summary by themselves; Chairman-led ones wait for the Chairman to end them.
   */
  run(id: string) {
    if (this.running.has(id)) return;
    this.running.add(id);
    void (async () => {
      try {
        for (let i = 0; i < MAX_LOOP; i++) {
          while (this.paused.has(id)) await sleep(2000);
          const m = await this.prisma.meeting.findUnique({ where: { id }, select: { status: true, ledBy: true, companyId: true } });
          if (!m || m.status !== 'IN_PROGRESS') return;
          const r = await this.takeTurnById(id);
          if (r?.done) { if (m.ledBy === 'ASSISTANT') await this.finish(m.companyId, id); return; }
          await sleep(r?.line ? paceMs(r.line.text) : 1500);
        }
      } catch (e: any) {
        this.logger.warn(`Board meeting ${id} discussion stopped: ${e.message}`);
      } finally {
        this.running.delete(id);
      }
    })();
  }

  async setPaused(companyId: string, id: string, paused: boolean) {
    await this.load(companyId, id);
    if (paused) this.paused.add(id); else this.paused.delete(id);
    return { paused };
  }

  // ── the discussion ────────────────────────────────────────────────────────
  async takeTurn(companyId: string, id: string) {
    const m = await this.load(companyId, id);
    if (m.status !== 'IN_PROGRESS') throw new BadRequestException(`Meeting is ${m.status}`);
    return this.takeTurnById(id);
  }

  /** Generate the next line (or report done). One turn per meeting at a time. */
  private async takeTurnById(id: string): Promise<{ done: boolean; line?: TranscriptLine; agendaIndex?: number } | null> {
    if (this.busy.has(id)) return { done: false };
    this.busy.add(id);
    try {
      const m = await this.prisma.meeting.findUniqueOrThrow({ where: { id }, include: MEETING_INCLUDE });
      const transcript = (m.transcript as unknown as TranscriptLine[]) ?? [];
      const ids = m.participants.map((p) => p.employeeId), last = transcript[transcript.length - 1];
      const plan = nextTurn(transcript, m.agendaItems.length, ids) ?? (last?.speakerId === 'chairman' && ids.length ? { agendaIndex: last.agendaIndex, speakerId: ids[0] } : null);
      if (!plan) return { done: true };
      const who = m.participants.find((p) => p.employeeId === plan.speakerId)!.employee;
      const item = m.agendaItems[plan.agendaIndex];
      const text = await this.speakLine(m, who, item.title, transcript);
      const line: TranscriptLine = { speakerId: who.id, speakerName: who.name, text, at: new Date().toISOString(), agendaIndex: plan.agendaIndex };
      await this.appendLine(id, line, plan.agendaIndex);
      this.realtime.broadcastToUser(await this.chairmanOf(m.companyId), 'boardroom.line', { meetingId: id, line });
      return { done: false, line, agendaIndex: plan.agendaIndex };
    } finally {
      this.busy.delete(id);
    }
  }

  private async speakLine(m: FullMeeting, who: FullMeeting['participants'][number]['employee'], item: string, transcript: TranscriptLine[]) {
    const recent = transcript.slice(-6).map((l) => `${l.speakerName}: ${l.text}`).join('\n') || '(nobody has spoken yet)';
    const system = `You are ${who.name}, ${who.role?.title ?? 'a manager'}${who.department?.name ? ` in ${who.department.name}` : ''} at ${companyProfile().name}. `
      + 'You are in a board meeting with the Chairman. Stay in character and speak in 1-3 short sentences. '
      + 'Do not invent figures you were not given. You cannot approve spending, hiring, pricing or outreach: say it needs the Chairman\'s approval.';
    const prompt = `Board meeting: ${m.title}\nAgenda item: ${item}\nConversation so far:\n${recent}\n\nYour next line:`;
    try {
      const out = stripSpeaker((await this.gateway.callWithTier(ModelTier.LOCAL_BASIC, prompt, system)).trim(), who.name);
      return out.slice(0, 600) || '(no comment)';
    } catch (e: any) {
      this.logger.warn(`Board line failed: ${e.message}`);
      return '(could not answer: the model is unavailable)';
    }
  }

  /** Atomic append: the Chairman's line and an AI turn can land at the same moment (read-modify-write lost one live). */
  private async appendLine(id: string, line: TranscriptLine, agendaIndex?: number) {
    await this.prisma.$executeRaw`UPDATE "Meeting" SET transcript = COALESCE(transcript, '[]'::jsonb) || ${JSON.stringify([line])}::jsonb${agendaIndex === undefined ? Prisma.empty : Prisma.sql`, "currentAgendaIndex" = ${agendaIndex}`} WHERE id = ${id}`;
  }

  /** The Chairman speaks (typed or via the mic): it goes into the transcript and the next speaker answers. */
  async say(companyId: string, id: string, text: string) {
    const t = String(text ?? '').trim().slice(0, 1000);
    if (!t) throw new BadRequestException('text is required');
    const m = await this.load(companyId, id);
    if (m.status !== 'IN_PROGRESS') throw new BadRequestException(`Meeting is ${m.status}`);
    const line: TranscriptLine = { speakerId: 'chairman', speakerName: 'Chairman', text: t, at: new Date().toISOString(), agendaIndex: m.currentAgendaIndex };
    await this.appendLine(id, line);
    this.realtime.broadcastToUser(await this.chairmanOf(companyId), 'boardroom.line', { meetingId: id, line });
    this.paused.delete(id);
    this.run(id); // the room answers at speaking pace
    return { line };
  }

  // ── summary ───────────────────────────────────────────────────────────────
  /** Chairman (or the Assistant) ends the meeting → SUMMARIZING now; summary, PDF and email follow in the background. */
  async finish(companyId: string, id: string) {
    const m = await this.load(companyId, id);
    const out = await this.move(m, 'FINISH', { endedAt: new Date() });
    await this.broadcast(out, { ended: true });
    void this.completeSummary(id);
    return out;
  }

  /**
   * #48: summary → action items / Chairman questions → PDF + email (Assistant-led) → COMPLETED. A PDF or email failure is
   * recorded in summaryError and the meeting still completes. Also resumed by tick() after an API restart.
   */
  async completeSummary(id: string) {
    if (this.busy.has(id)) return;
    this.busy.add(id);
    try {
      let m = await this.prisma.meeting.findUniqueOrThrow({ where: { id }, include: MEETING_INCLUDE });
      if (m.status !== 'SUMMARIZING') return;
      const assistantLed = m.ledBy === 'ASSISTANT';
      if (m.summary == null) { // not yet summarised (a resume after a crash skips this so items aren't duplicated)
        const s = await this.summarize(m, (m.transcript as unknown as TranscriptLine[]) ?? []);
        // Action items for named participants; anything the room can't decide becomes a question for the Chairman.
        for (const a of s.actionItems) {
          const owner = m.participants.find((p) => p.employee.name.toLowerCase() === String(a.owner ?? '').toLowerCase());
          await this.prisma.meetingActionItem.create({ data: { meetingId: id, title: String(a.title).slice(0, 300), assignedEmployeeId: owner?.employeeId ?? null } });
        }
        for (const q of s.forChairman) {
          await this.ceoDialogue.ask(m.companyId, `Board meeting "${m.title}": ${q}`, { reason: 'Needs your approval (money, hiring, pricing or outreach)', meetingId: id }, 'HIGH')
            .catch((e) => this.logger.warn(`Chairman question failed: ${e.message}`));
        }
        m = await this.prisma.meeting.update({ where: { id }, data: { summary: s.text }, include: MEETING_INCLUDE });
      }
      let error: string | null = null;
      if (assistantLed && !m.summaryDeliveredAt) {
        try {
          if (!(await this.deliverSummary(m))) error = 'Summary email not sent (Chairman mail is not configured)';
        } catch (e: any) {
          error = `Summary PDF/email failed: ${e.message}`;
        }
        if (error) this.logger.warn(`Board meeting ${id}: ${error}`);
      }
      // The Chairman was in the room for a meeting they led, so there is nothing to brief.
      const done = await this.move(m, 'SUMMARIZED', { summaryError: error, ...(assistantLed ? {} : { summaryBriefedAt: new Date() }) });
      await this.broadcast(done, { ended: true, summarized: true });
    } catch (e: any) {
      this.logger.warn(`Board meeting ${id} summary failed: ${e.message}`);
    } finally {
      this.busy.delete(id);
    }
  }

  private async summarize(m: FullMeeting, transcript: TranscriptLine[]) {
    const said = transcript.map((l) => `${l.speakerName}: ${l.text}`).join('\n').slice(-6000);
    let raw: any = null;
    if (said) {
      try {
        const out = await this.gateway.callWithTier(ModelTier.LOCAL_BASIC,
          `Meeting: ${m.title}\nAgenda: ${m.agendaItems.map((a) => a.title).join('; ')}\nTranscript:\n${said}\n\nReturn JSON: {"decisions": string[], "actionItems": [{"title": string, "owner": string}], "openQuestions": string[], "needsChairman": string[]}`,
          'You write board meeting minutes. Only use what is in the transcript. Put anything about money, hiring, pricing or outreach in needsChairman.',
          { json: true });
        raw = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
      } catch (e: any) {
        this.logger.warn(`Summary model failed: ${e.message}`);
      }
    }
    const { decided, forChairman } = splitDecisions(Array.isArray(raw?.decisions) ? raw.decisions : [], Array.isArray(raw?.needsChairman) ? raw.needsChairman : []);
    const actionItems = (Array.isArray(raw?.actionItems) ? raw.actionItems : []).filter((a: any) => a?.title && !needsChairman(String(a.title))).slice(0, 10);
    const openQuestions = (Array.isArray(raw?.openQuestions) ? raw.openQuestions : []).map(String).slice(0, 10);
    const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- none');
    const text = [
      `${m.title} (${m.importance}) — ${m.startedAt ? m.startedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''}`,
      `Led by: ${m.ledBy === 'ASSISTANT' ? 'your Assistant' : 'you'}. Attended: ${m.participants.map((p) => p.employee.name).join(', ')}.`,
      `Agenda:\n${list(m.agendaItems.map((a) => a.title))}`,
      `Decisions:\n${list(decided)}`,
      `Action items:\n${list(actionItems.map((a: any) => `${a.title}${a.owner ? ` (owner: ${a.owner})` : ''}`))}`,
      `Waiting for your approval:\n${list(forChairman)}`,
      `Open questions:\n${list(openQuestions)}`,
      raw ? '' : 'Note: the summary model was unavailable, so only the agenda and attendance are listed. The full transcript is in AEVORA.',
    ].filter(Boolean).join('\n\n');
    return { text, actionItems, forChairman };
  }

  /** PDF of the summary → Chairman's own email (config) only. */
  private async deliverSummary(m: FullMeeting) {
    const dir = filesDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `board-meeting-${m.id}.pdf`);
    fs.writeFileSync(file, await buildSummaryPdf(`Board meeting summary: ${m.title}`, m.summary ?? ''));
    const sent = await chairmanMailer.send({
      subject: `Board meeting summary: ${m.title}`,
      text: `${m.summary}\n\nThe summary is attached as a PDF.`,
      attachments: [{ filename: `board-meeting-${m.id}.pdf`, content: fs.readFileSync(file), contentType: 'application/pdf' }],
    });
    await this.prisma.meeting.update({ where: { id: m.id }, data: { summaryFilePath: file, ...(sent ? { summaryDeliveredAt: new Date() } : {}) } });
    return !!sent;
  }

  // ── reads ─────────────────────────────────────────────────────────────────
  list(companyId: string) {
    return this.prisma.meeting.findMany({ where: { companyId, kind: 'BOARD' }, orderBy: { scheduledAt: 'desc' }, take: 50, include: MEETING_INCLUDE });
  }

  get(companyId: string, id: string) { return this.load(companyId, id); }

  /** The meeting running now (for the office projector/audio and the mobile view), or null. */
  active(companyId: string) {
    return this.prisma.meeting.findFirst({ where: { companyId, kind: 'BOARD', status: 'IN_PROGRESS' }, orderBy: { startedAt: 'desc' }, include: MEETING_INCLUDE });
  }

  async transcript(companyId: string, id: string) {
    const m = await this.load(companyId, id);
    return { id: m.id, title: m.title, status: m.status, currentAgendaIndex: m.currentAgendaIndex, transcript: m.transcript };
  }

  async summaryFile(companyId: string, id: string) {
    const m = await this.load(companyId, id);
    if (!m.summaryFilePath || !fs.existsSync(m.summaryFilePath)) throw new NotFoundException('No summary file for this meeting');
    return { path: m.summaryFilePath, name: path.basename(m.summaryFilePath) };
  }

  /**
   * Summaries the Assistant hasn't read to the Chairman yet ("I have a summary of N meetings"). #48: meetings still
   * SUMMARIZING are listed too (status says so) so "brief me" can say it's being prepared instead of "nothing new".
   */
  pendingBriefings(companyId: string) {
    return this.prisma.meeting.findMany({
      where: { companyId, kind: 'BOARD', OR: [{ status: 'SUMMARIZING' }, { status: 'COMPLETED', summary: { not: null }, summaryBriefedAt: null }] },
      orderBy: { endedAt: 'desc' }, take: 10, select: { id: true, title: true, summary: true, endedAt: true, status: true },
    });
  }

  async markBriefed(companyId: string, id: string) {
    await this.load(companyId, id);
    await this.prisma.meeting.update({ where: { id }, data: { summaryBriefedAt: new Date() } });
    return { ok: true };
  }

  /** Voice: "Urgent board meeting" → starts now, Chairman leads, CEO + heads walk to the Boardroom. */
  urgentNow(companyId: string, topic?: string) {
    return this.schedule(companyId, {
      title: 'Urgent board meeting',
      agenda: [topic?.trim() || 'Urgent matters raised by the Chairman'],
      importance: 'URGENT', ledBy: 'CHAIRMAN',
    }, { startNow: true });
  }
}
