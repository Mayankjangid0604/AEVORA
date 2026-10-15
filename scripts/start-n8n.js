const { spawn } = require('child_process');
const path = require('path');

const n8nBin = 'C:\\Users\\mayan\\AppData\\Roaming\\npm\\node_modules\\n8n\\bin\\n8n';

process.env.N8N_PORT = process.env.N8N_PORT || '5678';
process.env.N8N_PROTOCOL = 'http';
process.env.N8N_HOST = 'localhost';
process.env.N8N_DIAGNOSTICS_ENABLED = 'false';
process.env.N8N_VERSION_NOTIFICATIONS_ENABLED = 'false';
process.env.N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS = 'false';

console.log('Launching n8n from:', n8nBin);
console.log('Port:', process.env.N8N_PORT);

const child = spawn(process.execPath, [n8nBin, 'start'], {
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe']
});

child.stdout.on('data', (d) => process.stdout.write(d));
child.stderr.on('data', (d) => process.stderr.write(d));

child.on('error', (err) => {
  console.error('Failed to start n8n child process:', err);
});

child.on('exit', (code, signal) => {
  console.log(`n8n process exited with code ${code}, signal ${signal}`);
});
