'use client';

// Shell ↔ office link for Parts 15-22: live company data into the 3D office, and a small set of actions the office
// may ask the shell to perform. Signed out, nothing is fetched (the world stays scenery only).

import { useEffect, type RefObject } from 'react';
import { chairmanFetch } from './api';

/** Existing, read-only endpoints the office renders on walls, desks and events. Key → path. */
export const DATA_FEEDS: Record<string, string> = {
  overview: '/chairman/overview',
  financials: '/chairman/financials',
  survival: '/survival/status',
  leads: '/lead-gen/leads',
  projects: '/delivery/projects',
  ideas: '/ideas',
  decisions: '/chairman/decisions',
  alerts: '/chairman/alerts',
  activity: '/chairman/activity',
  inboxUnread: '/inbox/unread-count',
  ceoQuestions: '/ceo/questions',
  ceoFeed: '/ceo/feed',
  weeklyReports: '/ceo/weekly-reports',
  strategy: '/strategy/state',
  ventures: '/ventures',
  labProjects: '/lab/projects',
  simulation: '/simulation/status',
  mapPins: '/map/pins',
  companyProjects: '/chairman/projects',
  aeSummary: '/autonomous-enterprise/dashboard/summary',
  employees: '/chairman/employees',
  customers: '/customer-operations/customers',
  boardroomBriefing: '/boardroom/briefing',
  screensResearch: '/office/screens/research',
  screensEngineering: '/office/screens/engineering',
  screensSales: '/office/screens/sales',
  screensReception: '/office/screens/reception',
  screensCafeteria: '/office/screens/cafeteria',
  screensSupport: '/office/screens/support',
  screensFinance: '/office/screens/finance',
  screensLegal: '/office/screens/legal',
  screensCeo: '/office/screens/ceo',
  screensMarketing: '/office/screens/marketing',
  knowledgeGraph: '/office/screens/knowledge-graph',
};
const FEED_MS = 60_000;
/** Polled faster: a board meeting started from the phone, the OfficeOS mic or the Assistant must walk people in within seconds. */
const FAST_FEEDS: Record<string, string> = { boardroom: '/boardroom/meetings/active' };
const FAST_MS = 5_000;

export function postToOffice(frame: RefObject<HTMLIFrameElement | null>, type: string, data: unknown) {
  frame.current?.contentWindow?.postMessage({ target: 'aevora-office', type, data }, window.location.origin);
}

/** Poll every feed once a minute while signed in and hand each result to the office as DATA {key, value}. */
export function useCompanyDataFeed(frame: RefObject<HTMLIFrameElement | null>, ready: boolean, signedIn: boolean) {
  useEffect(() => {
    if (!ready || !signedIn) return;
    let stop = false;
    const pull = () => Object.entries(DATA_FEEDS).forEach(async ([key, path]) => {
      const r = await chairmanFetch(path);
      if (!stop && r.data !== null) postToOffice(frame, 'DATA', { key, value: r.data });
    });
    const pullFast = () => Object.entries(FAST_FEEDS).forEach(async ([key, path]) => {
      const r = await chairmanFetch(path);
      if (!stop && !r.error) postToOffice(frame, 'DATA', { key, value: r.data });
    });
    pull(); const t = setInterval(pull, FEED_MS), f = setInterval(pullFast, FAST_MS);
    return () => { stop = true; clearInterval(t); clearInterval(f); };
  }, [frame, ready, signedIn]);
}

export interface OfficeAction { kind: string; href?: string; text?: string; transcript?: string; op?: string; id?: string; name?: string; month?: string; rupees?: number }

/** Board meeting player calls (office → shell → API). Replies go back as BOARDROOM {meeting, result?, error?}. */
async function boardroomOp(a: OfficeAction, frame: RefObject<HTMLIFrameElement | null>) {
  const id = encodeURIComponent(a.id ?? '');
  let r: { data: unknown; error: string | null } = { data: null, error: null };
  if (a.op === 'next') r = await chairmanFetch(`/boardroom/meetings/${id}/next`, { method: 'POST' });
  if (a.op === 'say' && a.text) r = await chairmanFetch(`/boardroom/meetings/${id}/say`, { method: 'POST', body: { text: a.text.slice(0, 1000) } });
  if (a.op === 'end') {
    if (!window.confirm('End the board meeting now? The summary is written from what was said so far.')) return;
    r = await chairmanFetch(`/boardroom/meetings/${id}/end`, { method: 'POST' });
  }
  if (a.op === 'briefed') r = await chairmanFetch(`/boardroom/meetings/${id}/briefed`, { method: 'POST' });
  if (a.op === 'pause' || a.op === 'resume') r = await chairmanFetch(`/boardroom/meetings/${id}/${a.op}`, { method: 'POST' });
  const active = await chairmanFetch('/boardroom/meetings/active');
  postToOffice(frame, 'BOARDROOM', { meeting: active.data, result: r.data, error: r.error });
  if (a.op === 'briefed') {
    const b = await chairmanFetch('/boardroom/briefing');
    if (b.data !== null) postToOffice(frame, 'DATA', { key: 'boardroomBriefing', value: b.data });
  }
}

/** The only things the office may ask the shell to do. Anything that changes company state asks the Chairman first. */
export async function runOfficeAction(a: OfficeAction, ctx: { frame: RefObject<HTMLIFrameElement | null>; push: (href: string) => void; signedIn: boolean }) {
  const reply = (text: string, from = 'Assistant') => postToOffice(ctx.frame, 'SPEECH', { from, text });
  switch (a.kind) {
    case 'open':
      if (a.href?.startsWith('/') && !a.href.startsWith('//')) ctx.push(a.href);
      return;
    case 'assistant': { // Part 16: the real assistant backend answers
      if (!a.text) return;
      if (!ctx.signedIn) return reply('Log in at your desk first and I can help with that.');
      const r = await chairmanFetch<{ response: string; intent?: string }>('/assistant/message', { method: 'POST', body: { message: a.text.slice(0, 2000) } });
      if (r.data?.intent === 'URGENT_BOARD_MEETING') void boardroomOp({ kind: 'boardroom', op: 'refresh' }, ctx.frame);
      return reply(r.data?.response ?? `Sorry, I couldn't reach the assistant service (${r.error ?? 'error'}).`);
    }
    case 'voice': { // Part 15: wake-word commands go to the existing voice command endpoint
      if (!a.transcript || !ctx.signedIn) return;
      const r = await chairmanFetch<{ response?: string; message?: string; naturalLanguageReply?: string; meetingId?: string }>('/voice/command', { method: 'POST', body: { transcript: a.transcript.slice(0, 500) } });
      if (r.data?.meetingId) void boardroomOp({ kind: 'boardroom', op: 'refresh' }, ctx.frame); // "urgent board meeting": everyone walks in now
      return reply(r.data?.naturalLanguageReply ?? r.data?.response ?? r.data?.message ?? r.error ?? 'Done.');
    }
    case 'employeeChat': { // item 31: talk to an employee in the office → short in-character reply, spoken in their voice
      if (!ctx.signedIn || !a.id) return reply('Log in at your desk first.');
      reply(`${a.name ?? 'They'} is thinking…`, 'System'); // #46: the local model takes 5-20 s; show that it's on its way
      const r = await chairmanFetch<{ name: string; reply: string; voice?: { pitch: number; speakingRate: number } | null }>(`/office/employees/${encodeURIComponent(a.id)}/chat`, { method: 'POST', body: { text: (a.text ?? '').slice(0, 500) } });
      if (r.data) return postToOffice(ctx.frame, 'SPEECH', { from: r.data.name, text: r.data.reply, speakerId: a.id, voice: r.data.voice });
      return reply(r.error ?? 'They didn’t answer.', 'System');
    }
    case 'boardroom':
      if (!ctx.signedIn) return reply('Log in at your desk first.');
      return boardroomOp(a, ctx.frame);
    case 'ceoCommand': { // Y key: direct command/question to the CEO, answered immediately
      if (!a.text) return;
      if (!ctx.signedIn) return reply('Log in at your desk first.');
      const r = await chairmanFetch<{ answer: string }>('/ceo/ask', { method: 'POST', body: { question: a.text.slice(0, 1000) } });
      return reply(r.data?.answer ?? `Couldn't reach the CEO (${r.error ?? 'error'}).`, 'CEO_ARIA');
    }
    case 'broadcast': { // V key: interrupt every active agent's current task and hand them the new command
      if (!a.text) return;
      if (!ctx.signedIn) return reply('Log in at your desk first.');
      const r = await chairmanFetch<{ broadcastTo: number }>('/chairman/broadcast', { method: 'POST', body: { text: a.text.slice(0, 1000) } });
      return reply(r.data ? `Broadcast sent to ${r.data.broadcastTo} employees.` : `Couldn't broadcast: ${r.error ?? 'error'}`, 'System');
    }
    case 'salesTarget': { // Sales screen click: the Chairman typed a target in the office; confirm, store as integer paise
      if (!ctx.signedIn) return reply('Log in at your desk first.');
      const paise = Math.round(Number(a.rupees) * 100);
      if (!a.month || !Number.isSafeInteger(paise) || paise <= 0) return reply('That target is not an amount in rupees.');
      if (!window.confirm(`Set the ${a.month} sales target to ₹${(paise / 100).toLocaleString('en-IN')}?`)) return;
      const r = await chairmanFetch('/office/screens/sales/target', { method: 'PUT', body: { month: a.month, amountPaise: paise } });
      if (r.error) return reply(`Couldn't set the target: ${r.error}`);
      const s = await chairmanFetch('/office/screens/sales');
      if (s.data !== null) postToOffice(ctx.frame, 'DATA', { key: 'screensSales', value: s.data });
      return reply(`Sales target for ${a.month} set.`);
    }
    case 'pauseSim':
    case 'resumeSim': { // Part 17 big red button: always confirmed by the Chairman
      if (!ctx.signedIn) return reply('Log in at your desk first.');
      const pause = a.kind === 'pauseSim';
      if (!window.confirm(pause ? 'Big red button: pause the company simulation?' : 'Resume the company simulation?')) return;
      const r = await chairmanFetch(pause ? '/simulation/pause' : '/simulation/resume', { method: 'POST' });
      postToOffice(ctx.frame, 'SIM_CONTROL', { ok: !r.error, paused: pause });
      return reply(r.error ? `Couldn't ${pause ? 'pause' : 'resume'}: ${r.error}` : pause ? 'Simulation paused.' : 'Simulation running again.', 'System');
    }
  }
}
