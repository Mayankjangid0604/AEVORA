import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { companyProfile } from '../config/company';

/**
 * Emails the Chairman about important company events (for now; WhatsApp/call later).
 * Recipient: CHAIRMAN_NOTIFY_EMAIL, else TEST_EMAIL_RECIPIENT. Uses the same SMTP settings as outreach.
 * Never throws — a mail failure must not break the business loop.
 */
export interface MailContent { subject: string; text: string; attachments?: { filename: string; content: Buffer; contentType?: string }[] }

const rupees = (p: number) => `₹${Math.round((p ?? 0) / 100).toLocaleString('en-IN')}`;

/** Event → email. Events not listed here are not mailed (e.g. lead.found, ceo.activity — too frequent). */
export const EMAIL_EVENTS: Record<string, (d: any) => MailContent> = {
  'employee.hired': (d) => ({
    subject: `CEO hired ${d.name} as ${d.role}`,
    text: `${d.name} joined as ${d.role}${d.department ? ` (${d.department})` : ''}.${d.project ? `\nFor project: ${d.project}` : ''}${d.reason ? `\nWhy: ${d.reason}` : ''}`,
  }),
  'staffing.room_full': (d) => ({ subject: d.subject ?? `Action needed: ${d.room} room is full`, text: d.message }),
  'assistant.alert': (d) => ({ subject: d.subject ?? 'Message from your Assistant', text: d.text ?? '' }),
  'ceo.question': (d) => ({ subject: `Your CEO is asking${d.urgency === 'HIGH' ? ' (urgent)' : ''}`, text: `${d.question}\n\nAnswer it in the AEVORA dashboard or tell your Assistant.` }),
  'ceo.report': (d) => ({
    subject: 'CEO morning report',
    text: `${d.report ?? ''}\n\nTop risk: ${d.topRisk ?? '-'}\nTop opportunity: ${d.topOpportunity ?? '-'}\n\n${(d.decisions ?? []).map((x: any) => `- ${x.type}: ${x.outcome}${x.detail ? ` — ${x.detail}` : ''}`).join('\n')}`,
  }),
  'ceo.weekly_report': (d) => ({ subject: 'CEO weekly report', text: [d.ceoCommentary, d.biggestChallenge && `Biggest challenge: ${d.biggestChallenge}`].filter(Boolean).join('\n\n') }),
  'ceo.goal_completed': (d) => ({ subject: `Goal Completed: ${d.title}`, text: `The CEO has completed the goal: ${d.title}\n\nFinal Report:\n${d.report ?? 'No report provided.'}` }),
  'ceo.goal_failed': (d) => ({ subject: `Goal Failed: ${d.title}`, text: `The CEO failed to complete the goal: ${d.title}\n\nReason:\n${d.reason ?? 'Unknown.'}` }),
  'payment.received': (d) => ({ subject: `Payment received: ${rupees(d.amountPaise)}`, text: `${rupees(d.amountPaise)} received${d.projectId ? ` for project ${d.projectId}` : ''}.` }),
  'lead.interested': (d) => ({ subject: `Lead interested: ${d.businessName}`, text: `${d.businessName} wants to talk.${d.feedback ? `\n\n${d.feedback}` : ''}` }),
  'inbound.interested': (d) => ({ subject: 'A lead replied — interested', text: `${d.feedback ?? 'A lead replied positively to our email.'}\n\nOpen the Inbox in AEVORA to see the reply and the suggested answer.` }),
  'inbound.revision': (d) => ({ subject: 'Client asked for changes', text: d.feedback ?? 'A client replied with revision requests.' }),
  'inbound.question': (d) => ({ subject: d.intent === 'ASKING_PRICE' ? 'Client asking price' : 'Client has a question', text: d.feedback ?? 'A reply needs your answer.' }),
  'company.shutdown': () => ({ subject: 'Company shut down — balance below minimum', text: 'Agents stopped. Deposit on the Survival page to restart.' }),
  'company.recovered': () => ({ subject: 'Company recovered', text: 'Balance is back above minimum; agents resumed.' }),
};

export class ChairmanMailer {
  private readonly logger = new Logger('ChairmanMailer');
  private transporter?: nodemailer.Transporter;

  get recipient() {
    return (process.env.CHAIRMAN_NOTIFY_EMAIL || process.env.TEST_EMAIL_RECIPIENT || '').trim();
  }

  get configured() {
    const u = process.env.SMTP_USER ?? '';
    return process.env.CHAIRMAN_EMAIL_NOTIFICATIONS !== 'false' && !!process.env.SMTP_HOST && !!u && !u.startsWith('your_') && !!process.env.SMTP_PASS && !!this.recipient;
  }

  /** Send and report exactly what happened (for the test endpoint). */
  async sendTo(to: string, m: MailContent): Promise<{ ok: boolean; to: string; messageId?: string; error?: string }> {
    const u = process.env.SMTP_USER ?? '';
    if (!process.env.SMTP_HOST || !u || u.startsWith('your_') || !process.env.SMTP_PASS) return { ok: false, to, error: 'SMTP_HOST / SMTP_USER / SMTP_PASS not set in .env' };
    try {
      this.transporter ??= nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: (process.env.SMTP_PASS ?? '').replace(/\s+/g, '') },
      });
      const info = await this.transporter.sendMail({ from: `"${process.env.OUTREACH_FROM_NAME ?? companyProfile().name}" <${u}>`, to, subject: `[AEVORA] ${m.subject}`, text: m.text });
      return { ok: true, to, messageId: info.messageId };
    } catch (e: any) {
      return { ok: false, to, error: String(e?.message ?? e).slice(0, 400) };
    }
  }

  /** Returns true when the mail was handed to SMTP. */
  async send(m: MailContent): Promise<boolean> {
    if (!this.configured) {
      this.logger.debug(`not configured — would email "${m.subject}"`);
      return false;
    }
    try {
      this.transporter ??= nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: (process.env.SMTP_PASS ?? '').replace(/\s+/g, '') }, // Gmail shows app passwords with spaces
      });
      await this.transporter.sendMail({
        from: `"AEVORA Assistant" <${process.env.SMTP_USER}>`,
        to: this.recipient,
        subject: `[AEVORA] ${m.subject}`.slice(0, 200),
        text: `${m.text}\n\n— Your AEVORA Assistant (${companyProfile().name})`,
        ...(m.attachments?.length ? { attachments: m.attachments } : {}),
      });
      this.logger.log(`Emailed Chairman: ${m.subject}`);
      return true;
    } catch (e: any) {
      this.logger.warn(`Chairman email failed (${m.subject}): ${e.message}`);
      return false;
    }
  }

  /** Raw send for Chairman Mail threads: exact subject/body, optional threading headers, returns the Message-ID. */
  async sendRaw(to: string, subject: string, text: string, inReplyTo?: string | null): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    const u = process.env.SMTP_USER ?? '';
    if (process.env.CHAIRMAN_EMAIL_NOTIFICATIONS === 'false') return { ok: false, error: 'CHAIRMAN_EMAIL_NOTIFICATIONS=false' };
    if (!process.env.SMTP_HOST || !u || u.startsWith('your_') || !process.env.SMTP_PASS || !to) return { ok: false, error: 'SMTP not configured' };
    try {
      this.transporter ??= nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: (process.env.SMTP_PASS ?? '').replace(/\s+/g, '') },
      });
      const info = await this.transporter.sendMail({
        from: `"AEVORA Assistant" <${u}>`,
        to,
        subject,
        text,
        ...(inReplyTo ? { inReplyTo, references: [inReplyTo] } : {}),
      });
      return { ok: true, messageId: info.messageId };
    } catch (e: any) {
      this.logger.warn(`Chairman email failed (${subject}): ${e.message}`);
      return { ok: false, error: String(e?.message ?? e).slice(0, 300) };
    }
  }

  /**
   * Chairman Mail (threads in the portal) registers itself here. When set, every realtime event goes through it
   * (stored as a thread + clear email); otherwise the plain EMAIL_EVENTS mail below is the fallback.
   */
  private sink?: (chairmanId: string, event: string, data: any) => Promise<unknown>;
  setSink(fn: (chairmanId: string, event: string, data: any) => Promise<unknown>) { this.sink = fn; }

  /** Mirror a realtime event to the Chairman (thread + email) when it's one the Chairman should hear about. */
  notifyEvent(event: string, data: any, chairmanId?: string) {
    if (this.sink && chairmanId) {
      this.sink(chairmanId, event, data).catch((e) => this.logger.warn(`Chairman Mail for ${event} failed: ${e.message}`));
      return;
    }
    const make = EMAIL_EVENTS[event];
    if (!make) return;
    let m: MailContent;
    try { m = make(data ?? {}); } catch { return; }
    void this.send(m);
  }
}

/** One shared instance: the gateway and services use the same SMTP connection. */
export const chairmanMailer = new ChairmanMailer();
