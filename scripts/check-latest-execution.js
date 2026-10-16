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
  const listRes = await fetch('http://localhost:5678/api/v1/executions?limit=5', {
    headers: { 'X-N8N-API-KEY': n8nKey }
  });
  const listData = await listRes.json();
  console.log('Recent Executions:', JSON.stringify(listData.data?.slice(0, 3), null, 2));

  if (listData.data && listData.data.length > 0) {
    const latestId = listData.data[0].id;
    const detailRes = await fetch(`http://localhost:5678/api/v1/executions/${latestId}?includeData=true`, {
      headers: { 'X-N8N-API-KEY': n8nKey }
    });
    const detailData = await detailRes.json();
    console.log(`\nLatest Execution (${latestId}) Error Details:`);
    console.log('Status:', detailData.status);
    console.log('StoppedAt:', detailData.stoppedAt);
    const resultData = detailData.data?.resultData;
    if (resultData?.error) {
      console.log('Error:', JSON.stringify(resultData.error, null, 2));
    }
    if (resultData?.runData) {
      for (const [nodeName, nodeRuns] of Object.entries(resultData.runData)) {
        for (const run of nodeRuns) {
          if (run.error) {
            console.log(`Node "${nodeName}" Error:`, JSON.stringify(run.error, null, 2));
          }
        }
      }
    }
    const rawText = JSON.stringify(detailData);
    const googleKey = loadEnvKey('GOOGLE_PLACES_API_KEY');
    const intKey = loadEnvKey('INTEGRATION_API_KEY');
    console.log('\n[Security Audit of Execution Data]');
    console.log('Contains raw GOOGLE_PLACES_API_KEY:', googleKey ? rawText.includes(googleKey) : 'N/A');
    console.log('Contains raw INTEGRATION_API_KEY:', intKey ? rawText.includes(intKey) : 'N/A');
    if (intKey && rawText.includes(intKey)) {
      // Find where intKey occurs
      let idx = 0;
      while ((idx = rawText.indexOf(intKey, idx)) !== -1) {
        console.log('intKey snippet:', rawText.slice(Math.max(0, idx - 40), Math.min(rawText.length, idx + intKey.length + 40)));
        idx += intKey.length;
      }
    }
  }
}

main().catch(console.error);
