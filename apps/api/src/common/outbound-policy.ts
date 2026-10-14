import { ForbiddenException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * One server-side policy for everything that leaves the machine toward the outside world:
 * email (IntegrationService gate), WhatsApp (manual push), and external publishing (Vercel demos).
 * Nothing here reads request input; every switch is server configuration or DB state, and every read error fails closed.
 */
export type OutboundChannel = 'EMAIL' | 'WHATSAPP' | 'PUBLISH';

const CHANNEL_FEATURE: Record<OutboundChannel, string> = { EMAIL: 'OUTBOUND_EMAIL', WHATSAPP: 'OUTBOUND_WHATSAPP', PUBLISH: 'EXTERNAL_PUBLISH' };

/** AEVORA_EMERGENCY_STOP: unset/"false" = running, "true" = stopped, anything else = misconfigured = stopped. */
export function emergencyStopActive(env = process.env): boolean {
  const v = env.AEVORA_EMERGENCY_STOP?.trim().toLowerCase();
  return !(v === undefined || v === '' || v === 'false');
}

/** Throws unless the channel is open for this tenant. A failing kill-switch read propagates (fail closed). */
export async function assertOutboundAllowed(prisma: PrismaService, companyId: string | null, channel: OutboundChannel) {
  if (emergencyStopActive()) throw new ForbiddenException(`Outbound ${channel} blocked: emergency stop is active`);
  const killed = await prisma.killSwitchConfig.findFirst({
    where: {
      OR: [{ companyId: null }, ...(companyId ? [{ companyId }] : [])],
      feature: { in: ['GLOBAL_PRODUCTION', 'OUTBOUND_ALL', CHANNEL_FEATURE[channel]] },
      isDisabled: true,
    },
  });
  if (killed) throw new ForbiddenException(`Outbound ${channel} blocked by kill switch ${killed.feature}`);
}

/** External publishing (Vercel) needs DEMO_PUBLISHING_ENABLED=true on the server and an open PUBLISH channel. */
export async function assertPublishingAllowed(prisma: PrismaService, companyId: string | null) {
  if (process.env.DEMO_PUBLISHING_ENABLED !== 'true') throw new ForbiddenException('External publishing is disabled (DEMO_PUBLISHING_ENABLED is not true)');
  await assertOutboundAllowed(prisma, companyId, 'PUBLISH');
}

function limit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new ForbiddenException(`Outbound blocked: ${name} is misconfigured`);
  return n;
}

/** Conservative pilot defaults; 0 blocks the scope entirely. */
export function sendLimits() {
  return {
    perRecipientPerDay: limit('PILOT_MAX_SENDS_PER_RECIPIENT_PER_DAY', 1),
    perTenantPerDay: limit('PILOT_MAX_SENDS_PER_TENANT_PER_DAY', 20),
    globalPerDay: limit('PILOT_MAX_SENDS_GLOBAL_PER_DAY', 50),
  };
}

/**
 * Counts approved sends in the last 24 h (drafts in SENDING or SENT; every outbound email has one) excluding `selfDraftId`.
 * Concurrent sends each see the other's claimed SENDING row, so a race can only under-send, never exceed a limit.
 */
export async function assertWithinSendLimits(prisma: PrismaService, companyId: string, recipient: string, selfDraftId: string) {
  const l = sendLimits();
  const since = new Date(Date.now() - 86_400_000);
  const base = { status: { in: ['SENDING', 'SENT'] as any }, approvedAt: { gte: since }, id: { not: selfDraftId } };
  const [toRecipient, tenant, global] = await Promise.all([
    prisma.outreachDraft.count({ where: { ...base, companyId, recipientEmail: { equals: recipient.trim(), mode: 'insensitive' } } }),
    prisma.outreachDraft.count({ where: { ...base, companyId } }),
    prisma.outreachDraft.count({ where: base }),
  ]);
  if (toRecipient >= l.perRecipientPerDay) throw new ForbiddenException('Send limit reached for this recipient (24h)');
  if (tenant >= l.perTenantPerDay) throw new ForbiddenException('Send limit reached for this company (24h)');
  if (global >= l.globalPerDay) throw new ForbiddenException('Global pilot send limit reached (24h)');
}

// ---- Unsubscribe tokens: HMAC-SHA256 over (companyId, normalized email). Unguessable without UNSUBSCRIBE_SECRET. ----

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

function unsubscribeSecret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET?.trim() ?? '';
  if (s.length < 32) throw new ForbiddenException('Outbound blocked: UNSUBSCRIBE_SECRET is missing or shorter than 32 characters');
  return s;
}

const mac = (data: string) => createHmac('sha256', unsubscribeSecret()).update(data).digest('base64url');

export function signUnsubscribeToken(companyId: string, email: string): string {
  const data = Buffer.from(JSON.stringify([companyId, normalizeEmail(email)])).toString('base64url');
  return `${data}.${mac(data)}`;
}

/** Returns the (companyId, email) a token was issued for, or null if it was not issued by us. */
export function verifyUnsubscribeToken(token: unknown): { companyId: string; email: string } | null {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const [data, sig, extra] = token.split('.');
  if (!data || !sig || extra !== undefined) return null;
  const expected = Buffer.from(mac(data));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const [companyId, email] = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    return typeof companyId === 'string' && typeof email === 'string' && companyId && email ? { companyId, email } : null;
  } catch {
    return null;
  }
}

/** Public unsubscribe URL for a recipient (PUBLIC_API_URL must be set, else sending fails closed). */
export function unsubscribeUrl(companyId: string, email: string): string {
  const base = process.env.PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new ForbiddenException('Outbound blocked: PUBLIC_API_URL is not set, so no unsubscribe link can be issued');
  return `${base}/unsubscribe?t=${encodeURIComponent(signUnsubscribeToken(companyId, email))}`;
}

/** Records an opt-out (idempotent: the first record and its reason are kept as the audit trail). */
export async function recordSuppression(prisma: PrismaService, companyId: string, email: string, reason: string, source?: string) {
  const normalized = normalizeEmail(email);
  return prisma.emailSuppression.upsert({
    where: { companyId_email: { companyId, email: normalized } },
    create: { companyId, email: normalized, reason, source },
    update: {},
  });
}
