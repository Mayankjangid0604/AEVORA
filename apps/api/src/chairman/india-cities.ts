import * as fs from 'fs';
import * as path from 'path';

/**
 * Bundled Indian city table (GeoNames, CC BY 4.0; places with population ≥ 50,000) for turning a stored place name
 * ("Jaipur, Rajasthan, India") into coordinates without any external geocoding API.
 */
type Row = [name: string, lat: number, lng: number, population: number];
let INDEX: Map<string, { name: string; lat: number; lng: number }> | null = null;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
const ALIASES: Record<string, string> = { bangalore: 'bengaluru', bombay: 'mumbai', calcutta: 'kolkata', madras: 'chennai', gurgaon: 'gurugram', 'new delhi': 'delhi', poona: 'pune', trivandrum: 'thiruvananthapuram', baroda: 'vadodara', mysore: 'mysuru' };

function index() {
  if (INDEX) return INDEX;
  const file = path.join(__dirname, '..', '..', 'assets', 'india-cities.json');
  const rows: Row[] = JSON.parse(fs.readFileSync(file, 'utf8')).cities;
  INDEX = new Map();
  for (const [name, lat, lng] of rows) { const k = fold(name); if (!INDEX.has(k)) INDEX.set(k, { name, lat, lng }); }
  return INDEX;
}

/** First comma-separated part (or word pair / word) of `place` that is a known Indian city, else null. */
export function cityCoordinates(place: string | null | undefined): { city: string; lat: number; lng: number } | null {
  if (!place) return null;
  const idx = index();
  for (const part of place.split(',')) {
    const f = fold(part); if (!f) continue;
    const words = f.split(' ');
    const candidates = [f, ...words.slice(0, -1).map((_, i) => `${words[i]} ${words[i + 1]}`), ...words];
    for (const c of candidates) {
      const hit = idx.get(ALIASES[c] ?? c);
      if (hit) return { city: hit.name, lat: hit.lat, lng: hit.lng };
    }
  }
  return null;
}
