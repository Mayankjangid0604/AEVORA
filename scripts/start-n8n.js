const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load root .env so process.env contains all integration keys
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

const n8nBin = 'C:\\Users\\mayan\\AppData\\Roaming\\npm\\node_modules\\n8n\\bin\\n8n';

process.env.N8N_PORT = process.env.N8N_PORT || '5678';
process.env.N8N_PROTOCOL = 'http';
process.env.N8N_HOST = 'localhost';
process.env.N8N_DIAGNOSTICS_ENABLED = 'false';
process.env.N8N_VERSION_NOTIFICATIONS_ENABLED = 'false';
process.env.N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS = 'false';
process.env.N8N_BLOCK_ENV_ACCESS_IN_NODE = 'true';

console.log('Launching n8n from:', n8nBin);
console.log('Port:', process.env.N8N_PORT);
console.log('N8N_BLOCK_ENV_ACCESS_IN_NODE:', process.env.N8N_BLOCK_ENV_ACCESS_IN_NODE);

const child = spawn(process.execPath, [n8nBin, 'start'], {
  env: process.env,
  stdio: 'inherit'
});

child.on('error', (err) => {
  console.error('Failed to start n8n child process:', err);
});

child.on('exit', (code, signal) => {
  console.log(`n8n process exited with code ${code}, signal ${signal}`);
});
