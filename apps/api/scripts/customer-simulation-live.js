// Submits the 15 synthetic customer scenarios through the REAL local web app (public form endpoint -> API -> live DB).
// Usage: node customer-simulation-live.js <outFile.json> [webBase=http://localhost:3000]
// Respects the API's 5-submissions-per-minute public throttle (and records one deliberate 429 as evidence).
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../test-data/customer-simulation-scenarios.json'), 'utf8'));
const out = process.argv[2];
const base = (process.argv[3] || 'http://localhost:3000').replace(/\/+$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = (n) => `${data.testRunId}-${String(n).padStart(2, '0')}`;
const body = (s) => ({ businessName: s.businessName, contactName: s.contactName, email: data.contactEmail, phone: s.phone, service: s.service, description: `${s.description} [${tag(s.n)}]` });
const post = async (p, b) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify(b) });
  let j = null; try { j = await r.json(); } catch { /* ignore */ }
  return { status: r.status, json: j };
};
(async () => {
  const results = [];
  const submit = async (s, label) => {
    const r = await post('/api/public/request', body(s));
    results.push({ n: s.n, case: s.case, businessName: s.businessName, label, httpStatus: r.status, reference: r.json && r.json.reference, publicStatus: r.json && r.json.status, message: r.json && r.json.message });
    console.log(`#${s.n} ${s.case}: HTTP ${r.status} ${r.json && r.json.reference ? r.json.reference : JSON.stringify(r.json)}`);
    return r;
  };
  const queue = [...data.scenarios];
  // minute 1: 6 attempts -> the 6th must be throttled (429), then it is retried after the window resets.
  for (const s of queue.slice(0, 6)) await submit(s, 'submit');
  const remaining = () => queue.filter((s) => !results.find((x) => x.n === s.n && x.label === 'submit' && x.reference));
  let guard = 0;
  while (remaining().length && guard++ < 6) {
    console.log('waiting 65s for the public-form rate limit window...');
    await sleep(65000);
    for (const s of remaining().slice(0, 5)) await submit(s, 'submit');
  }
  // duplicate handling: identical resubmission of #1 must return the original reference
  console.log('waiting 65s, then duplicate check...');
  await sleep(65000);
  const dup = await post('/api/public/request', body(data.scenarios[0]));
  const first = results.find((x) => x.n === 1 && x.reference);
  results.push({ n: 1, label: 'duplicate-resubmit', httpStatus: dup.status, reference: dup.json && dup.json.reference, sameAsOriginal: !!first && dup.json && dup.json.reference === first.reference });
  console.log(`duplicate #1: HTTP ${dup.status} same reference as original: ${results[results.length - 1].sameAsOriginal}`);
  // customer-facing status lookups (own reference + email only)
  for (const x of results.filter((r) => r.label === 'submit' && r.reference)) {
    const st = await post('/api/public/request/status', { reference: x.reference, email: data.contactEmail });
    x.statusLookup = { http: st.status, status: st.json && st.json.status };
  }
  const wrong = await post('/api/public/request/status', { reference: results.find((r) => r.reference).reference, email: 'someone@else.test' });
  results.push({ label: 'status-lookup-wrong-email', httpStatus: wrong.status });
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log('done ->', out);
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
