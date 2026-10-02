import { Injectable, Logger } from '@nestjs/common';
import NodeCache = require('node-cache');

/** Short-lived per-company cache for assistant replies. Side-effect intents are never cached (TTL 0). */
@Injectable()
export class ResponseCacheService {
  private readonly logger = new Logger(ResponseCacheService.name);
  private readonly cache = new NodeCache({ stdTTL: 60, checkperiod: 30 });

  // TTL in seconds per intent type; 0 = never cache
  private readonly TTL: Record<string, number> = {
    STATUS_REPORT: 30,
    CHECK_REVENUE: 30,
    FIND_LEADS: 300,
    PAUSE_SIMULATION: 0,
    RESUME_SIMULATION: 0,
    COMMAND_CEO: 0,
    NEW_VENTURE: 0,
    WHATSAPP_MESSAGE: 0,
    ASK_CEO: 120,
    CUSTOM: 0,
    PARSED_INTENT: 600, // phi4's parse of an exact message — the intent, not its execution
  };

  key(intent: string, companyId: string, extra = ''): string {
    return `${companyId}:${intent}:${extra}`.toLowerCase().replace(/\s+/g, '_');
  }

  get<T>(intent: string, companyId: string, extra = ''): T | undefined {
    const k = this.key(intent, companyId, extra);
    const hit = this.cache.get<T>(k);
    if (hit !== undefined) this.logger.debug(`Cache HIT: ${k}`);
    return hit;
  }

  set<T>(intent: string, companyId: string, value: T, extra = ''): void {
    const ttl = this.TTL[intent] ?? 0;
    if (ttl === 0) return;
    const k = this.key(intent, companyId, extra);
    this.cache.set(k, value, ttl);
    this.logger.debug(`Cache SET: ${k} ttl=${ttl}s`);
  }

  invalidate(intent: string, companyId: string, extra = ''): void {
    this.cache.del(this.key(intent, companyId, extra));
  }

  invalidateAll(companyId: string): void {
    const prefix = `${companyId}:`.toLowerCase();
    const keys = this.cache.keys().filter((k) => k.startsWith(prefix));
    this.cache.del(keys);
    this.logger.debug(`Cache CLEAR for company ${companyId}: ${keys.length} keys`);
  }
}
