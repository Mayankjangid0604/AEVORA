import { BoardroomService } from '../boardroom/boardroom.service';
import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssistantService } from '../assistant/assistant.service';
import { InboundMessageService } from '../sales-outreach/inbound-message.service';
import { CeoDialogueService } from '../ceo/ceo-dialogue.service';
import { chairmanMailer } from './chairman-mailer';
import { MAIL_TEMPLATES, MailDraft, mailSubject, refFromSubject, renderMail, stripQuotedReply } from './chairman-mail-format';
import { fetchMail, imapCredentials } from './imap-fetch';

export type ReplyChannel = 'EMAIL' | 'PORTAL_TEXT' | 'PORTAL_VOICE';
const DAY = 86_400_000;
const FYI_ACK = /^\s*(ok(ay)?|thanks?|thank you|noted|fine|good|great|👍|done)\s*[.!]*\s*$/i;

/**
 * Chairman Mail: every notification is a thread (portal section + a clear email). The Chairman answers by
 * replying to the email or in the portal (text/voice); the answer is acted on — a lead reply is sent, a CEO
 * question is answered, anything else goes to the Assistant as an order.
 */
@Injectable()
export class ChairmanMailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChairmanMailService.name);
  private timer?: NodeJS.Timeout;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly assistant: AssistantService,
    private readonly inbound: InboundMessageService,
    private readonly dialogue: CeoDialogueService,
    private readonly boardroom: BoardroomService,
  ) {}

  onModuleInit() {
    chairmanMailer.setSink((chairmanId, event, data) => this.createFromEvent(chairmanId, event, data));
    const everyMs = Number(process.env.CHAIRMAN_MAIL_POLL_MS ?? 120_000);
    this.timer = setInterval(() => { this.pollEmailReplies().catch((e) => this.logger.warn(`Chairman mail poll failed: ${e.message}`)); }, everyMs);
    this.timer.unref?.();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private portalUrl() { return (process.env.PORTAL_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001').replace(/\/$/, ''); }

  /** Realtime event → thread + email. Events without a template are ignored. */
  async createFromEvent(chairmanId: string, event: string, data: any) {
    const make = MAIL_TEMPLATES[event];
    if (!make) return null;
    const company = await this.prisma.company.findFirst({ where: { chairmanId }, select: { id: true } });
    if (!company) return null;
    // Lead replies: load the actual message and the drafted answer so the email is self-explanatory.
    if (event.startsWith('inbound.') && data?.messageId) {
      const m = await this.prisma.inboundMessage.findFirst({ where: { id: data.messageId, companyId: company.id }, include: { lead: { select: { name: true } } } });
      if (m) data = { ...data, inbound: { from: m.fromAddress, subject: m.subject, body: m.body, draftReply: m.draftReply, lead: m.lead } };
    }
    const draft = make(data ?? {});
    if (!draft) return null;
    return this.create(company.id, event, draft, data ?? {});
  }

  async create(companyId: string, event: string, draft: MailDraft, data: any) {
    let mail;
    for (let i = 0; i < 5 && !mail; i++) {
      const ref = `AEV-${Math.floor(1000 + Math.random() * 9000)}${i > 2 ? Math.floor(Math.random() * 10) : ''}`;
      try {
        mail = await this.prisma.chairmanMail.create({
          data: { companyId, ref, event, category: draft.category, title: draft.title.slice(0, 200), body: '', data: JSON.parse(JSON.stringify(data ?? {})) },
        });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    if (!mail) throw new Error('could not allocate a mail reference');
    const chairman = await this.prisma.company.findUnique({ where: { id: companyId }, select: { chairman: { select: { name: true } } } });
    const body = renderMail(draft, mail.ref, this.portalUrl(), (chairman?.chairman?.name && chairman.chairman.name !== 'Chairman' ? chairman.chairman.name : process.env.CHAIRMAN_NAME) || 'Chairman');
    const to = chairmanMailer.recipient;
    const sent = to ? await chairmanMailer.sendRaw(to, mailSubject(draft, mail.ref), body) : { ok: false as const, error: 'no CHAIRMAN_NOTIFY_EMAIL' };
    return this.prisma.chairmanMail.update({
      where: { id: mail.id },
      data: { body, ...(sent.ok ? { emailMessageId: normId(sent.messageId), emailedAt: new Date() } : {}) },
    });
  }

  list(companyId: string, status?: string) {
    return this.prisma.chairmanMail.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, ref: true, category: true, title: true, status: true, readAt: true, createdAt: true, event: true, _count: { select: { messages: true } } },
    });
  }

  async unreadCount(companyId: string) {
    return { count: await this.prisma.chairmanMail.count({ where: { companyId, readAt: null } }) };
  }

  async get(companyId: string, idOrRef: string) {
    const mail = await this.prisma.chairmanMail.findFirst({
      where: { companyId, OR: [{ id: idOrRef }, { ref: idOrRef }] },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!mail) throw new NotFoundException('Mail not found');
    if (!mail.readAt) await this.prisma.chairmanMail.update({ where: { id: mail.id }, data: { readAt: new Date() } });
    return mail;
  }

  async close(companyId: string, id: string) {
    const r = await this.prisma.chairmanMail.updateMany({ where: { companyId, id }, data: { status: 'CLOSED' } });
    if (!r.count) throw new NotFoundException('Mail not found');
    return { closed: true };
  }

  /** The Chairman answers a thread (portal text/voice or email). Returns the Assistant's reply. */
  async reply(companyId: string, idOrRef: string, rawText: string, channel: ReplyChannel, emailMessageId?: string | null) {
    const text = rawText?.trim();
    if (!text) throw new BadRequestException('text is required');
    if (text.length > 4000) throw new BadRequestException('text too long (max 4000 characters)');
    const mail = await this.prisma.chairmanMail.findFirst({ where: { companyId, OR: [{ id: idOrRef }, { ref: idOrRef }] } });
    if (!mail) throw new NotFoundException('Mail not found');

    try {
      await this.prisma.chairmanMailMessage.create({ data: { mailId: mail.id, from: 'CHAIRMAN', channel, text, emailMessageId: emailMessageId ?? null } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null; // this email reply was already handled
      throw e;
    }

    let answer: string;
    try {
      answer = await this.act(companyId, mail, text);
    } catch (e) {
      answer = `I couldn't do that: ${e.message}`;
    }
    const msg = await this.prisma.chairmanMailMessage.create({ data: { mailId: mail.id, from: 'ASSISTANT', channel, text: answer } });
    await this.prisma.chairmanMail.update({ where: { id: mail.id }, data: { status: FYI_ACK.test(text) ? 'CLOSED' : 'REPLIED', readAt: mail.readAt ?? new Date() } });

    // Email replies get the answer by email, in the same Gmail thread.
    if (channel === 'EMAIL' && chairmanMailer.recipient) {
      await chairmanMailer.sendRaw(chairmanMailer.recipient, `Re: [AEVORA ${mail.ref}] ${mail.category}: ${mail.title}`.slice(0, 180), `${answer}\n\n— Your AEVORA Assistant\nReference: ${mail.ref} · ${this.portalUrl()}/chairman-mail?ref=${mail.ref}`, emailMessageId ?? mail.emailMessageId);
    }
    return msg;
  }

  /** What the answer does, by thread type. */
  private async act(companyId: string, mail: { event: string; ref: string; title: string; data: any }, text: string): Promise<string> {
    const d = (mail.data ?? {}) as any;
    if (FYI_ACK.test(text)) return 'Noted — I have closed this one.';

    if (mail.event.startsWith('inbound.') && d.messageId) {
      const who = d.inbound?.lead?.name ?? 'the client';
      if (/^\s*ignore\b/i.test(text)) { await this.inbound.ignore(companyId, d.messageId); return `Ignored. Nothing was sent to ${who}.`; }
      const own = text.match(/^\s*reply\s*[:\-]\s*([\s\S]+)$/i);
      if (own) { await this.inbound.sendReply(companyId, d.messageId, own[1].trim()); return `Sent your reply to ${who}:\n"${own[1].trim()}"`; }
      if (/^\s*(send|yes|approve|go ahead)\b/i.test(text)) {
        const draft = d.inbound?.draftReply;
        if (!draft) return 'There is no drafted answer for this message. Reply with "REPLY: <your text>" and I will send it.';
        await this.inbound.sendReply(companyId, d.messageId, draft);
        return `Sent the drafted answer to ${who}.`;
      }
    }

    // A board meeting notice: the answer acts on THAT meeting (it used to reach the Assistant, whose urgent-meeting
    // keywords matched "board meeting" and called a second, urgent meeting).
    if (mail.event === 'boardroom.meeting' && d.id) {
      if (/^\s*join\b/i.test(text)) { await this.boardroom.join(companyId, d.id); return 'You lead it. The team is heading to the Boardroom.'; }
      if (/assistant\s+leads?|^\s*delegate\b/i.test(text)) { await this.boardroom.delegate(companyId, d.id); return 'I will lead it and email you the summary.'; }
      if (/^\s*reschedule\b/i.test(text)) {
        const m = await this.boardroom.get(companyId, d.id);
        await this.boardroom.reschedule(companyId, d.id, new Date(m.scheduledAt.getTime() + 24 * 3600_000));
        return 'Moved to the same time tomorrow.';
      }
    }

    if (mail.event === 'ceo.question' && d.id) {
      await this.dialogue.answer(companyId, d.id, text);
      return 'I passed your answer to ARIA (CEO). She will use it in her next review.';
    }

    const r = await this.assistant.processMessage(`About ${mail.ref} ("${mail.title}"): ${text}`, companyId);
    return r.response;
  }

  /** Read the Chairman's email replies (and new emails from the Chairman) from the company inbox. */
  async pollEmailReplies() {
    if (this.polling || process.env.INBOX_ENABLED !== 'true' || !imapCredentials()) return { skipped: true };
    const chairmen = await this.prisma.chairman.findMany({ select: { email: true, companies: { select: { id: true } } } });
    const addresses = [...new Set([chairmanMailer.recipient, ...chairmen.map((c) => c.email)].filter(Boolean).map((a) => a.toLowerCase()))];
    if (!addresses.length) return { skipped: true };
    this.polling = true;
    let handled = 0;
    try {
      const since = new Date(Date.now() - 3 * DAY);
      for (const addr of addresses) {
        const mails = await fetchMail([['SINCE', since], ['FROM', addr]], 25);
        for (const m of mails) {
          const messageId = normId(m.messageId);
          if (!messageId || (await this.prisma.chairmanMailMessage.findUnique({ where: { emailMessageId: messageId } }))) continue;
          const text = stripQuotedReply(m.text ?? '');
          if (!text) continue;
          const refs = [m.inReplyTo, ...(Array.isArray(m.references) ? m.references : m.references ? String(m.references).split(/\s+/) : [])].filter(Boolean).map((x: string) => normId(x));
          let thread = refs.length ? await this.prisma.chairmanMail.findFirst({ where: { emailMessageId: { in: refs as string[] } } }) : null;
          const ref = refFromSubject(m.subject);
          if (!thread && ref) thread = await this.prisma.chairmanMail.findUnique({ where: { ref } });
          if (!thread) {
            // A fresh email to the company address = an order for the Assistant, kept as its own thread.
            const companyId = chairmen.find((c) => c.email.toLowerCase() === addr)?.companies[0]?.id ?? chairmen[0]?.companies[0]?.id;
            if (!companyId) continue;
            thread = await this.prisma.chairmanMail.create({
              data: { companyId, ref: `AEV-${Math.floor(10000 + Math.random() * 89999)}`, event: 'chairman.email', category: 'Your email', title: (m.subject || 'Email to your Assistant').slice(0, 200), body: text, emailMessageId: messageId, readAt: new Date() },
            });
          }
          await this.reply(thread.companyId, thread.id, text, 'EMAIL', messageId);
          handled++;
        }
      }
      if (handled) this.logger.log(`Chairman Mail: handled ${handled} email repl${handled === 1 ? 'y' : 'ies'}`);
      return { handled };
    } catch (e) {
      this.logger.warn(`Chairman Mail inbox check failed: ${e.message}`);
      return { error: e.message };
    } finally {
      this.polling = false;
    }
  }
}

/** "<abc@x>" / "abc@x" → "<abc@x>". */
export function normId(id?: string | null) {
  if (!id || !/@/.test(id)) return null;
  return `<${String(id).trim().replace(/^<|>$/g, '')}>`;
}
