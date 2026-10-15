import { BadRequestException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

/** Marks draft text that a human must replace before a proposal can be submitted. Never a real commercial term. */
export const PLACEHOLDER_MARK = '[DRAFT PLACEHOLDER';

export interface PipelineActor { actorId: string; actorType?: string }

type AuditDb = Pick<PrismaClient, 'customerAuditEvent'>;

/** Append-only audit trail shared by the proposal / project / task flows (same table the inquiry flow uses). */
export function auditEvent(
  db: AuditDb, companyId: string, actor: PipelineActor, action: string, objectType: string, objectId: string,
  oldValue: object | null, newValue: object | null, extra: { clientId?: string | null; projectId?: string | null } = {},
) {
  return db.customerAuditEvent.create({
    data: {
      companyId, actorId: actor.actorId, actorType: actor.actorType ?? 'HUMAN', action, objectType, objectId,
      oldValue: oldValue ?? undefined, newValue: newValue ?? undefined,
      clientId: extra.clientId ?? undefined, projectId: extra.projectId ?? undefined,
    },
  });
}

/** Accepts a number or a numeric string (the BFF forwards string fields only). Returns undefined when absent. */
export function toInt(value: unknown, name: string, min = 0, max = 1_000_000_000): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) throw new BadRequestException(`${name} must be a whole number between ${min} and ${max}.`);
  return n;
}

export function toText(value: unknown, name: string, max = 5000): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`${name} must be text.`);
  const t = value.trim();
  if (t.length > max) throw new BadRequestException(`${name} must be at most ${max} characters.`);
  return t;
}

/** Serialises concurrent requests for one key inside a transaction (Postgres advisory lock), so repeats cannot duplicate rows. */
export async function lockKey(tx: { $executeRaw: PrismaClient['$executeRaw'] }, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

export function actorOf(req: any): PipelineActor {
  return { actorId: req.user.actorId, actorType: req.user.actorRole === 'CHAIRMAN' ? 'CHAIRMAN' : 'EMPLOYEE' };
}
