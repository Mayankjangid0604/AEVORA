const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const l = rawLine.trim();
    if (!l || l.startsWith('#') || !l.includes('=')) continue;
    const eqIdx = l.indexOf('=');
    const k = l.slice(0, eqIdx).trim();
    let v = l.slice(eqIdx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) {
      process.env[k] = v;
    }
  }
}

const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  let dbOk = false;
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    dbOk = true;
  } catch (e) {
    dbOk = e.message;
  }
  await prisma.$disconnect();

  let apiOk = false;
  try {
    const r = await fetch('http://127.0.0.1:13000/health');
    apiOk = r.status;
  } catch (e) {
    apiOk = e.message;
  }

  let n8nOk = false;
  try {
    const r = await fetch('http://localhost:5678/healthz');
    n8nOk = r.status;
  } catch (e) {
    n8nOk = e.message;
  }

  let ollamaOk = false;
  try {
    const r = await fetch('http://127.0.0.1:11434/api/tags');
    ollamaOk = r.status;
  } catch (e) {
    ollamaOk = e.message;
  }

  console.log(JSON.stringify({ database: dbOk, api: apiOk, n8n: n8nOk, ollama: ollamaOk }, null, 2));
}

main().catch(console.error);
