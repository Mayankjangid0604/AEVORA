import { MeetingImportance, MeetingLeader, MeetingStatus } from '@prisma/client';

/** Pure rules for board meetings (no DB): state machine, what to do at start time, turn plan, decision guard. */

export type BoardAction = 'JOIN' | 'DELEGATE' | 'RESCHEDULE' | 'CANCEL' | 'START' | 'FINISH' | 'SUMMARIZED' | 'NOTIFY';

const OPEN: MeetingStatus[] = ['SCHEDULED', 'NOTIFIED', 'RESCHEDULED'];

/** Next status for an action, or null when the action isn't allowed in this status. */
export function transition(status: MeetingStatus, action: BoardAction): MeetingStatus | null {
  switch (action) {
    case 'NOTIFY': return status === 'SCHEDULED' || status === 'RESCHEDULED' ? 'NOTIFIED' : null;
    case 'RESCHEDULE': return OPEN.includes(status) ? 'RESCHEDULED' : null;
    case 'DELEGATE': return OPEN.includes(status) ? status : null; // only changes who leads
    case 'JOIN': return OPEN.includes(status) || status === 'IN_PROGRESS' ? 'IN_PROGRESS' : null;
    case 'START': return OPEN.includes(status) ? 'IN_PROGRESS' : null;
    case 'FINISH': return status === 'IN_PROGRESS' ? 'SUMMARIZING' : null; // #48: COMPLETED only once the summary (+ PDF/email) is done
    case 'SUMMARIZED': return status === 'SUMMARIZING' ? 'COMPLETED' : null;
    case 'CANCEL': return OPEN.includes(status) || status === 'IN_PROGRESS' ? 'CANCELLED' : null;
  }
}

export type DueAction = 'NONE' | 'START_ASSISTANT' | 'START_CHAIRMAN' | 'AUTO_DELEGATE' | 'AUTO_RESCHEDULE';

/**
 * At/after start time: the Chairman's choice wins; no answer → HIGH/URGENT meetings go ahead with the Assistant leading,
 * anything less important moves to the same time tomorrow.
 */
export function dueAction(m: { status: MeetingStatus; scheduledAt: Date; ledBy: MeetingLeader | null; importance: MeetingImportance }, now: Date): DueAction {
  if (!OPEN.includes(m.status) || m.scheduledAt.getTime() > now.getTime()) return 'NONE';
  if (m.ledBy === 'ASSISTANT') return 'START_ASSISTANT';
  if (m.ledBy === 'CHAIRMAN') return 'START_CHAIRMAN';
  return m.importance === 'HIGH' || m.importance === 'URGENT' ? 'AUTO_DELEGATE' : 'AUTO_RESCHEDULE';
}

export const nextDay = (d: Date) => new Date(d.getTime() + 86_400_000);

export interface TranscriptLine { speakerId: string; speakerName: string; text: string; at: string; agendaIndex: number }

/** Cost limits: every agenda item gets at most this many AI lines, the whole meeting at most MAX_LINES. */
export const LINES_PER_ITEM = 3;
export const MAX_AGENDA_ITEMS = 6;
export const MAX_LINES = 24;

/** Which agenda item and speaker come next, or null when the meeting has run its course. */
export function nextTurn(transcript: TranscriptLine[], agendaCount: number, participantIds: string[]): { agendaIndex: number; speakerId: string } | null {
  const ai = transcript.filter((l) => l.speakerId !== 'chairman');
  if (!participantIds.length || !agendaCount || ai.length >= MAX_LINES) return null;
  const items = Math.min(agendaCount, MAX_AGENDA_ITEMS);
  const current = transcript.length ? transcript[transcript.length - 1].agendaIndex : 0;
  const spoken = ai.filter((l) => l.agendaIndex === current).length;
  const index = spoken >= LINES_PER_ITEM ? current + 1 : current;
  if (index >= items) return null;
  const k = index === current ? spoken : 0;
  return { agendaIndex: index, speakerId: participantIds[(index + k) % participantIds.length] };
}

/** Anything about money, hiring, pricing or outreach is never decided in the room: it goes to the Chairman. */
const CHAIRMAN_ONLY = /₹|\brs\.?\s?\d|\brupees?\b|\bbudget|\bspend|\binvest|\bpay(ment|ing)?\b|\bprice|\bpricing\b|\bdiscount|\bfee\b|\bhir(e|ing)\b|\brecruit|\bsalar(y|ies)\b|\bfire\b|\bterminat|\boutreach\b|\bcampaign\b|\bcold (email|call)|\bemail (leads|clients|prospects)\b/i;

export const needsChairman = (text: string) => CHAIRMAN_ONLY.test(text);

export function splitDecisions(decisions: unknown[], chairmanItems: unknown[] = []) {
  const clean = (a: unknown[]) => a.map((x) => String(x ?? '').trim()).filter(Boolean);
  const all = clean(decisions);
  return {
    decided: all.filter((d) => !needsChairman(d)),
    forChairman: [...clean(chairmanItems), ...all.filter(needsChairman)],
  };
}

/** "Urgent board meeting" and close variants, English and Hinglish. */
export function isUrgentBoardMeetingCommand(transcript: string): boolean {
  const t = transcript.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const board = /\b(board ?room|board) (meeting|baithak|mtg)\b|\bboard ki meeting\b|बोर्ड मीटिंग/.test(t);
  const urgent = /\b(urgent|emergency|immediate(ly)?|right now|asap|turant|jaldi|abhi)\b|तुरंत|अभी|जल्दी/.test(t);
  return board && urgent;
}

export function parseImportance(v: unknown): MeetingImportance {
  return v === 'LOW' || v === 'HIGH' || v === 'URGENT' ? v : 'NORMAL';
}
