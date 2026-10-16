const fs = require('fs');
const path = require('path');

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

const key = loadEnvKey('GOOGLE_PLACES_API_KEY');

async function main() {
  if (!key) {
    console.log('GOOGLE_PLACES_API_KEY is not set');
    return;
  }
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.location,places.primaryType,places.editorialSummary'
    },
    body: JSON.stringify({
      textQuery: 'pediatric dentists in Plano, TX',
      pageSize: 3
    })
  });
  console.log('Google Places API status:', res.status);
  const data = await res.json();
  console.log('Places count:', (data.places || []).length);
  for (const p of data.places || []) {
    console.log(`- "${p.displayName?.text}" | ID: ${p.id} | Phone: ${p.nationalPhoneNumber} | Web: ${p.websiteUri} | Rating: ${p.rating}`);
  }
}

main().catch(console.error);
