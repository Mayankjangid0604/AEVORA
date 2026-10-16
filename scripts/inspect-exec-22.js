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

const n8nKey = loadEnvKey('N8N_API_KEY');

async function main() {
  const d = await (await fetch('http://localhost:5678/api/v1/executions/22?includeData=true', {
    headers: { 'X-N8N-API-KEY': n8nKey }
  })).json();
  const rd = d.data?.resultData?.runData;
  for (const [k, v] of Object.entries(rd || {})) {
    console.log(`Node: "${k}", Data count:`, v[0]?.data?.main?.[0]?.length);
    if (k === 'Format & Normalize') {
      const item = v[0]?.data?.main?.[0]?.[0]?.json;
      console.log('Category:', item?.category);
      console.log('Location:', item?.location);
      console.log('CompanyId:', item?.companyId);
      console.log('Places count:', item?.records?.length);
      console.log('First place name:', item?.records?.[0]?.displayName?.text);
    }
    if (k === 'Deliver to AEVORA Webhook') {
      const item = v[0]?.data?.main?.[0]?.[0]?.json;
      console.log('AEVORA Webhook Response:', JSON.stringify(item, null, 2));
    }
  }
}

main().catch(console.error);
