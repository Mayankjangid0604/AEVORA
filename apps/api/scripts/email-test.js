#!/usr/bin/env node
/**
 * AEVORA controlled email test. Standalone: it does NOT use the application's outreach path and does NOT read or change
 * AEVORA_SAFE_MODE / OUTREACH_ENVIRONMENT / ENABLE_REAL_PRODUCTION_SENDING, so it cannot enable general sending.
 *
 *   node scripts/email-test.js              -> validates config + SMTP login (verify). Sends NOTHING.
 *   EMAIL_TEST_CONFIRM=SEND_ONE_TEST_EMAIL node scripts/email-test.js --send
 *                                           -> sends exactly ONE message to the single allowed recipient, once ever
 *                                              (a result file blocks repeats; pass --force-again to override).
 *
 * Needs the API built once (npm run build) because it reuses the compiled config check. Never prints secrets.
 * Result: SMTP acceptance is reported separately from inbox delivery, which this script cannot verify.
 */
const fs = require('fs');
const path = require('path');
const { parseEnv } = require('util');

const ALLOWED_RECIPIENT = 'mayankjangid598@gmail.com';
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const resultFile = path.join(repoRoot, '.local-state', 'email-test-result.json');

// Root .env is the source of truth, but real environment variables win (so tests can override).
try {
  const parsed = parseEnv(fs.readFileSync(path.join(repoRoot, '.env'), 'utf8'));
  for (const [k, v] of Object.entries(parsed)) if (process.env[k] === undefined) process.env[k] = v;
} catch { console.error('Could not read the root .env file.'); process.exit(2); }

const { emailStatus } = require('../dist/config/email-status.js');
const nodemailer = require('nodemailer');

const args = process.argv.slice(2);
const send = args.includes('--send');
const forceAgain = args.includes('--force-again');

const out = (o) => console.log(JSON.stringify(o, null, 2));
const record = (r) => { fs.mkdirSync(path.dirname(resultFile), { recursive: true }); fs.writeFileSync(resultFile, JSON.stringify(r, null, 2)); };

function classify(e) {
  const code = e && e.code, resp = e && e.responseCode;
  if (code === 'EAUTH' || resp === 535) return 'AUTHENTICATION_FAILED: the server rejected SMTP_USER / app password (check the 16-character Google app password and that 2-Step Verification is on).';
  if (code === 'ENOTFOUND' || code === 'EDNS') return 'HOST_NOT_FOUND: SMTP_HOST does not resolve to a mail server.';
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ECONNECTION') return 'CONNECTION_FAILED: could not reach the mail server (network, firewall or wrong port).';
  if (code === 'ESOCKET' || /tls|ssl|certificate/i.test(String(e && e.message))) return 'TLS_FAILED: the TLS handshake failed (check SMTP_PORT: 587 STARTTLS or 465 TLS).';
  if (code === 'EENVELOPE') return 'RECIPIENT_REJECTED: the server refused the recipient.';
  return `SEND_FAILED: ${code || 'error'}`;
}

(async () => {
  const status = emailStatus(process.env);
  const safety = { safeMode: status.safeMode, outreachEnvironment: status.outreachEnvironment, realProductionSending: status.realProductionSending, generalOutreachEnabled: status.generalOutreachEnabled };
  if (!status.configValid) { out({ ok: false, stage: 'config', problems: status.problems, safety, emailSent: false }); process.exit(3); }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: (process.env.SMTP_PASS ?? '').replace(/\s+/g, '') },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
  });

  try { await transporter.verify(); } catch (e) {
    out({ ok: false, stage: 'smtp-verify', error: classify(e), tls: port === 465 ? 'implicit TLS' : 'STARTTLS required', safety, emailSent: false });
    process.exit(4);
  }
  if (!send) { out({ ok: true, stage: 'smtp-verify', note: 'SMTP login succeeded. No email was sent. To send the single test: EMAIL_TEST_CONFIRM=SEND_ONE_TEST_EMAIL node scripts/email-test.js --send', safety, emailSent: false }); return; }

  if (process.env.EMAIL_TEST_CONFIRM !== 'SEND_ONE_TEST_EMAIL') { out({ ok: false, stage: 'confirm', error: 'Refusing to send: EMAIL_TEST_CONFIRM=SEND_ONE_TEST_EMAIL is not set.', emailSent: false }); process.exit(5); }
  let prior = null; try { prior = JSON.parse(fs.readFileSync(resultFile, 'utf8')); } catch {}
  if (prior && prior.smtpAccepted && !forceAgain) { out({ ok: false, stage: 'once-only', error: 'A test email was already accepted by the server (see .local-state/email-test-result.json). Not sending again.', emailSent: false }); process.exit(6); }

  const at = new Date().toISOString();
  const attempt = { at, recipient: ALLOWED_RECIPIENT, smtpAccepted: false };
  try {
    const info = await transporter.sendMail({
      from: `"${process.env.OUTREACH_FROM_NAME || 'AEVORA'}" <${process.env.SMTP_USER}>`,
      to: ALLOWED_RECIPIENT,
      subject: '[AEVORA] Controlled email test',
      text: `This is a single controlled test message from your local AEVORA installation, sent ${at}.\n\nNo action is needed. General outreach, marketing and automatic sending remain disabled.`,
      headers: { 'X-AEVORA-Test': 'controlled-single-send' },
    });
    attempt.smtpAccepted = Array.isArray(info.accepted) && info.accepted.length === 1 && info.rejected.length === 0;
    attempt.smtpResponse = String(info.response || '').slice(0, 200);
    attempt.messageId = info.messageId;
    record(attempt);
    out({ ok: attempt.smtpAccepted, stage: 'sent', smtpAccepted: attempt.smtpAccepted, smtpResponse: attempt.smtpResponse, messageId: info.messageId, accepted: info.accepted.length, rejected: info.rejected.length, inboxDelivery: 'NOT_VERIFIED (no inbox access configured; check the mailbox manually)', safety, emailSent: true });
  } catch (e) {
    attempt.error = classify(e); record(attempt);
    out({ ok: false, stage: 'send', error: attempt.error, emailSent: false, safety });
    process.exit(7);
  }
})();
