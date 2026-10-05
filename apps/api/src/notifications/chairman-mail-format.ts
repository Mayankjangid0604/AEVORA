/**
 * Chairman emails: one clear layout for every event —
 *   WHAT HAPPENED / WHY IT MATTERS / DETAILS / HOW TO ANSWER (quick replies)
 * The subject carries a reference ([AEV-1234]) so an email reply finds its thread.
 */

export interface MailDraft {
  category: string;            // Sales, Team, Office, CEO, Money, Reports
  title: string;               // one line, used in the subject and the portal list
  happened: string;            // plain explanation
  why?: string;                // why the Chairman is being told
  details?: Record<string, string | number | null | undefined>;
  quickReplies?: string[];     // things the Chairman can just reply with
  needsAnswer?: boolean;       // false = FYI only
}

const rupees = (p: number) => `₹${Math.round((p ?? 0) / 100).toLocaleString('en-IN')}`;
const INTENT_LABEL: Record<string, string> = {
  INTERESTED: 'is interested', ASKING_PRICE: 'is asking about price', QUESTION: 'has a question',
  APPROVAL: 'approved the work', REVISION: 'asked for changes', NOT_INTERESTED: 'is not interested',
};

/** `d` may carry `inbound` = { from, subject, body, draftReply, lead } loaded by the service. */
export const MAIL_TEMPLATES: Record<string, (d: any) => MailDraft | null> = {
  'employee.hired': (d) => ({
    category: 'Team',
    title: `New hire: ${d.name} (${d.role})`,
    happened: `Your CEO hired ${d.name} as ${d.role}${d.department ? ` in the ${d.department} room` : ''}${d.project ? ` to work on the client project "${d.project}"` : ''}.`,
    why: d.reason ? `Reason given by the CEO: ${d.reason}` : 'The CEO hires when a project or function has nobody free.',
    details: { Employee: d.name, Role: d.role, Room: d.department, Project: d.project },
    quickReplies: ['OK', 'Show me the team', 'Tell CEO: explain why we need this hire'],
    needsAnswer: false,
  }),
  'staffing.room_full': (d) => ({
    category: 'Office',
    title: d.subject ?? `${d.room} room is full`,
    happened: d.message,
    why: 'The CEO can only hire into rooms with free chairs. Until you add desks, current staff share the extra work.',
    details: { Room: d.room, 'Chairs used': `${d.used}/${d.chairs}`, 'Projects waiting': (d.projects ?? []).join(', ') },
    quickReplies: ['I will add desks', 'Tell CEO: share the work for now'],
    needsAnswer: true,
  }),
  'boardroom.meeting': (d) => d.notify ? ({
    category: 'Board',
    title: `${d.importance === 'URGENT' ? 'URGENT board meeting' : 'Board meeting'}: ${String(d.title ?? '').slice(0, 80)}`,
    happened: `A board meeting is set for ${d.scheduledAt ? new Date(d.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'soon'}.${d.agenda?.length ? `\n\nAgenda:\n${d.agenda.map((a: string, i: number) => `${i + 1}. ${a}`).join('\n')}` : ''}`,
    why: d.importance === 'HIGH' || d.importance === 'URGENT'
      ? 'If you don\'t answer before it starts, your Assistant will lead it and email you the summary.'
      : 'If you don\'t answer before it starts, it moves to the same time tomorrow.',
    details: { Importance: d.importance, Participants: d.participantCount },
    quickReplies: ['Join', 'Assistant leads', 'Reschedule'],
    needsAnswer: true,
  }) : null,
  'ceo.question': (d) => ({
    category: 'CEO',
    title: `Your CEO asks: ${String(d.question ?? '').slice(0, 90)}`,
    happened: `ARIA (your CEO) needs your decision:\n\n"${d.question}"`,
    why: d.context?.reason ? `Context: ${d.context.reason}` : 'The CEO escalates decisions it should not take alone.',
    details: { Urgency: d.urgency },
    quickReplies: ['Yes, go ahead', 'No', 'Wait until next week'],
    needsAnswer: true,
  }),
  'ceo.report': (d) => ({
    category: 'Reports',
    title: 'CEO morning report',
    happened: d.report ?? 'The CEO sent a report.',
    details: { 'Top risk': d.topRisk, 'Top opportunity': d.topOpportunity, Actions: (d.decisions ?? []).map((x: any) => `${x.type}: ${x.outcome}`).join('; ') },
    quickReplies: ['OK', 'Ask CEO: what should I focus on today?'],
    needsAnswer: false,
  }),
  'ceo.weekly_report': (d) => ({
    category: 'Reports',
    title: 'CEO weekly report',
    happened: d.ceoCommentary ?? 'The weekly report is ready.',
    details: { 'Biggest challenge': d.biggestChallenge, 'Deals won': d.dealsWonCount, Revenue: d.revenueEarnedPaise != null ? rupees(d.revenueEarnedPaise) : null },
    quickReplies: ['OK', 'Ask CEO: what is the plan for next week?'],
    needsAnswer: false,
  }),
  'payment.received': (d) => ({
    category: 'Money',
    title: `Payment received: ${rupees(d.amountPaise)}`,
    happened: `A client paid ${rupees(d.amountPaise)}${d.clientName ? ` (${d.clientName})` : ''}.`,
    details: { Amount: rupees(d.amountPaise), Project: d.clientName ?? d.projectId },
    quickReplies: ['OK', 'Check revenue'],
    needsAnswer: false,
  }),
  // A lead/client replied to our email. `d.inbound` holds the actual message and the drafted answer.
  'inbound.interested': (d) => inboundDraft(d, 'Sales'),
  'inbound.question': (d) => inboundDraft(d, 'Sales'),
  'inbound.revision': (d) => inboundDraft(d, 'Delivery'),
  // Already covered by inbound.interested when it comes from an email reply.
  'lead.interested': (d) => (d.source === 'EMAIL_REPLY' ? null : {
    category: 'Sales',
    title: `Lead interested: ${d.businessName}`,
    happened: `${d.businessName} showed interest${d.summary ? `: ${d.summary}` : '.'}`,
    quickReplies: ['Tell CEO: follow up today'],
    needsAnswer: false,
  }),
  'company.shutdown': () => ({
    category: 'Money', title: 'Company paused — balance below minimum',
    happened: 'The bank balance fell below the survival minimum, so all agents stopped working.',
    why: 'Nothing runs until you add money.', quickReplies: ['I will deposit today'], needsAnswer: true,
  }),
  'company.recovered': () => ({ category: 'Money', title: 'Company running again', happened: 'The balance is back above the minimum; agents resumed.', needsAnswer: false }),
};

function inboundDraft(d: any, category: string): MailDraft {
  const m = d.inbound ?? {};
  const who = m.lead?.name ?? m.from ?? 'A lead';
  return {
    category,
    title: `${who} ${INTENT_LABEL[d.intent] ?? 'replied'}`,
    happened: `${who} replied to our email${m.subject ? ` "${m.subject}"` : ''}.\n\nTheir message:\n"${String(m.body ?? d.feedback ?? '').trim().slice(0, 1200)}"`,
    why: d.feedback ? `Summary: ${d.feedback}` : undefined,
    details: { Lead: m.lead?.name, From: m.from, 'Reply type': (d.intent ?? '').replace(/_/g, ' ').toLowerCase() || null },
    quickReplies: m.draftReply
      ? [`SEND — sends this drafted answer to ${who}:\n  "${String(m.draftReply).trim().slice(0, 600)}"`, 'REPLY: <your own text> — sends your text to the client instead', 'IGNORE']
      : ['REPLY: <your text> — sends your text to the client', 'IGNORE'],
    needsAnswer: true,
  };
}

/** The email body. */
export function renderMail(draft: MailDraft, ref: string, portalUrl: string, chairmanName = 'Chairman'): string {
  const lines = [`Hi ${chairmanName.split(' ')[0]},`, '', 'WHAT HAPPENED', draft.happened];
  if (draft.why) lines.push('', 'WHY YOU ARE GETTING THIS', draft.why);
  const det = Object.entries(draft.details ?? {}).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');
  if (det.length) lines.push('', 'DETAILS', ...det.map(([k, v]) => `- ${k}: ${v}`));
  lines.push('', draft.needsAnswer ? 'YOUR ANSWER IS NEEDED' : 'NO ACTION NEEDED (for your information)');
  lines.push('Reply to this email in plain words, or answer in AEVORA → Chairman Mail (text or voice).');
  if (draft.quickReplies?.length) lines.push('You can simply reply with:', ...draft.quickReplies.map((q) => `- ${q}`));
  lines.push('', `Open in portal: ${portalUrl}/chairman-mail?ref=${ref}`, `Reference: ${ref}`, '', '— Your AEVORA Assistant');
  return lines.join('\n');
}

export const mailSubject = (draft: MailDraft, ref: string) => `[AEVORA ${ref}] ${draft.category}: ${draft.title}`.slice(0, 180);

/** AEV-xxxx from a subject like "Re: [AEVORA AEV-4821] Sales: …". */
export const refFromSubject = (s?: string | null) => s?.match(/\bAEV-\d{4,6}\b/)?.[0] ?? null;

/** The Chairman's new text from an email reply (drops the quoted original and signatures). */
export function stripQuotedReply(text: string): string {
  const out: string[] = [];
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (/^On .+wrote:\s*$/.test(line.trim()) || /^-{2,}\s*Original Message/i.test(line.trim()) || /^From: .+/.test(line.trim())) break;
    if (line.trim().startsWith('>')) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n--\s*\n[\s\S]*$/, '').trim();
}
