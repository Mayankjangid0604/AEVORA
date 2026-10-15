const fs = require('fs');

function loadEnvKey(keyName) {
  const files = ['.env', 'apps/api/.env'];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const k = trimmed.slice(0, eqIdx).trim();
      if (k === keyName) {
        let v = trimmed.slice(eqIdx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (v) return v;
      }
    }
  }
  return null;
}

async function testGooglePlaces() {
  const apiKey = loadEnvKey('GOOGLE_PLACES_API_KEY');
  if (!apiKey) {
    console.error('ERROR: GOOGLE_PLACES_API_KEY is missing or empty.');
    process.exit(1);
  }

  const endpoint = 'https://places.googleapis.com/v1/places:searchText';
  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.nationalPhoneNumber',
    'places.websiteUri',
    'places.rating',
    'places.userRatingCount'
  ].join(',');

  const requestBody = {
    textQuery: 'dentists in Dallas, Texas',
    pageSize: 3
  };

  console.log('Sending bounded request to Google Places API (New)...');
  console.log('Endpoint:', endpoint);
  console.log('FieldMask:', fieldMask);
  console.log('Query:', JSON.stringify(requestBody));

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask
      },
      body: JSON.stringify(requestBody)
    });

    console.log('HTTP Status:', res.status, res.statusText);

    const json = await res.json();

    if (!res.ok) {
      console.error('API Error Response:', JSON.stringify(json, null, 2));
      process.exit(2);
    }

    const places = json.places || [];
    console.log(`Success! Returned ${places.length} places.`);

    places.forEach((p, idx) => {
      console.log(`\nPlace #${idx + 1}:`);
      console.log('  ID:', p.id ? `${p.id.slice(0, 10)}... (present)` : 'MISSING');
      console.log('  Name:', p.displayName?.text || 'MISSING');
      console.log('  Address:', p.formattedAddress || 'MISSING');
      console.log('  Phone:', p.nationalPhoneNumber || 'MISSING');
      console.log('  Website:', p.websiteUri || 'MISSING');
      console.log('  Rating:', p.rating || 'N/A');
      console.log('  Reviews:', p.userRatingCount || 0);
    });

  } catch (err) {
    console.error('Network / Request Error:', err.message);
    process.exit(3);
  }
}

testGooglePlaces();
