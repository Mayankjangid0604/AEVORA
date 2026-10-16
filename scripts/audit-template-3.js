const fs = require('fs');

const data = JSON.parse(fs.readFileSync('n8n/3.ai-sales-research-opportunity-scoring.json', 'utf8'));

console.log('=== TEMPLATE #3 INTEGRITY & DEPENDENCY AUDIT ===\n');

console.log('1. Basic Metadata:');
console.log(`- Nodes count: ${data.nodes?.length}`);
console.log(`- Connections: ${Object.keys(data.connections || {}).length}`);
console.log(`- Instance ID: ${data.meta?.instanceId}`);
console.log(`- Template ID: ${data.meta?.templateId}`);

console.log('\n2. Node Inventory & External Dependencies:');
const credentialsUsed = [];
const externalApis = [];

data.nodes.forEach(n => {
  if (n.credentials) {
    credentialsUsed.push({ node: n.name, type: n.type, creds: n.credentials });
  }
  if (n.parameters?.workflowJson) {
    try {
      const sub = JSON.parse(n.parameters.workflowJson);
      sub.nodes.forEach(sn => {
        if (sn.credentials) {
          credentialsUsed.push({ node: `${n.name} -> ${sn.name}`, type: sn.type, creds: sn.credentials });
        }
        if (sn.parameters?.url) {
          externalApis.push({ node: `${n.name} -> ${sn.name}`, url: sn.parameters.url });
        }
      });
    } catch {}
  }
  if (n.parameters?.url) {
    externalApis.push({ node: n.name, url: n.parameters.url });
  }
  if (n.type.includes('googleSheets')) {
    externalApis.push({
      node: n.name,
      sheetDocId: n.parameters?.documentId?.value,
      sheetUrl: n.parameters?.documentId?.cachedResultUrl
    });
  }
  if (n.type.includes('OpenAi')) {
    externalApis.push({ node: n.name, model: n.parameters?.model });
  }
  if (n.type.includes('SerpApi')) {
    externalApis.push({ node: n.name, service: 'SerpAPI' });
  }
});

console.log('Credentials Referenced:');
credentialsUsed.forEach(c => console.log(`  - [${c.type}] in "${c.node}":`, JSON.stringify(c.creds)));

console.log('\nExternal Services / APIs Referenced:');
externalApis.forEach(e => console.log(`  -`, JSON.stringify(e)));

console.log('\n3. Input & Output Analysis:');
const inputNode = data.nodes.find(n => n.name === 'Input');
console.log('- Input node assignments:', JSON.stringify(inputNode?.parameters?.assignments, null, 2));

const parserNode = data.nodes.find(n => n.name === 'Structured Output Parser');
console.log('- Structured Output schema:', parserNode?.parameters?.inputSchema);

const agentNode = data.nodes.find(n => n.name === 'AI company researcher');
console.log('- AI Agent Prompt:\n', agentNode?.parameters?.text);

console.log('\n4. Data Flow Analysis:');
console.log('- Trigger mechanism: manualTrigger or scheduleTrigger (runs every 2 hours)');
console.log('- Ingestion: Reads rows from hardcoded Google Sheet ("Enrich companies using AI agents")');
console.log('- Processing loop: splitInBatches (processes rows 1 by 1)');
console.log('- AI Execution: LangChain Agent calling SerpAPI or ScrapingBee, visiting website via subworkflow');
console.log('- Storage: Writes enriched fields back to the same Google Sheet');
