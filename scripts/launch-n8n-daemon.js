const path = require('path');
const fs = require('fs');

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

process.env.N8N_PORT = '5678';
process.env.N8N_PROTOCOL = 'http';
process.env.N8N_HOST = 'localhost';
process.env.N8N_DIAGNOSTICS_ENABLED = 'false';
process.env.N8N_VERSION_NOTIFICATIONS_ENABLED = 'false';

// Default block env access: keep secure unless specific workflows require it
if (process.env.N8N_BLOCK_ENV_ACCESS_IN_NODE === undefined) {
  process.env.N8N_BLOCK_ENV_ACCESS_IN_NODE = 'true';
}

if (!process.argv.includes('start')) {
  process.argv.push('start');
}

require('C:\\Users\\mayan\\AppData\\Roaming\\npm\\node_modules\\n8n\\bin\\n8n');

