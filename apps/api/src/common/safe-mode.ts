/**
 * #49 Safe mode (AEVORA_SAFE_MODE=true, set by scripts/safe-local.env): nothing leaves the machine except the local
 * model (Ollama on localhost) and Chairman mail to CHAIRMAN_NOTIFY_EMAIL (SMTP via chairman-mailer, not fetch).
 * Every outbound fetch goes through one guard, so a new integration can't forget the check.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const logged = new Set<string>();

export const safeMode = () => process.env.AEVORA_SAFE_MODE === 'true';

/** What kind of call this host is, for the one log line per type. */
export function callType(host: string): string {
  if (/overpass|openstreetmap|nominatim/.test(host)) return 'lead-gen (OpenStreetMap)';
  if (/googleapis|google\.com/.test(host)) return 'lead-gen (Google)';
  if (/sendgrid|mailgun|postmark/.test(host)) return 'outreach email';
  if (/twilio|whatsapp|graph\.facebook/.test(host)) return 'outreach messaging';
  if (/hooks\.|webhook/.test(host)) return 'webhook';
  return `network (${host})`;
}

/** Throws (and logs once per call type) — for non-fetch channels such as outreach SMTP. */
export function blockedInSafeMode(kind: string, log: (line: string) => void = console.warn): never {
  if (!logged.has(kind)) { logged.add(kind); log(`[safe mode] blocked in safe mode: ${kind}`); }
  throw new Error(`blocked in safe mode: ${kind}`);
}

export function isAllowedInSafeMode(url: string): boolean {
  try { return LOCAL_HOSTS.has(new URL(url).hostname); } catch { return false; }
}

export function installSafeModeNetworkGuard(log: (line: string) => void = console.warn) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (isAllowedInSafeMode(url)) return real(input, init);
    let host = url; try { host = new URL(url).hostname; } catch { /* keep raw */ }
    return blockedInSafeMode(callType(host), log);
  }) as typeof fetch;
  log('[safe mode] outbound network blocked except localhost (Ollama) and Chairman mail');
}
