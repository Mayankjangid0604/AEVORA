const fs = require('fs');
const path = require('path');

function searchDir(dir, pattern) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (!f.includes('node_modules') && !f.includes('public')) {
          searchDir(full, pattern);
        }
      } else if (f.endsWith('.js')) {
        const c = fs.readFileSync(full, 'utf8');
        if (c.includes('user_api_keys') || c.includes('apiKey')) {
          if (c.includes('generateApiKey') || c.includes('createApiKey') || c.includes('apiKeyService') || c.includes('ApiKeyService')) {
            console.log('Found match:', full);
          }
        }
      }
    } catch {}
  }
}

searchDir('C:/Users/mayan/AppData/Roaming/npm/node_modules/n8n/dist', 'apiKey');
