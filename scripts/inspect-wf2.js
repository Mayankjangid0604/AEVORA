const fs = require('fs');
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const k = trimmed.slice(0, eqIdx).trim();
    let v = trimmed.slice(eqIdx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv('.env');
loadEnv('apps/api/.env');

const n8nUrl = process.env.N8N_API_URL || 'http://localhost:5678';
const n8nKey = process.env.N8N_API_KEY;

async function main() {
  const res = await fetch(`${n8nUrl}/api/v1/workflows/ald9mQlsl4vfvSts`, {
    headers: { 'X-N8N-API-KEY': n8nKey },
  });
  const data = await res.json();
  fs.writeFileSync('scripts/dump-wf2.json', JSON.stringify(data, null, 2));
  console.log('Saved to scripts/dump-wf2.json');
}

main().catch(console.error);
