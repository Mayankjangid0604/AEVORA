const fs = require('fs');

function loadEnvKey(key) {
  for (const f of ['.env', 'apps/api/.env']) {
    if (!fs.existsSync(f)) continue;
    for (const rawLine of fs.readFileSync(f, 'utf8').split('\n')) {
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
  return null;
}

process.env.DATABASE_URL = loadEnvKey('DATABASE_URL');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testServices() {
  console.log('========================================================');
  console.log('  TESTING LOCAL OLLAMA INFERENCE & EMAIL VERIFIER');
  console.log('========================================================\n');

  // 1. Test Ollama Qwen2.5:7b directly via HTTP
  const prompt = `You are a business data extraction assistant for AEVORA CRM. Extract business facts from the following website text.

Business Name: Texas Dental
Category/Industry: dentists
Text:
"Welcome to Texas Dental in Plano, TX. Dr. John Smith, DDS offers family dentistry, dental implants, teeth whitening, and emergency dental care. Call us at (972) 290-1388 or email contact@texasdentalpa.com. Follow us on Instagram @texasdental and Facebook /texasdental."

Return ONLY valid JSON matching this schema:
{
  "businessName": "string",
  "industry": "string",
  "services": ["service1", "service2"],
  "contactEmail": "string or null",
  "contactPhone": "string or null",
  "socialProfiles": {
    "facebook": "url or null",
    "instagram": "url or null",
    "linkedin": "url or null",
    "twitter": "url or null"
  },
  "operatingHours": "string or null",
  "summary": "1-2 sentence description"
}`;

  console.log('[1] Testing Ollama (qwen2.5:7b) extraction...');
  const oStart = Date.now();
  const oRes = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen2.5:7b',
      prompt,
      stream: false,
      format: 'json',
      options: { temperature: 0.1 }
    })
  });

  const oData = await oRes.json();
  const oDuration = Date.now() - oStart;
  console.log(`Ollama responded in ${oDuration} ms (model: ${oData.model})`);
  console.log('Extracted JSON:');
  console.log(oData.response);

  // 2. Test native DNS / MX verification on Node.js dns.promises
  console.log('\n[2] Testing DNS/MX Email Verification...');
  const dns = require('dns').promises;

  const testEmails = [
    'invalid-syntax-email',
    'nonexistentdomain1234567890.xyz@gmail.com', // domain not found
    'info@google.com',                           // valid syntax + real MX
    'contact@texasdentalpa.com'                  // domain check
  ];

  for (const email of testEmails) {
    console.log(`\nEvaluating: "${email}"`);
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    const isSyntaxValid = emailRegex.test(email);
    console.log(`  - Syntax Valid: ${isSyntaxValid}`);
    if (!isSyntaxValid) {
      console.log(`  - Outcome: SYNTAX_INVALID | isDeliverableInbox: false`);
      continue;
    }

    const domain = email.split('@')[1];
    try {
      const mx = await dns.resolveMx(domain);
      console.log(`  - MX Records Found (${mx.length}):`, mx.map(m => m.exchange).slice(0, 2));
      console.log(`  - Outcome: VALID_SYNTAX_MX | isDeliverableInbox: false (MX verified; no SMTP RCPT probe)`);
    } catch (err) {
      console.log(`  - DNS/MX lookup failed: ${err.code || err.message}`);
      console.log(`  - Outcome: ${err.code === 'ENOTFOUND' ? 'DOMAIN_NOT_FOUND' : 'NO_MX_RECORDS'} | isDeliverableInbox: false`);
    }
  }

  await prisma.$disconnect();
}

testServices().catch(console.error);
