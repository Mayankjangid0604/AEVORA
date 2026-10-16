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

async function verifyParity() {
  const local = JSON.parse(fs.readFileSync('n8n/2.lead-enrichment.json', 'utf8'));
  const n8nKey = loadEnvKey('N8N_API_KEY');
  const res = await fetch('http://localhost:5678/api/v1/workflows/ald9mQlsl4vfvSts', {
    headers: { 'X-N8N-API-KEY': n8nKey }
  });
  const remote = await res.json();
  
  console.log('=== WORKFLOW PARITY AUDIT ===');
  console.log('Workflow ID:', remote.id);
  console.log('Remote Name:', remote.name);
  console.log('Local Name:', local.name);
  console.log('Active Status:', remote.active);
  console.log('Node Count:', remote.nodes.length, 'vs', local.nodes.length);
  
  const localNames = local.nodes.map(n => n.name).sort();
  const remoteNames = remote.nodes.map(n => n.name).sort();
  console.log('Node Names Match:', JSON.stringify(localNames) === JSON.stringify(remoteNames));
  
  // Verify code node content
  const localCodeNode = local.nodes.find(n => n.name === 'Prepare Enrichment Request');
  const remoteCodeNode = remote.nodes.find(n => n.name === 'Prepare Enrichment Request');
  const codeMatches = localCodeNode?.parameters?.jsCode === remoteCodeNode?.parameters?.jsCode;
  console.log('Code Node Content Matches Exactly:', codeMatches);
  
  // Verify HTTP Request node
  const localHttp = local.nodes.find(n => n.name === 'Execute AEVORA Dual-Path Lead Enrichment');
  const remoteHttp = remote.nodes.find(n => n.name === 'Execute AEVORA Dual-Path Lead Enrichment');
  const httpUrlMatches = localHttp?.parameters?.url === remoteHttp?.parameters?.url;
  console.log('HTTP Node URL Matches:', httpUrlMatches);
}

verifyParity().catch(console.error);
