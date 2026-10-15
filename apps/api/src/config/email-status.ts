import * as fs from 'fs';
import * as path from 'path';

/** Where the controlled test script records its single result (git-ignored, no secrets inside). */
export const EMAIL_TEST_RESULT_FILE = path.join(process.cwd(), '..', '..', '.local-state', 'email-test-result.json');

export interface EmailStatus {
  provider: 'SMTP' | 'SENDGRID' | 'NONE';
  configValid: boolean;
  problems: string[];
  safeMode: boolean;
  outreachEnvironment: string;
  realProductionSending: boolean;
  generalOutreachEnabled: boolean;
  lastTest: null | { at: string; recipient: string; smtpAccepted: boolean; smtpResponse?: string; error?: string; inboxDelivery: 'NOT_VERIFIED' };
}

const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Pure, secret-free description of how email is configured. Never returns hostnames, addresses or passwords:
 * only whether each field has the right *shape*, so it is safe to show in the UI and in reports.
 */
export function emailStatus(env: NodeJS.ProcessEnv, lastTest: EmailStatus['lastTest'] = null): EmailStatus {
  const host = env.SMTP_HOST?.trim() ?? '', user = env.SMTP_USER?.trim() ?? '', pass = (env.SMTP_PASS ?? '').replace(/\s+/g, '');
  const problems: string[] = [];
  let provider: EmailStatus['provider'] = 'NONE';
  if (host) {
    provider = 'SMTP';
    if (host.includes('@')) problems.push('SMTP_HOST is an email address; it must be the mail server name (Gmail: smtp.gmail.com).');
    else if (!HOST_RE.test(host)) problems.push('SMTP_HOST is not a valid server name.');
    if (!EMAIL_RE.test(user)) problems.push('SMTP_USER must be the full sending address (name@gmail.com).');
    if (!pass) problems.push('SMTP_PASS is empty.');
    else if (/gmail\.com$/i.test(host) && pass.length !== 16) problems.push('SMTP_PASS does not look like a 16-character Google app password.');
    const port = Number(env.SMTP_PORT ?? 587);
    if (![465, 587].includes(port)) problems.push('SMTP_PORT should be 587 (STARTTLS) or 465 (TLS).');
  } else if (env.SENDGRID_API_KEY?.trim()) {
    provider = 'SENDGRID';
  } else {
    problems.push('No email provider configured (SMTP_HOST is empty).');
  }
  const realProductionSending = env.ENABLE_REAL_PRODUCTION_SENDING === 'true';
  const outreachEnvironment = env.OUTREACH_ENVIRONMENT ?? 'SANDBOX';
  return {
    provider, configValid: problems.length === 0, problems,
    safeMode: env.AEVORA_SAFE_MODE === 'true', outreachEnvironment, realProductionSending,
    generalOutreachEnabled: realProductionSending && outreachEnvironment === 'PRODUCTION' && env.AEVORA_SAFE_MODE !== 'true',
    lastTest,
  };
}

export function readLastEmailTest(file = EMAIL_TEST_RESULT_FILE): EmailStatus['lastTest'] {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { at: String(j.at), recipient: String(j.recipient), smtpAccepted: !!j.smtpAccepted, smtpResponse: j.smtpResponse, error: j.error, inboxDelivery: 'NOT_VERIFIED' };
  } catch { return null; }
}
