import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ModelGateway, ModelTier } from '@aevora/model-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../devices/realtime.gateway';
import { IntegrationService } from '../integration/integration.service';
import { emailSignature, outreachEnv } from './email-outreach.service';
import { parseJson } from '../common/parse-json';
import { companyProfile } from '../config/company';

export const CLIENT_INTENTS = [
  'INTERESTED',
  'NOT_INTERESTED',
  'REVISION',
  'QUESTION',
  'ASKING_PRICE',
  'APPROVAL',
  'SPAM',
  'UNKNOWN',
  'REQUESTING_CALL',
  'REQUESTING_MEETING',
  'PROVIDING_REQUIREMENTS',
  'CLARIFICATION_REQUIRED',
  'REQUIREMENTS_CONFIRMED',
  'PROPOSAL_REQUESTED',
  'PROPOSAL_SENT',
  'PROPOSAL_ACCEPTED',
  'PAYMENT_REQUIRED',
  'PAYMENT_CONFIRMED',
  'PROJECT_READY',
  'DEVELOPMENT_STARTED',
  'DEVELOPMENT_COMPLETE',
  'TESTING',
  'DELIVERED',
  'CLIENT_ACCEPTED',
  'COMPLETED',
] as const;
export type ClientIntent = (typeof CLIENT_INTENTS)[number];

export interface Classification {
  intent: ClientIntent;
  confidence: number;
  feedback: string | null;
  draftReply: string | null;
}

const INTENT_SYSTEM = () => `You classify a client reply to a sales outreach or demo delivery email from ${companyProfile().name},
a web development company headquartered in ${companyProfile().address || 'India'}, serving clients in India and abroad.
Return JSON only: {"intent": string, "confidence": number 0-1, "feedback": string|null, "draftReply": string|null}
intent is one of:
- INTERESTED: wants to proceed, learn more
- REQUESTING_CALL: wants to schedule a call
- REQUESTING_MEETING: wants to schedule a meeting
- PROVIDING_REQUIREMENTS: gives details of what they need built
- CLARIFICATION_REQUIRED: needs clarification on something
- REQUIREMENTS_CONFIRMED: agrees with the gathered requirements
- PROPOSAL_REQUESTED: asks for a formal proposal
- PROPOSAL_SENT: (internal)
- PROPOSAL_ACCEPTED: accepts the proposal
- PAYMENT_REQUIRED: asking how to pay
- PAYMENT_CONFIRMED: confirmed they have paid
- ASKING_PRICE: asking about cost, price, packages
- QUESTION: any other question
- REVISION: requesting changes to a demo/sample
- APPROVAL: approving the sample as-is
- CLIENT_ACCEPTED: confirms the final project delivery is accepted
- NOT_INTERESTED: declining, not needed
- SPAM: automated or irrelevant message
- UNKNOWN: can't determine
"feedback": the specific change request if REVISION, otherwise a one-sentence summary.
"draftReply": a short, friendly Hinglish reply answering it or suggesting next steps (only for intents needing a reply).
(services: websites from Rs8,000, automation from Rs5,000, custom software from Rs15,000; free consultation).
If they ask for pricing, give the starting price and ask about specific requirements. If they want a meeting/call, suggest some times.
No greeting sign-off or name at the end — the signature is added automatically. Otherwise null.`;

const INBOX_WINDOW_DAYS = 7;
const MAX_PER_CHECK = 50;

export interface InboxCheckResult {
  checked: number;
  newMessages: number;
  classified: number;
  skipped?: string;
}

/** Cheap rules before the model: auto-replies are SPAM, "unsubscribe" means stop contacting. */
/** Bundled + system CA certificates (Node ≥ 22.15 / 23.8); undefined = Node's default. */
export function trustedCAs(): string[] | undefined {
  const tls = require('tls');
  if (typeof tls.getCACertificates !== 'function') return undefined;
  try {
    return [...new Set<string>([...tls.getCACertificates('default'), ...tls.getCACertificates('system')])];
  } catch {
    return undefined;
  }
}

/** "Re: Exclusive Proposal for Bhandari Jewellers" → "Bhandari Jewellers". */
export function replySubjectBusiness(subject?: string): string | null {
  const m = subject?.match(/^(?:\s*(?:re|fwd?|aw)\s*:\s*)+(?:exclusive proposal for|quick idea for|idea for)\s+(.+?)\s*$/i);
  return m ? m[1] : null;
}

export function precheck(subject: string | undefined, body: string, headers: { autoSubmitted?: string } = {}): Classification | null {
  const text = `${subject ?? ''}\n${body}`.toLowerCase();
  const auto = headers.autoSubmitted && headers.autoSubmitted.toLowerCase() !== 'no';
  if (auto || /\b(out of (the )?office|automatic reply|auto-?reply|delivery status notification|undeliverable)\b/.test(text)) {
    return { intent: 'SPAM', confidence: 0.95, feedback: 'Automated message', draftReply: null };
  }
  if (/\bunsubscribe\b|\bstop (emailing|sending)\b/.test(text)) {
    return { intent: 'NOT_INTERESTED', confidence: 0.9, feedback: 'Asked to stop receiving emails', draftReply: null };
  }
  if (body.trim().length < 2) return { intent: 'UNKNOWN', confidence: 0.3, feedback: 'Empty reply', draftReply: null };
  return null;
}

/** Model output → a safe classification: unknown intents become UNKNOWN, drafts only where a reply is expected. */
export function normalizeClassification(raw: any): Classification {
  const intent: ClientIntent = CLIENT_INTENTS.includes(raw?.intent) ? raw.intent : 'UNKNOWN';
  const c = Number(raw?.confidence);
  const draft = typeof raw?.draftReply === 'string' && raw.draftReply.trim() ? raw.draftReply.trim() : null;
  return {
    intent,
    confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0.5,
    feedback: typeof raw?.feedback === 'string' && raw.feedback.trim() ? raw.feedback.trim() : null,
    draftReply: ['QUESTION', 'ASKING_PRICE', 'INTERESTED'].includes(intent) ? draft : null,
  };
}

@Injectable()
export class InboundMessageService {
  private readonly logger = new Logger(InboundMessageService.name);
  private readonly gateway = new ModelGateway();
  private checking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly integration: IntegrationService,
  ) {}

  async classify(subject: string | undefined, body: string, headers?: { autoSubmitted?: string }): Promise<Classification> {
    const quick = precheck(subject, body, headers);
    if (quick) return quick;
    try {
      const raw = await this.gateway.callWithTier(
        ModelTier.LOCAL_BASIC,
        `Subject: ${subject ?? '(none)'}\nBody:\n"""\n${body.slice(0, 4000)}\n"""`,
        INTENT_SYSTEM(),
        { json: true },
      );
      return normalizeClassification(parseJson(raw));
    } catch (e) {
      this.logger.warn(`Intent classification failed: ${e.message}`);
      return normalizeClassification(null);
    }
  }

  /**
   * Ingest a reply from email or WhatsApp (also used by POST /sales-outreach/inbound). Matches the lead by address,
   * classifies, acts. With a messageId it is idempotent: a message already stored is returned untouched.
   */
  async ingest(
    companyId: string,
    channel: 'EMAIL' | 'WHATSAPP',
    fromAddress: string,
    body: string,
    subject?: string,
    opts: { messageId?: string; receivedAt?: Date; autoSubmitted?: string; lead?: { id: string } | null } = {},
  ) {
    if (opts.messageId) {
      const existing = await this.prisma.inboundMessage.findUnique({ where: { companyId_messageId: { companyId, messageId: opts.messageId } } });
      if (existing) return existing;
    }

    const lead = opts.lead !== undefined ? opts.lead : await this.findLead(companyId, fromAddress);
    const campaign = lead
      ? await this.prisma.outreachCampaign.findFirst({
          where: { companyId, leadId: lead.id, status: { in: ['SENT', 'SCHEDULED', 'RESPONDED'] } },
          orderBy: { sentAt: 'desc' },
        })
      : null;

    const c = await this.classify(subject, body, { autoSubmitted: opts.autoSubmitted });

    let msg;
    try {
      msg = await this.prisma.inboundMessage.create({
        data: {
          companyId,
          leadId: lead?.id,
          campaignId: campaign?.id,
          channel,
          fromAddress,
          subject,
          body: body.slice(0, 20000),
          extractedIntent: c.intent,
          confidence: c.confidence,
          draftReply: c.draftReply,
          messageId: opts.messageId,
          receivedAt: opts.receivedAt ?? new Date(),
          metadata: { feedback: c.feedback },
        },
      });
    } catch (e) {
      // A concurrent check stored the same email first.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && opts.messageId) {
        return this.prisma.inboundMessage.findUniqueOrThrow({ where: { companyId_messageId: { companyId, messageId: opts.messageId } } });
      }
      throw e;
    }

    await this.processIntent(companyId, msg.id, c, lead?.id, campaign?.id);
    return msg;
  }

  /**
   * Which lead is this email a reply to? Exact first: its In-Reply-To/References header points at the Message-ID
   * of an outreach email we sent. Then the "Re: Exclusive Proposal for <business>" subject. Last, the sender address
   * (ambiguous in demo mode, where every lead shares one inbox).
   */
  async findLeadForReply(companyId: string, from: string, m: { inReplyTo?: string; references?: string | string[]; subject?: string }) {
    const ids = [m.inReplyTo, ...(Array.isArray(m.references) ? m.references : m.references ? m.references.split(/\s+/) : [])]
      .filter(Boolean).map((x) => `<${String(x).trim().replace(/^<|>$/g, '')}>`);
    if (ids.length) {
      const c = await this.prisma.outreachCampaign.findFirst({ where: { companyId, emailMessageId: { in: ids } }, include: { lead: { select: { id: true, name: true } } } });
      if (c) return c.lead;
    }
    const name = replySubjectBusiness(m.subject);
    if (name) {
      const byName = await this.prisma.salesLead.findFirst({
        where: { companyId, name: { equals: name, mode: 'insensitive' }, outreachCampaigns: { some: { status: { in: ['SENT', 'RESPONDED'] } } } },
        select: { id: true, name: true },
      });
      if (byName) return byName;
    }
    return this.findLead(companyId, from);
  }

  private findLead(companyId: string, fromAddress: string) {
    const digits = fromAddress.replace(/[^0-9]/g, '').slice(-10);
    return this.prisma.salesLead.findFirst({
      where: {
        companyId,
        OR: [
          { contactEmail: { equals: fromAddress, mode: 'insensitive' } },
          ...(digits.length === 10 ? [{ contactPhone: { contains: digits } }] : []),
        ],
      },
      select: { id: true, name: true },
    });
  }

  private async processIntent(companyId: string, messageId: string, c: Classification, leadId?: string, campaignId?: string) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { chairmanId: true } });
    const lead = leadId ? await this.prisma.salesLead.findUnique({ where: { id: leadId }, select: { name: true } }) : null;
    let status: 'PROCESSED' | 'IGNORED' | 'REPLIED' = 'PROCESSED';

    switch (c.intent) {
      case 'INTERESTED':
      case 'APPROVAL':
        if (campaignId) {
          await this.prisma.outreachCampaign.update({
            where: { id: campaignId },
            data: { outcome: c.intent === 'APPROVAL' ? 'BOOKED' : 'INTERESTED', status: 'RESPONDED', responseReceivedAt: new Date() },
          });
        }
        if (leadId) {
          await this.prisma.salesLead.update({ where: { id: leadId }, data: { status: 'QUALIFIED' } });
          if (c.intent === 'INTERESTED' && campaignId) {
            // One discovery call per campaign (campaignId is unique on DiscoveryCall).
            await this.prisma.discoveryCall.upsert({ where: { campaignId }, update: {}, create: { companyId, leadId, campaignId } });
          }
        }
        this.realtime.broadcastToUser(company.chairmanId, 'inbound.interested', { messageId, leadId, intent: c.intent, feedback: c.feedback });
        if (lead) this.realtime.broadcastToUser(company.chairmanId, 'lead.interested', { leadId, businessName: lead.name, source: 'EMAIL_REPLY', summary: c.feedback });
        
        if (c.intent === 'INTERESTED' && c.draftReply && process.env.SALES_AUTO_PROCESS === 'true') {
          await this.sendReply(companyId, messageId, c.draftReply)
            .then(() => { status = 'REPLIED'; })
            .catch((e) => this.logger.error(`Failed to auto-reply to INTERESTED: ${e.message}`));
        }
        break;

      case 'REQUESTING_CALL':
      case 'REQUESTING_MEETING':
        if (leadId) {
          await this.prisma.salesLead.update({ where: { id: leadId }, data: { status: 'QUALIFIED' } });
          // Ensure there's a discovery call record
          const existingCall = await this.prisma.discoveryCall.findFirst({ where: { leadId, companyId } });
          if (!existingCall) {
            await this.prisma.discoveryCall.create({ data: { companyId, leadId, status: 'SCHEDULED' } });
          } else {
            await this.prisma.discoveryCall.update({ where: { id: existingCall.id }, data: { status: 'SCHEDULED' } });
          }
        }
        this.realtime.broadcastToUser(company.chairmanId, 'inbound.meeting_requested', { messageId, leadId, intent: c.intent, feedback: c.feedback });
        if (c.draftReply && process.env.SALES_AUTO_PROCESS === 'true') {
          await this.sendReply(companyId, messageId, c.draftReply)
            .then(() => { status = 'REPLIED'; })
            .catch((e) => this.logger.error(`Failed to auto-reply to meeting request: ${e.message}`));
        }
        break;

      case 'PROVIDING_REQUIREMENTS':
      case 'REQUIREMENTS_CONFIRMED':
        if (leadId) {
          const opp = await this.prisma.opportunity.findFirst({ where: { salesLeadId: leadId, companyId } });
          if (opp && opp.salesStage === 'DISCOVERY') {
            await this.prisma.opportunity.update({ where: { id: opp.id }, data: { salesStage: 'SOLUTION' } });
          }
        }
        this.realtime.broadcastToUser(company.chairmanId, 'inbound.requirements', { messageId, leadId, intent: c.intent, feedback: c.feedback });
        if (c.draftReply && process.env.SALES_AUTO_PROCESS === 'true') {
          await this.sendReply(companyId, messageId, c.draftReply)
            .then(() => { status = 'REPLIED'; })
            .catch((e) => this.logger.error(`Failed to auto-reply to requirements: ${e.message}`));
        }
        break;

      case 'REVISION':
      case 'CLARIFICATION_REQUIRED':
        if (leadId && c.feedback) {
          const project = await this.prisma.clientProject.findFirst({ where: { companyId, leadId, status: 'SAMPLE_SENT' } });
          if (project) {
            const req = (project.requirements ?? {}) as any;
            await this.prisma.clientProject.update({
              where: { id: project.id },
              data: {
                status: 'REVISION',
                revisionCount: { increment: 1 },
                requirements: { ...req, revisions: [...(req.revisions ?? []), { feedback: c.feedback, at: new Date().toISOString(), source: 'inbound' }] },
              },
            });
            this.logger.log(`Auto-queued revision for project ${project.id} from inbound message`);
          }
        }
        this.realtime.broadcastToUser(company.chairmanId, 'inbound.revision', { messageId, leadId, feedback: c.feedback });
        if (c.draftReply && process.env.SALES_AUTO_PROCESS === 'true') {
          await this.sendReply(companyId, messageId, c.draftReply).then(() => { status = 'REPLIED'; }).catch(() => {});
        }
        break;

      case 'PROPOSAL_REQUESTED':
      case 'PROPOSAL_ACCEPTED':
      case 'PROPOSAL_SENT':
      case 'CLIENT_ACCEPTED':
        if (leadId) {
          const opp = await this.prisma.opportunity.findFirst({ where: { salesLeadId: leadId, companyId } });
          if (opp) {
            const nextStage = c.intent === 'PROPOSAL_ACCEPTED' || c.intent === 'CLIENT_ACCEPTED' ? 'NEGOTIATION' : 'PROPOSAL';
            await this.prisma.opportunity.update({ where: { id: opp.id }, data: { salesStage: nextStage } });
          }
        }
        this.realtime.broadcastToUser(company.chairmanId, 'inbound.proposal', { messageId, leadId, intent: c.intent });
        if (c.draftReply && process.env.SALES_AUTO_PROCESS === 'true') {
          await this.sendReply(companyId, messageId, c.draftReply).then(() => { status = 'REPLIED'; }).catch(() => {});
        }
        break;

      case 'NOT_INTERESTED':
        if (campaignId) {
          await this.prisma.outreachCampaign.update({
            where: { id: campaignId },
            data: { outcome: 'NOT_INTERESTED', status: 'CLOSED', responseReceivedAt: new Date() },
          });
        }
        if (leadId) await this.prisma.salesLead.update({ where: { id: leadId }, data: { status: 'DISQUALIFIED' } });
        break;

      case 'QUESTION':
      case 'ASKING_PRICE':
      case 'PAYMENT_REQUIRED':
      case 'PAYMENT_CONFIRMED':
      case 'PROJECT_READY':
      case 'DEVELOPMENT_STARTED':
      case 'DEVELOPMENT_COMPLETE':
      case 'TESTING':
      case 'DELIVERED':
      case 'COMPLETED':
        this.realtime.broadcastToUser(company.chairmanId, 'inbound.update', { messageId, leadId, intent: c.intent, feedback: c.feedback });
        
        if (c.draftReply && process.env.SALES_AUTO_PROCESS === 'true') {
          await this.sendReply(companyId, messageId, c.draftReply)
            .then(() => { status = 'REPLIED'; })
            .catch((e) => this.logger.error(`Failed to auto-reply to ${c.intent}: ${e.message}`));
        }
        break;

      case 'SPAM':
      case 'UNKNOWN':
      default:
        status = 'IGNORED';
        break;
    }

    await this.prisma.inboundMessage.update({ where: { id: messageId }, data: { status, processedAt: new Date() } });
  }

  /**
   * Reads the last 7 days of Gmail (read or unread — Gmail's seen flags are left alone) and ingests replies
   * from known leads only, deduped by Message-ID. Other mail in the inbox is never stored or sent to the model.
   * Off unless INBOX_ENABLED=true.
   */
  async pollEmailInbox(companyId: string): Promise<InboxCheckResult & { polled: number }> {
    const r = await this.checkInbox(companyId);
    return { ...r, polled: r.newMessages };
  }

  async checkInbox(companyId: string): Promise<InboxCheckResult> {
    if (process.env.INBOX_ENABLED !== 'true') return { checked: 0, newMessages: 0, classified: 0, skipped: 'INBOX_ENABLED is not true' };
    const user = (process.env.IMAP_USER || process.env.SMTP_USER || '').trim(); // empty IMAP_USER= falls back too
    const password = (process.env.IMAP_PASS || process.env.SMTP_PASS || '').replace(/\s+/g, ''); // Gmail shows app passwords with spaces
    if (!user || !password) return { checked: 0, newMessages: 0, classified: 0, skipped: 'IMAP credentials not set (SMTP_USER / SMTP_PASS)' };
    if (this.checking) return { checked: 0, newMessages: 0, classified: 0, skipped: 'a check is already running' };

    this.checking = true;
    try {
      const mails = await this.fetchRecent(user, password);
      let newMessages = 0;
      const own = user.toLowerCase();
      const known = new Set(
        (await this.prisma.inboundMessage.findMany({
          where: { companyId, messageId: { in: mails.map((m) => m.messageId).filter(Boolean) as string[] } },
          select: { messageId: true },
        })).map((m) => m.messageId),
      );

      for (const m of mails) {
        const from = m.from?.value?.[0]?.address?.toLowerCase();
        const messageId: string = m.messageId || `${m.date?.getTime() ?? 0}-${from}`;
        if (!from || from === own || known.has(messageId)) continue;
        const lead = await this.findLeadForReply(companyId, from, m);
        if (!lead) continue; // not a reply from a lead — never stored or classified
        try {
          await this.ingest(companyId, 'EMAIL', from, m.text ?? '', m.subject, {
            messageId,
            receivedAt: m.date ?? new Date(),
            autoSubmitted: m.headers?.get?.('auto-submitted') as string | undefined,
            lead,
          });
          newMessages++;
        } catch (e) {
          this.logger.error(`[${companyId}] failed to ingest email from ${from}: ${e.message}`);
        }
      }
      this.logger.log(`[${companyId}] inbox: ${mails.length} emails scanned, ${newMessages} new lead replies`);
      return { checked: mails.length, newMessages, classified: newMessages };
    } catch (e) {
      this.logger.error(`[${companyId}] inbox check failed: ${e.message}`);
      return { checked: 0, newMessages: 0, classified: 0, skipped: `IMAP error: ${e.message}` };
    } finally {
      this.checking = false;
    }
  }

  /** Last MAX_PER_CHECK messages of the window, opened read-only so Gmail's read/unread state is untouched. */
  private fetchRecent(user: string, password: string): Promise<any[]> {
    const Imap = require('imap');
    const { simpleParser } = require('mailparser');
    const imap = new Imap({
      user,
      password,
      host: process.env.IMAP_HOST || 'imap.gmail.com',
      port: Number(process.env.IMAP_PORT ?? 993),
      tls: true,
      // Trust Node's bundled CAs *and* the OS certificate store (Windows antivirus that scans mail re-signs TLS
      // with its own root, installed only in Windows). Verification stays on.
      tlsOptions: { servername: process.env.IMAP_HOST || 'imap.gmail.com', ca: trustedCAs() },
      connTimeout: 30_000,
      authTimeout: 15_000,
    });

    return new Promise((resolve, reject) => {
      const done = (err: Error | null, mails: any[] = []) => {
        clearTimeout(timer);
        imap.end();
        if (err) reject(err); else resolve(mails);
      };
      const timer = setTimeout(() => done(new Error('IMAP timed out after 60 s')), 60_000);

      imap.once('error', (err: Error) => done(err));
      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err: Error) => {
          if (err) return done(err);
          imap.search([['SINCE', new Date(Date.now() - INBOX_WINDOW_DAYS * 86_400_000)]], (err: Error, uids: number[]) => {
            if (err) return done(err);
            if (!uids?.length) return done(null, []);
            const parsing: Promise<any>[] = [];
            const f = imap.fetch(uids.slice(-MAX_PER_CHECK), { bodies: '' });
            f.on('message', (msg: any) => msg.on('body', (stream: any) => parsing.push(simpleParser(stream).catch(() => null))));
            f.once('error', (err: Error) => done(err));
            f.once('end', () => Promise.all(parsing).then((mails) => done(null, mails.filter(Boolean))));
          });
        });
      });
      imap.connect();
    });
  }

  list(companyId: string, status?: string) {
    const s = ['NEW', 'PROCESSED', 'REPLIED', 'IGNORED'].includes(status ?? '') ? (status as any) : undefined;
    return this.prisma.inboundMessage.findMany({
      where: { companyId, ...(s ? { status: s } : {}) },
      include: { lead: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** List unprocessed inbound messages (existing /sales-outreach/inbound endpoint). */
  listNew(companyId: string) {
    return this.list(companyId, 'NEW');
  }

  unreadCount(companyId: string) {
    return this.prisma.inboundMessage.count({ where: { companyId, status: { in: ['NEW', 'PROCESSED'] } } });
  }

  /** Sends the (edited) reply through IntegrationService — same kill switches and test-recipient safeguards as outreach. */
  async sendReply(companyId: string, id: string, replyText: string) {
    const msg = await this.prisma.inboundMessage.findFirst({ where: { id, companyId } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.channel !== 'EMAIL') throw new BadRequestException('Only email replies can be sent from here');
    if (msg.status === 'REPLIED') throw new BadRequestException('Already replied');
    const subject = msg.subject?.toLowerCase().startsWith('re:') ? msg.subject : `Re: ${msg.subject ?? 'Your enquiry'}`;
    const res = await this.integration.sendEmail(companyId, outreachEnv(), { to: msg.fromAddress, subject, body: `${replyText}\n\n${emailSignature()}` });
    if (!res.success) throw new BadRequestException(`Reply not sent: ${res.message ?? 'email provider error'}`);
    return this.prisma.inboundMessage.update({ where: { id }, data: { status: 'REPLIED', replySentAt: new Date(), draftReply: replyText } });
  }

  async ignore(companyId: string, id: string) {
    const r = await this.prisma.inboundMessage.updateMany({ where: { id, companyId }, data: { status: 'IGNORED' } });
    if (!r.count) throw new NotFoundException('Message not found');
    return { ignored: true };
  }
}
