import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OodaPhase } from '@prisma/client';

/**
 * ITL Error Pool — Intelligent Task Loop
 *
 * Every failed OperatingLoopCycle enters this pool. The ITL runs on its own
 * internal schedule, picks up failed cycles, classifies the error, attempts
 * auto-healing (retry with backoff), and escalates to the Chairman only when
 * it cannot self-resolve.
 *
 * Error codes are deterministic — the same error type always gets the same
 * code, so the Chairman dashboard can group and trend them.
 */

export type ErrorCode =
  | 'SURVIVAL_SHUTDOWN'
  | 'LEAD_GEN_FAILED'
  | 'SMTP_BLOCKED'
  | 'OODA_CYCLE_FAILED'
  | 'AGENT_NOT_ACTIVE'
  | 'MODEL_TIMEOUT'
  | 'MODEL_UNAVAILABLE'
  | 'WEBHOOK_SIGNATURE_MISMATCH'
  | 'PAYMENT_GATEWAY_ERROR'
  | 'IMAP_CONNECTION_FAILED'
  | 'DATABASE_ERROR'
  | 'KILL_SWITCH_ACTIVE'
  | 'UNKNOWN_ERROR';

export interface ErrorPoolEntry {
  cycleId: string;
  companyId: string;
  trigger: string;
  errorMessage: string;
  errorCode: ErrorCode;
  retryCount: number;
  lastRetriedAt: Date | null;
  canAutoHeal: boolean;
  requiresChairman: boolean;
}

/** Maps error message patterns to structured error codes. */
export function classifyError(message: string): { code: ErrorCode; canAutoHeal: boolean; requiresChairman: boolean } {
  const m = message?.toLowerCase() ?? '';

  if (m.includes('survival') && m.includes('shutdown')) {
    return { code: 'SURVIVAL_SHUTDOWN', canAutoHeal: false, requiresChairman: true };
  }
  if (m.includes('kill switch') || m.includes('kill_switch') || m.includes('is disabled')) {
    return { code: 'KILL_SWITCH_ACTIVE', canAutoHeal: false, requiresChairman: true };
  }
  if (m.includes('lead') && (m.includes('failed') || m.includes('timeout') || m.includes('unreachable'))) {
    return { code: 'LEAD_GEN_FAILED', canAutoHeal: true, requiresChairman: false };
  }
  if (m.includes('smtp') || m.includes('nodemailer') || m.includes('email send')) {
    return { code: 'SMTP_BLOCKED', canAutoHeal: true, requiresChairman: false };
  }
  if (m.includes('ollama') && m.includes('timeout')) {
    return { code: 'MODEL_TIMEOUT', canAutoHeal: true, requiresChairman: false };
  }
  if (m.includes('ollama') || m.includes('model') && m.includes('unavailable')) {
    return { code: 'MODEL_UNAVAILABLE', canAutoHeal: true, requiresChairman: false };
  }
  if (m.includes('agent') && m.includes('not active')) {
    return { code: 'AGENT_NOT_ACTIVE', canAutoHeal: true, requiresChairman: false };
  }
  if (m.includes('imap') || m.includes('inbox') && m.includes('connect')) {
    return { code: 'IMAP_CONNECTION_FAILED', canAutoHeal: true, requiresChairman: false };
  }
  if (m.includes('razorpay') || m.includes('payment') && m.includes('gateway')) {
    return { code: 'PAYMENT_GATEWAY_ERROR', canAutoHeal: true, requiresChairman: false };
  }
  if (m.includes('webhook') && m.includes('signature')) {
    return { code: 'WEBHOOK_SIGNATURE_MISMATCH', canAutoHeal: false, requiresChairman: false };
  }
  if (m.includes('prisma') || m.includes('database') || m.includes('p1') || m.includes('p2')) {
    return { code: 'DATABASE_ERROR', canAutoHeal: true, requiresChairman: false };
  }

  return { code: 'UNKNOWN_ERROR', canAutoHeal: false, requiresChairman: true };
}

/** Exponential backoff: attempt 1 = 1 min, 2 = 2 min, 3 = 4 min, max 60 min. */
function backoffMs(retryCount: number): number {
  return Math.min(60 * 60 * 1000, Math.pow(2, retryCount) * 60 * 1000);
}

@Injectable()
export class ItlErrorPoolService implements OnModuleInit {
  private readonly logger = new Logger(ItlErrorPoolService.name);
  private poolScanInterval: NodeJS.Timeout | null = null;

  // ITL pool scan: default 5 minutes between scans
  private readonly SCAN_INTERVAL_MS = Number(process.env.ITL_POOL_SCAN_MS ?? 5 * 60 * 1000);
  private readonly MAX_AUTO_RETRIES = Number(process.env.ITL_MAX_RETRIES ?? 3);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Start the ITL error pool scanner after a short warm-up delay
    setTimeout(() => {
      this.logger.log(`[ITL] Error pool scanner started. Scan interval: ${this.SCAN_INTERVAL_MS / 1000}s`);
      this.startPoolScanner();
    }, 10_000);
  }

  /** Continuously scans the pool and processes failed cycles. */
  private startPoolScanner() {
    const scan = async () => {
      try {
        await this.processPool();
      } catch (e) {
        this.logger.error(`[ITL] Pool scan error: ${(e as Error).message}`);
      }
      this.poolScanInterval = setTimeout(scan, this.SCAN_INTERVAL_MS);
    };
    this.poolScanInterval = setTimeout(scan, this.SCAN_INTERVAL_MS);
  }

  /** Main pool processing: fetch all FAILED cycles, classify, retry or escalate. */
  async processPool(): Promise<{ processed: number; healed: number; escalated: number; skipped: number }> {
    const failedCycles = await this.prisma.operatingLoopCycle.findMany({
      where: { phase: OodaPhase.FAILED },
      orderBy: { createdAt: 'asc' },
    });

    if (failedCycles.length === 0) return { processed: 0, healed: 0, escalated: 0, skipped: 0 };

    this.logger.log(`[ITL] Processing ${failedCycles.length} failed cycle(s) in error pool`);

    let healed = 0;
    let escalated = 0;
    let skipped = 0;

    for (const cycle of failedCycles) {
      const meta = (cycle as any).itlMeta as any ?? {};
      const retryCount: number = meta.retryCount ?? 0;
      const lastRetriedAt: Date | null = meta.lastRetriedAt ? new Date(meta.lastRetriedAt) : null;
      const errorMessage: string = cycle.error ?? 'Unknown error';

      const { code, canAutoHeal, requiresChairman } = classifyError(errorMessage);

      // Skip if we haven't waited long enough for backoff
      if (lastRetriedAt) {
        const waitMs = backoffMs(retryCount);
        if (Date.now() - lastRetriedAt.getTime() < waitMs) {
          skipped++;
          continue;
        }
      }

      this.logger.log(`[ITL] Cycle ${cycle.id} | code=${code} | retry=${retryCount}/${this.MAX_AUTO_RETRIES} | heal=${canAutoHeal}`);

      if (requiresChairman) {
        // Write chairman escalation record
        await this.escalateToChairman(cycle.companyId, cycle.id, code, errorMessage, retryCount);
        escalated++;
        continue;
      }

      if (canAutoHeal && retryCount < this.MAX_AUTO_RETRIES) {
        // Mark as being retried — reset to OBSERVE so the business loop picks it up again
        await this.prisma.operatingLoopCycle.update({
          where: { id: cycle.id },
          data: {
            phase: OodaPhase.OBSERVE,
            error: null,
            execution: {
              itlMeta: {
                retryCount: retryCount + 1,
                lastRetriedAt: new Date().toISOString(),
                errorCode: code,
                originalError: errorMessage,
              }
            } as any,
          },
        });
        this.logger.log(`[ITL] Queued cycle ${cycle.id} for retry #${retryCount + 1} (code=${code})`);
        healed++;
      } else {
        // Max retries exceeded — escalate
        await this.escalateToChairman(cycle.companyId, cycle.id, code, errorMessage, retryCount);
        escalated++;
      }
    }

    this.logger.log(`[ITL] Pool scan complete: healed=${healed} escalated=${escalated} skipped=${skipped}`);
    return { processed: failedCycles.length, healed, escalated, skipped };
  }

  /** Write an escalation record so the Chairman sees it in the dashboard. */
  private async escalateToChairman(
    companyId: string,
    cycleId: string,
    code: ErrorCode,
    message: string,
    retryCount: number,
  ) {
    try {
      const existing = await this.prisma.operationalAlert.findFirst({
        where: { companyId, relatedEntityId: cycleId },
      });
      
      const fullMessage = `[${code}] ${message} (retries exhausted: ${retryCount})`;
      if (existing) {
        await this.prisma.operationalAlert.update({
          where: { id: existing.id },
          data: {
            status: 'ACTIVE',
            description: fullMessage,
          },
        });
      } else {
        await this.prisma.operationalAlert.create({
          data: {
            companyId,
            severity: code === 'SURVIVAL_SHUTDOWN' || code === 'DATABASE_ERROR' ? 'CRITICAL' : 'WARNING',
            category: 'SYSTEM',
            relatedEntityId: cycleId,
            title: `ITL Error: ${code}`,
            description: fullMessage,
            status: 'ACTIVE',
          },
        });
      }
      this.logger.warn(`[ITL] Escalated cycle ${cycleId} to Chairman: ${code}`);
    } catch (e) {
      this.logger.error(`[ITL] Failed to escalate cycle ${cycleId}: ${(e as Error).message}`);
    }
  }

  /** Get current pool snapshot (for dashboard/API). */
  async getPoolSnapshot(companyId: string): Promise<ErrorPoolEntry[]> {
    const failedCycles = await this.prisma.operatingLoopCycle.findMany({
      where: { companyId, phase: OodaPhase.FAILED },
      orderBy: { createdAt: 'desc' },
    });

    return failedCycles.map((cycle) => {
      const meta = (cycle.execution as any)?.itlMeta ?? {};
      const { code, canAutoHeal, requiresChairman } = classifyError(cycle.error ?? '');
      return {
        cycleId: cycle.id,
        companyId: cycle.companyId,
        trigger: cycle.trigger,
        errorMessage: cycle.error ?? 'Unknown',
        errorCode: code,
        retryCount: meta.retryCount ?? 0,
        lastRetriedAt: meta.lastRetriedAt ? new Date(meta.lastRetriedAt) : null,
        canAutoHeal,
        requiresChairman,
      };
    });
  }

  /** Force-retry a specific cycle immediately (Chairman override). */
  async forceRetry(cycleId: string): Promise<void> {
    const cycle = await this.prisma.operatingLoopCycle.findUnique({ where: { id: cycleId } });
    if (!cycle) throw new Error(`Cycle ${cycleId} not found`);
    await this.prisma.operatingLoopCycle.update({
      where: { id: cycleId },
      data: {
        phase: OodaPhase.OBSERVE,
        error: null,
        execution: {
          itlMeta: {
            retryCount: 0,
            lastRetriedAt: new Date().toISOString(),
            forceRetried: true,
            errorCode: 'FORCE_RETRY',
          }
        } as any,
      },
    });
    this.logger.log(`[ITL] Chairman force-retried cycle ${cycleId}`);
  }

  /** Permanently dismiss a cycle from the error pool (Chairman decision). */
  async dismiss(cycleId: string, reason: string): Promise<void> {
    await this.prisma.operatingLoopCycle.update({
      where: { id: cycleId },
      data: {
        completedAt: new Date(),
        execution: {
          itlMeta: {
            dismissed: true,
            dismissReason: reason,
            dismissedAt: new Date().toISOString(),
          }
        } as any,
      },
    });
    this.logger.log(`[ITL] Cycle ${cycleId} dismissed: ${reason}`);
  }
}
