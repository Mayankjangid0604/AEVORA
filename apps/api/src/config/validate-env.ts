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
};

export function validateEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const missing = REQUIRED_ENV.filter((k) => !env[k]?.trim());
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')} (see .env.example)`);
  const warnings: string[] = Object.entries(OPTIONAL_ENV)
    .filter(([k]) => !env[k]?.trim())
    .map(([k, why]) => `${k} not set: ${why}`);
  if (!env.COMPANY_EMAIL?.trim() && !env.SMTP_USER?.trim()) warnings.push('COMPANY_EMAIL not set (and no SMTP_USER): client emails and invoices will refuse to send');
  const outreach = env.OUTREACH_ENVIRONMENT;
  if (outreach && !['SIMULATION', 'SANDBOX', 'PRODUCTION'].includes(outreach)) warnings.push(`OUTREACH_ENVIRONMENT="${outreach}" is invalid: falling back to SANDBOX`);
  for (const k of ['MIN_BALANCE_PAISE', 'WARNING_BALANCE_PAISE']) {
    if (env[k] && !Number.isSafeInteger(Number(env[k]))) throw new Error(`${k} must be an integer number of paise`);
  }
  return warnings;
}
