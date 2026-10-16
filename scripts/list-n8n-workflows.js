const fs = require('fs');
for (const l of fs.readFileSync('.env', 'utf8').split('\n')) {
  if (l.trim().startsWith('#') || !l.includes('=')) continue;
  const [k, ...v] = l.split('=');
  process.env[k.trim()] = v.join('=').trim().replace(/^['\"]|['\"]$/g, '');
}
fetch(process.env.N8N_API_URL + '/api/v1/workflows', {
  headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY }
}).then(r => r.json()).then(d => {
  console.log(JSON.stringify(d.data.map(w => ({ id: w.id, name: w.name, active: w.active })), null, 2));
}).catch(console.error);
