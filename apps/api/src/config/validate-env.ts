/** Startup config check: throws on missing required vars, returns warnings for optional ones. */
export const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'WEBHOOK_SECRET_PROD', 'WEBHOOK_SECRET_SIM'];
export const OPTIONAL_ENV: Record<string, string> = {
  SMTP_HOST: 'outbound email disabled',
  RAZORPAY_WEBHOOK_SECRET: 'Razorpay webhooks will be rejected',
  INTEGRATION_API_KEY: 'n8n / service-to-service integration auth disabled',
  RAZORPAY_KEY_ID: 'payment links disabled',
  OLLAMA_URL: 'using default http://localhost:11434',
  COMPANY_NAME: 'client emails and invoices will refuse to send',
  COMPANY_PHONE: 'client emails and invoices will refuse to send',
  COMPANY_ADDRESS: 'AI prompts and outreach will not mention a location',
  PUBLIC_INTAKE_COMPANY_ID: 'public customer inquiry intake (/request) will fail closed (503)',
  UNSUBSCRIBE_SECRET: 'outbound email requires >=32 characters for signed unsubscribe tokens',
  PUBLIC_API_URL: 'outbound email requires a public base URL for RFC 8058 unsubscribe links',
  DEMO_PUBLISHING_ENABLED: 'external demo publishing is disabled by default',
  N8N_API_URL: 'n8n workflow deployment and execution via API disabled',
  N8N_API_KEY: 'n8n workflow deployment and execution via API disabled',
  GOOGLE_PLACES_API_KEY: 'Google Places lead finding disabled',
};

export const KNOWN_INSECURE_JWT_SECRETS = new Set([
  'change-this-to-a-random-32-char-string',
  'secret',
  'test-secret-key-for-jest',
  'dev-secret',
  'development',
  'test',
  'password',
  '12345678',
  'aevora-secret',
  'default',
]);

export function validateEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const missing = REQUIRED_ENV.filter((k) => !env[k]?.trim());
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')} (see .env.example)`);

  const isEnforcedEnv = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';
  const envLabel = env.NODE_ENV === 'staging' ? 'Staging' : 'Production';

  if (env.ENABLE_REAL_PRODUCTION_SENDING === 'true') {
    const unsubSecret = env.UNSUBSCRIBE_SECRET?.trim() || '';
    if (unsubSecret.length < 32 || KNOWN_INSECURE_JWT_SECRETS.has(unsubSecret.toLowerCase())) {
      throw new Error(
        `Startup rejected: UNSUBSCRIBE_SECRET must be at least 32 characters and cannot use placeholder values when ENABLE_REAL_PRODUCTION_SENDING is true.`
      );
    }
    const publicApiUrl = env.PUBLIC_API_URL?.trim() || '';
    if (!publicApiUrl || !/^https?:\/\//i.test(publicApiUrl)) {
      throw new Error(
        `Startup rejected: PUBLIC_API_URL must be a valid HTTP(S) URL when ENABLE_REAL_PRODUCTION_SENDING is true.`
      );
    }
  }

  if (isEnforcedEnv) {
    const jwtSecret = env.JWT_SECRET?.trim() || '';
    if (KNOWN_INSECURE_JWT_SECRETS.has(jwtSecret.toLowerCase()) || jwtSecret.length < 32) {
      throw new Error(
        `${envLabel} startup rejected: JWT_SECRET must be at least 32 characters and cannot use default/development placeholder values.`
      );
    }

    const prodWebhook = env.WEBHOOK_SECRET_PROD?.trim() || '';
    const simWebhook = env.WEBHOOK_SECRET_SIM?.trim() || '';
    const isWeakWebhook = (s: string) =>
      s.length < 16 || ['default', 'secret', 'test', 'change-this'].some((w) => s.toLowerCase().includes(w));

    if (isWeakWebhook(prodWebhook) || isWeakWebhook(simWebhook)) {
      throw new Error(
        `${envLabel} startup rejected: WEBHOOK_SECRET_PROD and WEBHOOK_SECRET_SIM must be at least 16 characters and cannot use weak/default placeholders.`
      );
    }

    const razorpaySecret = env.RAZORPAY_WEBHOOK_SECRET?.trim();
    if (razorpaySecret) {
      if (
        razorpaySecret.length < 16 ||
        ['default', 'secret', 'test', 'change-this', 'placeholder', 'password', '12345678'].some((w) =>
          razorpaySecret.toLowerCase().includes(w)
        ) ||
        KNOWN_INSECURE_JWT_SECRETS.has(razorpaySecret.toLowerCase())
      ) {
        throw new Error(
          `${envLabel} startup rejected: RAZORPAY_WEBHOOK_SECRET must be at least 16 characters and cannot use weak/default placeholders.`
        );
      }
    }

    const redisPassword = env.REDIS_PASSWORD?.trim();
    if (redisPassword) {
      if (
        redisPassword.length < 16 ||
        ['default', 'secret', 'test', 'change-this', 'placeholder', 'password', '12345678'].some((w) =>
          redisPassword.toLowerCase().includes(w)
        ) ||
        KNOWN_INSECURE_JWT_SECRETS.has(redisPassword.toLowerCase())
      ) {
        throw new Error(
          `${envLabel} startup rejected: REDIS_PASSWORD must be at least 16 characters and cannot use weak/default placeholders.`
        );
      }
    }

    const redisUrl = env.REDIS_URL?.trim();
    if (redisUrl) {
      if (
        [':secret@', 'placeholder', 'change-this'].some((w) =>
          redisUrl.toLowerCase().includes(w)
        )
      ) {
        throw new Error(
          `${envLabel} startup rejected: REDIS_URL cannot use default/development placeholder values or insecure defaults.`
        );
      }
    }
  }

  const warnings: string[] = Object.entries(OPTIONAL_ENV)
    .filter(([k]) => !env[k]?.trim())
    .map(([k, why]) => `${k} not set: ${why}`);
  if (!env.COMPANY_EMAIL?.trim() && !env.SMTP_USER?.trim()) warnings.push('COMPANY_EMAIL not set (and no SMTP_USER): client emails and invoices will refuse to send');
  const outreach = env.OUTREACH_ENVIRONMENT;
  // Misfilled SMTP fields are the most common reason mail silently never leaves. Values are never echoed.
  const smtpHost = env.SMTP_HOST?.trim() ?? '';
  const smtpUser = env.SMTP_USER?.trim() ?? '';
  if (smtpHost.includes('@')) warnings.push('SMTP_HOST looks like an email address: it must be the mail SERVER name (for Gmail: smtp.gmail.com). Put the address in SMTP_USER.');
  if (smtpHost && smtpUser && /(^|\.)gmail\.com$/i.test(smtpHost) && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(smtpUser)) warnings.push('SMTP_USER must be the full Gmail address (name@gmail.com) when SMTP_HOST is a Gmail server.');

  if (outreach && !['SIMULATION', 'SANDBOX', 'PRODUCTION'].includes(outreach)) warnings.push(`OUTREACH_ENVIRONMENT="${outreach}" is invalid: falling back to SANDBOX`);
  for (const k of ['MIN_BALANCE_PAISE', 'WARNING_BALANCE_PAISE']) {
    if (env[k] && !Number.isSafeInteger(Number(env[k]))) throw new Error(`${k} must be an integer number of paise`);
  }
  return warnings;
}
