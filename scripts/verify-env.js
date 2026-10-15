const fs = require('fs');

function inspectKey(filePath, keyName) {
  if (!fs.existsSync(filePath)) {
    return { file: filePath, exists: false, configured: false };
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (key === keyName) {
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      return {
        file: filePath,
        exists: true,
        found: true,
        length: val.length,
        prefix: val ? val.slice(0, 4) + '...' : '',
        configured: val.length > 0 && !val.includes('your-') && !val.includes('placeholder') && val !== 'changeme'
      };
    }
  }
  return { file: filePath, exists: true, found: false, configured: false };
}

const targetKeys = [
  'GOOGLE_PLACES_API_KEY',
  'N8N_API_URL',
  'N8N_API_KEY',
  'INTEGRATION_API_KEY',
  'DATABASE_URL',
  'PORT',
  'API_URL',
  'PUBLIC_API_URL'
];

const files = ['.env', 'apps/api/.env'];
const report = {};

for (const k of targetKeys) {
  report[k] = files.map(f => inspectKey(f, k));
}

console.log(JSON.stringify(report, null, 2));

function getDbHostPort(file) {
  if (!fs.existsSync(file)) return null;
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith('DATABASE_URL=')) {
      const url = line.split('=')[1].replace(/["']/g, '').trim();
      const match = url.match(/@([^:\/]+):(\d+)\/([^?]+)/);
      if (match) {
        return { file, host: match[1], port: match[2], dbName: match[3] };
      }
      return { file, raw: 'no match' };
    }
  }
  return null;
}
console.log('DB Info:');
console.log(getDbHostPort('.env'));
console.log(getDbHostPort('apps/api/.env'));
