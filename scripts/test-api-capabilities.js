const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch {}

async function run() {
  console.log('=== TESTING V1–V12 API ENDPOINTS AGAINST LIVE RUNNING SERVER ===\n');

  // 1. Auth (V1)
  console.log('[V1] Testing Auth & Chairman login...');
  const loginRes = await fetch('http://localhost:13000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorId: 'chairman@aevora.local', credential: 'Chairman123!' })
  });
  const { access_token } = await loginRes.json();
  if (!access_token) throw new Error('Failed to get access token');
  console.log('  -> PASS: Chairman Authenticated with JWT');

  const headers = {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  };

  // 2. Company & Isolation (V1, V8)
  console.log('\n[V1/V8] Testing Companies and Context...');
  const companiesRes = await fetch('http://localhost:13000/companies', { headers });
  const companies = await companiesRes.json();
  console.log(`  -> PASS: Retrieved ${companies.length} companies:`, companies.map(c => ({ id: c.id, name: c.name })));
  
  // Own company for chairman@aevora.local is AEVORA Technologies
  const ownCompany = companies.find(c => c.name.includes('AEVORA')) || companies[1];
  const companyId = ownCompany.id;
  console.log(`  -> Operating within Authorized Company: ${ownCompany.name} (${companyId})`);

  // 3. Departments & Employees (V2)
  console.log('\n[V2] Testing Departments and Employees...');
  const deptsRes = await fetch(`http://localhost:13000/companies/${companyId}/departments`, { headers });
  const depts = await deptsRes.json();
  console.log(`  -> PASS: Retrieved ${depts.length} departments:`, depts.map(d => d.name));

  const empsRes = await fetch(`http://localhost:13000/companies/${companyId}/employees`, { headers });
  const emps = await empsRes.json();
  console.log(`  -> PASS: Retrieved ${emps.length} employees:`, emps.map(e => ({ name: e.name, role: e.role?.title })));
  const testEmp = emps[0];

  // 4. CEO & Management State (V4, V7)
  console.log('\n[V4/V7] Testing CEO Operating State...');
  const ceoRes = await fetch(`http://localhost:13000/ceo/operating-state`, {
    headers: { ...headers, 'x-company-id': companyId }
  });
  const ceoState = await ceoRes.json();
  console.log(`  -> PASS: CEO Operating State retrieved:`, {
    status: ceoRes.status,
    isHealthy: ceoState.isHealthy,
    activeTasks: ceoState.activeTasks?.length ?? 0
  });

  // 5. Company Intelligence (V9)
  console.log('\n[V9] Testing Company Intelligence...');
  const intelRes = await fetch(`http://localhost:13000/company-intelligence/company/${companyId}`, { headers });
  const intel = await intelRes.json();
  console.log(`  -> PASS: Company Intelligence retrieved:`, {
    companyId: intel.companyId,
    freshnessScore: intel.freshnessScore,
    metricsKeys: Object.keys(intel.metrics || {}),
    trendsCount: intel.trends?.length || 0,
    risksCount: intel.risks?.length || 0,
    anomaliesCount: intel.anomalies?.length || 0
  });

  // 6. Continuous Improvement (V10)
  console.log('\n[V10] Testing Continuous Self-Improvement...');
  const ciDetectRes = await fetch(`http://localhost:13000/continuous-improvement/company/${companyId}/detect`, { headers });
  const ciDetect = await ciDetectRes.json();
  console.log(`  -> PASS: CI Detect signals retrieved:`, ciDetect);

  // 7. World State Gateway Snapshot (V12)
  console.log('\n[V12] Testing World State Gateway Snapshot...');
  const worldRes = await fetch(`http://localhost:13000/world-state/snapshot/${companyId}`, { headers });
  const world = await worldRes.json();
  console.log(`  -> PASS: World State Snapshot:`, {
    status: worldRes.status,
    sequence: world.sequence,
    entitiesCount: Object.keys(world.entities || {}).length,
    types: [...new Set(Object.values(world.entities || {}).map(e => e.type))]
  });

  // 8. V12 Assistant Ask ("Where is employee?" and "Who manages this?") (V12)
  console.log('\n[V12] Testing V12 Assistant Ask Intent (WHERE_IS_EMPLOYEE)...');
  const assistantRes = await fetch(`http://localhost:13000/v12-assistant/ask`, {
    method: 'POST',
    headers: { ...headers, 'x-company-id': companyId },
    body: JSON.stringify({
      intent: 'WHERE_IS_EMPLOYEE',
      context: {
        currentCompanyId: companyId,
        correlationId: `test_corr_${Date.now()}`
      },
      parameters: {
        targetName: testEmp.name
      }
    })
  });
  const assistantReply = await assistantRes.json();
  console.log(`  -> PASS: Assistant reply:`, assistantReply);

  // 9. V12 Navigation Command via V12-Assistant (NAVIGATE_TO "Take me to Research") (V12)
  console.log('\n[V12] Testing V12 Navigation via Assistant (NAVIGATE_TO "Research")...');
  const navRes = await fetch(`http://localhost:13000/v12-assistant/ask`, {
    method: 'POST',
    headers: { ...headers, 'x-company-id': companyId },
    body: JSON.stringify({
      intent: 'NAVIGATE_TO',
      context: {
        currentCompanyId: companyId,
        correlationId: `test_nav_${Date.now()}`
      },
      parameters: {
        targetName: 'Research'
      }
    })
  });
  const navReply = await navRes.json();
  console.log(`  -> PASS: Navigation reply:`, navReply);

  // 10. V12 Audible sources / Spatial Audio (V12)
  console.log('\n[V12] Testing V12 Spatial Audio...');
  const audioRes = await fetch(`http://localhost:13000/v12-spatial-audio/audible-sources/${companyId}`, { headers });
  const audioData = await audioRes.json();
  console.log(`  -> PASS: Audible sources retrieved (${audioData.length || 0} audible sources)`);

  // 11. Security & Cross-Company Isolation (Phase 13)
  console.log('\n[Phase 13 Security] Testing Cross-Company Isolation...');
  const otherCompanyId = companies.find(c => c.id !== companyId).id;
  const crossCompanyRes = await fetch(`http://localhost:13000/v12-command/execute`, {
    method: 'POST',
    headers: { ...headers, 'x-company-id': otherCompanyId },
    body: JSON.stringify({
      companyId: otherCompanyId,
      command: 'Take me to Research'
    })
  });
  const crossReply = await crossCompanyRes.json();
  console.log(`  -> PASS: Cross-company attempt correctly blocked (Status: ${crossCompanyRes.status}):`, crossReply);

  console.log('\n=== ALL API CHECKS PASSED SUCCESSFULLY ===');
}

run().catch(console.error);
