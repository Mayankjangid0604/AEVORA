import { Injectable } from '@nestjs/common';
import { ReplaySessionInfo } from '@aevora/shared';

interface Session { companyId: string; startedAt: number; expiresAt: number }

/**
 * Server-side record of which actors are currently in REPLAY. Command boundaries consult this registry so
 * consequential commands are rejected while replay is active, regardless of what mode a client claims.
 * Sessions expire after V12_REPLAY_SESSION_TTL_MS unless refreshed (history window reads refresh them).
 */
@Injectable()
export class ReplaySessionService {
  private sessions = new Map<string, Session>();
  readonly ttlMs = Math.max(1000, Number(process.env.V12_REPLAY_SESSION_TTL_MS || 30 * 60 * 1000));

  enter(actorId: string, companyId: string, now = Date.now()): ReplaySessionInfo {
    const existing = this.sessions.get(actorId);
    const startedAt = existing && existing.companyId === companyId && existing.expiresAt > now ? existing.startedAt : now;
    const s: Session = { companyId, startedAt, expiresAt: now + this.ttlMs };
    this.sessions.set(actorId, s);
    return { active: true, ...s };
  }

  refresh(actorId: string, companyId: string, now = Date.now()): void {
    const s = this.sessions.get(actorId);
    if (s && s.companyId === companyId && s.expiresAt > now) s.expiresAt = now + this.ttlMs;
  }

  exit(actorId: string): ReplaySessionInfo {
    this.sessions.delete(actorId);
    return { active: false };
  }

  get(actorId: string | undefined, now = Date.now()): ReplaySessionInfo {
    if (!actorId) return { active: false };
    const s = this.sessions.get(actorId);
    if (!s) return { active: false };
    if (s.expiresAt <= now) { this.sessions.delete(actorId); return { active: false }; }
    return { active: true, ...s };
  }

  isReplayActive(actorId: string | undefined, now = Date.now()): boolean {
    return this.get(actorId, now).active;
  }
}
