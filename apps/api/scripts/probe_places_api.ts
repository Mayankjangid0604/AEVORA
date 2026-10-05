import * as fs from 'fs';
import * as path from 'path';

function loadEnv(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) {
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
loadEnv(path.resolve(__dirname, '../../../.env'));
loadEnv(path.resolve(__dirname, '../.env'));

async function probeApis() {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();

  // Test Geocoding API
  const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=Delhi&key=${key}`;
  const resGeo = await fetch(geoUrl);
  const geoJson = await resGeo.json();
  console.log('Geocoding status:', geoJson.status, 'error_message:', geoJson.error_message);

  // Test Places API (New) details endpoint
  const newDetailsUrl = 'https://places.googleapis.com/v1/places/ChIJgTwBfDk2BDkRZYrqgwwx884';
  const resNewDetails = await fetch(newDetailsUrl, {
    headers: {
      'X-Goog-Api-Key': key!,
      'X-Goog-FieldMask': 'id,displayName',
    }
  });
  console.log('Places API (New) details status:', resNewDetails.status);
  const newDetailsText = await resNewDetails.text();
  console.log('Places API (New) details body:', newDetailsText);
}

probeApis().catch(console.error);
