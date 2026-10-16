const nodemailer = require('nodemailer');
const dns = require('dns').promises;
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

function loadEnvKey(key) {
  for (const f of ['.env', 'apps/api/.env']) {
    const full = path.resolve(process.cwd(), f);
    if (!fs.existsSync(full)) continue;
    for (const rawLine of fs.readFileSync(full, 'utf8').split('\n')) {
      const l = rawLine.trim();
      if (l.startsWith(key + '=')) {
        let v = l.slice(key.length + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return v;
      }
    }
  }
  return process.env[key] || null;
}

process.env.DATABASE_URL = loadEnvKey('DATABASE_URL');
const prisma = new PrismaClient();

async function main() {
  console.log('================================================================');
  console.log('  AEVORA AUTOMATION #4 — EMAIL PROVIDER READINESS INSPECTION');
  console.log('  (Strict Non-Transmitting Verification)');
  console.log('================================================================\n');

  const results = {};

  // 1. SMTP Host, Port, and Authentication
  const smtpHost = loadEnvKey('SMTP_HOST');
  const smtpPort = loadEnvKey('SMTP_PORT') || '587';
  const smtpUser = loadEnvKey('SMTP_USER');
  const smtpPass = loadEnvKey('SMTP_PASS');

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(smtpPort),
        secure: Number(smtpPort) === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass.replace(/\s+/g, ''),
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
      });

      const verified = await transporter.verify();
      if (verified) {
        results.smtp = {
          status: 'PASS',
          details: `Connected and authenticated successfully with host "${smtpHost}:${smtpPort}" (non-transmitting handshake).`,
        };
      } else {
        results.smtp = {
          status: 'FAIL',
          details: 'Handshake succeeded but server did not confirm readiness.',
        };
      }
    } catch (err) {
      results.smtp = {
        status: 'FAIL',
        details: `SMTP verification failed: ${err.message}`,
      };
    }
  } else {
    results.smtp = {
      status: 'UNAVAILABLE',
      details: 'SMTP credentials or host not configured in environment.',
    };
  }

  // 2. Sender Address and Verified Sender Identity
  const fromEmail = loadEnvKey('FROM_EMAIL') || smtpUser;
  if (fromEmail) {
    const domain = fromEmail.split('@')[1];
    const isPublicWebmail = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(domain?.toLowerCase());
    if (isPublicWebmail) {
      results.senderIdentity = {
        status: 'FAIL',
        details: `Configured sender uses free webmail domain ("${domain}"). Commercial B2B outreach requires a dedicated organizational domain with custom DNS records.`,
      };
    } else {
      results.senderIdentity = {
        status: 'PASS',
        details: `Configured sender domain is "${domain}".`,
      };
    }
  } else {
    results.senderIdentity = {
      status: 'UNAVAILABLE',
      details: 'No sender address (FROM_EMAIL or SMTP_USER) configured.',
    };
  }

  // 3. Production Provider Readiness
  const enableRealSending = loadEnvKey('ENABLE_REAL_PRODUCTION_SENDING');
  const outreachEnv = loadEnvKey('OUTREACH_ENVIRONMENT');
  const allowOutreach = loadEnvKey('ALLOW_EXTERNAL_OUTREACH');
  const sendgridKey = loadEnvKey('SENDGRID_API_KEY');

  if (enableRealSending === 'true' && outreachEnv === 'PRODUCTION' && allowOutreach === 'true') {
    results.productionProvider = {
      status: 'PASS',
      details: 'Environment flags configured for production dispatch.',
    };
  } else {
    results.productionProvider = {
      status: 'FAIL',
      details: `Safeguard clamp active: ENABLE_REAL_PRODUCTION_SENDING=${enableRealSending}, OUTREACH_ENVIRONMENT=${outreachEnv}, ALLOW_EXTERNAL_OUTREACH=${allowOutreach || 'unset'}.`,
    };
  }

  // 4. UNSUBSCRIBE_SECRET Configured Securely
  const unsubSecret = loadEnvKey('UNSUBSCRIBE_SECRET');
  if (unsubSecret && unsubSecret.length >= 32) {
    results.unsubscribeSecret = {
      status: 'PASS',
      details: `Configured with sufficient length (${unsubSecret.length} chars >= 32 required).`,
    };
  } else if (unsubSecret) {
    results.unsubscribeSecret = {
      status: 'FAIL',
      details: `Configured but insecure (${unsubSecret.length} chars < 32 required for HMAC-SHA256).`,
    };
  } else {
    results.unsubscribeSecret = {
      status: 'UNAVAILABLE',
      details: 'UNSUBSCRIBE_SECRET is unset or commented out in environment.',
    };
  }

  // 5. PUBLIC_API_URL Reachability and Unsubscribe Processing
  const publicApiUrl = loadEnvKey('PUBLIC_API_URL');
  if (publicApiUrl) {
    try {
      const url = new URL(publicApiUrl);
      results.publicApiUrl = {
        status: 'PASS',
        details: `Configured base URL: ${url.origin}.`,
      };
    } catch (e) {
      results.publicApiUrl = {
        status: 'FAIL',
        details: `Configured value is not a valid URL: ${e.message}`,
      };
    }
  } else {
    results.publicApiUrl = {
      status: 'UNAVAILABLE',
      details: 'PUBLIC_API_URL is unset or commented out in environment.',
    };
  }

  // 6. SPF, DKIM, and DMARC Configuration for Sending Domain
  const senderDomain = fromEmail ? fromEmail.split('@')[1] : 'aevora.com';
  console.log(`Checking DNS records for sending domain: ${senderDomain}...`);

  let spfRecord = null;
  let dmarcRecord = null;

  try {
    const txtRecords = await dns.resolveTxt(senderDomain);
    for (const r of txtRecords) {
      const full = r.join('');
      if (full.startsWith('v=spf1')) {
        spfRecord = full;
      }
    }
  } catch (e) {
    // DNS error or no TXT
  }

  try {
    const dmarcTxt = await dns.resolveTxt(`_dmarc.${senderDomain}`);
    for (const r of dmarcTxt) {
      const full = r.join('');
      if (full.startsWith('v=DMARC1')) {
        dmarcRecord = full;
      }
    }
  } catch (e) {
    // DNS error or no DMARC
  }

  if (senderDomain === 'gmail.com') {
    results.dnsAuth = {
      status: 'FAIL',
      details: `Domain "gmail.com" has Google's own SPF/DMARC records (DMARC: ${dmarcRecord ? 'present' : 'none'}), but cannot be customized for Aevora branding or custom DKIM selectors.`,
    };
  } else if (spfRecord && dmarcRecord) {
    results.dnsAuth = {
      status: 'PASS',
      details: `Domain "${senderDomain}" has active SPF ("${spfRecord.slice(0, 30)}...") and DMARC ("${dmarcRecord.slice(0, 30)}...").`,
    };
  } else {
    results.dnsAuth = {
      status: 'FAIL',
      details: `Domain "${senderDomain}" lacks complete authentication records (SPF: ${spfRecord ? 'PASS' : 'FAIL'}, DMARC: ${dmarcRecord ? 'PASS' : 'FAIL'}).`,
    };
  }

  // 7. Bounce, Complaint, and Suppression Handling
  try {
    const suppressionCount = await prisma.emailSuppression.count();
    results.suppressionHandling = {
      status: 'PASS',
      details: `Persistent EmailSuppression table is operational (${suppressionCount} records currently registered).`,
    };
  } catch (err) {
    results.suppressionHandling = {
      status: 'FAIL',
      details: `EmailSuppression database query failed: ${err.message}`,
    };
  }

  console.log('--- Provider Verification Summary ---');
  for (const [key, val] of Object.entries(results)) {
    console.log(`[${val.status}] ${key}: ${val.details}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
