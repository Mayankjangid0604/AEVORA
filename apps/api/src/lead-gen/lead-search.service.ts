import { Injectable, Logger } from '@nestjs/common';

export interface LeadSearchQuery {
  category: string;
  location: string;
  radius?: number;
  maxResults?: number;
  variant?: string; // query prefix, e.g. "best" — lets a high-weight category search twice without repeating itself
}

export interface FoundLead {
  googlePlaceId: string;
  businessName: string;
  category: string;
  location: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  description: string | null;
  reviewCount: number;
  lat?: number; // Google Places coordinates (absent for mock leads)
  lng?: number;
  qualityScore: number;
}

/** 0–100. No website is the strongest signal: that is what we sell. */
export function scoreLead(l: { phone: string | null; email: string | null; website: string | null; reviewCount: number }): number {
  let score = 0;
  if (l.phone) score += 25;
  if (l.email) score += 25;
  if (!l.website) score += 30;
  score += Math.min(20, Math.floor(l.reviewCount / 10)); // reviews ≈ business size
  return Math.min(100, score);
}

/** Category (LEAD_GEN_CATEGORIES) → OpenStreetMap tags that count as that kind of business. */
export const OSM_CATEGORY_TAGS: Record<string, [string, RegExp][]> = {
  restaurant: [['amenity', /^(restaurant|cafe|fast_food|food_court|ice_cream)$/]],
  salon: [['shop', /^(beauty|hairdresser|cosmetics)$/]],
  gym: [['leisure', /^(fitness_centre|sports_centre)$/]],
  retail_shop: [['shop', /^(clothes|electronics|mobile_phone|computer|books|gift|variety_store|general|supermarket|shoes|jewelry|furniture|hardware|kitchen|stationery|toys|sports|car|trade|spices|confectionery|medical_supply)$/]],
  coaching_center: [['amenity', /^(school|college|language_school|training|prep_school)$/]],
  clinic: [['amenity', /^(clinic|doctors|dentist|hospital|pharmacy)$/]],
  hotel: [['tourism', /^(hotel|guest_house|hostel|motel)$/]],
};

/** Does an OSM element belong to the category? Unknown categories match any tag value containing the word. */
export function osmMatches(tags: Record<string, string>, category: string): boolean {
  const rules = OSM_CATEGORY_TAGS[category.toLowerCase()];
  if (rules) return rules.some(([k, re]) => re.test(tags[k] ?? ''));
  const word = category.toLowerCase().replace(/_/g, ' ');
  return ['shop', 'amenity', 'leisure', 'office', 'craft', 'tourism'].some((k) => (tags[k] ?? '').replace(/_/g, ' ').includes(word));
}

/** OSM element → FoundLead (null when it has no name). */
export function osmToLead(e: any, category: string, fallbackLocation: string): FoundLead | null {
  const t = e?.tags ?? {};
  const name = t.name ?? t['name:en'];
  if (!name) return null;
  const addr = [t['addr:housenumber'], t['addr:street'], t['addr:suburb'], t['addr:city']].filter(Boolean).join(', ');
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  const lead = {
    googlePlaceId: `osm-${e.type}-${e.id}`,
    businessName: t['name:en'] && t['name:en'] !== name ? `${t['name:en']} (${name})` : name,
    category,
    // Always end with the searched city/country so international leads read clearly ("12 MG Road, Pune, India").
    location: !addr ? fallbackLocation : addr.toLowerCase().includes(fallbackLocation.split(',')[0].trim().toLowerCase()) ? `${addr}, ${fallbackLocation.split(',').slice(1).join(',').trim()}`.replace(/,\s*$/, '') : `${addr}, ${fallbackLocation}`,
    website: t.website ?? t['contact:website'] ?? null,
    email: t.email ?? t['contact:email'] ?? null,
    phone: t.phone ?? t['contact:phone'] ?? t['contact:mobile'] ?? null,
    description: [t.shop ?? t.amenity ?? t.leisure ?? t.tourism, t.opening_hours && `open ${t.opening_hours}`].filter(Boolean).join(' · ') || null,
    reviewCount: 0,
    ...(lat != null && lng != null ? { lat, lng } : {}),
  };
  return { ...lead, qualityScore: scoreLead(lead) };
}

/**
 * LEAD_DEMO_EMAIL set → every lead's email becomes that address (the real one is kept in the description),
 * so the whole sales flow can be tested against real businesses without mailing them.
 */
export function applyDemoEmail(l: FoundLead, demo = process.env.LEAD_DEMO_EMAIL?.trim()): FoundLead {
  if (!demo) return l;
  const note = `DEMO lead — real business, email replaced${l.email ? ` (real: ${l.email})` : ''}`;
  return { ...l, email: demo, description: l.description ? `${l.description} · ${note}` : note };
}

const OVERPASS_URL = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.websiteUri',
  'places.nationalPhoneNumber', 'places.userRatingCount', 'places.editorialSummary', 'places.location',
].join(',');

const SEARCH_OFFSETS: Record<string, number> = { best: 0, popular: 0 };

@Injectable()
export class LeadSearchService {
  private readonly logger = new Logger(LeadSearchService.name);

  private get enabled() {
    return process.env.LEAD_GEN_PROVIDER_ENABLED === 'true' && !!process.env.GOOGLE_PLACES_API_KEY;
  }

  /** google (needs key) | osm (free, real OpenStreetMap businesses) | mock. Default: google when enabled, else mock. */
  get source(): 'google' | 'osm' | 'mock' {
    const s = (process.env.LEAD_GEN_SOURCE ?? '').toLowerCase();
    if (s === 'osm' || s === 'mock') return s;
    return this.enabled ? 'google' : 'mock';
  }

  async search(q: LeadSearchQuery, knownPlaceIds: Set<string> = new Set()): Promise<FoundLead[]> {
    return (await this.searchRaw(q, knownPlaceIds)).map((l) => applyDemoEmail(l));
  }

  private osmCache = new Map<string, { at: number; elements: any[] }>();
  private geoCache = new Map<string, { lat: number; lon: number } | null>();

  /** Any place name in the world → coordinates (OpenStreetMap Nominatim, cached). */
  async geocode(location: string): Promise<{ lat: number; lon: number } | null> {
    if (this.geoCache.has(location)) return this.geoCache.get(location)!;
    const url = `${process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org'}/search?format=json&limit=1&q=${encodeURIComponent(location)}`;
    const res = await fetch(url, { headers: { 'User-Agent': `AEVORA-lead-gen/1.0 (${process.env.SMTP_USER ?? 'contact@aevora.local'})` }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Geocoding ${location}: ${res.status}`);
    const hit = ((await res.json()) as any[])[0];
    const out = hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : null;
    this.geoCache.set(location, out);
    return out;
  }

  /** Named businesses around a location (any country), one Overpass query per location per hour. */
  private async osmElements(location: string, radiusM = 8000): Promise<any[]> {
    const cached = this.osmCache.get(location);
    if (cached && Date.now() - cached.at < 3_600_000) return cached.elements;
    const c = await this.geocode(location);
    if (!c) { this.logger.warn(`OpenStreetMap: could not find "${location}"`); return []; }
    const r = Math.min(Math.max(1000, radiusM), 3000); // big cities have tens of thousands of shops
    const around = `(around:${r},${c.lat},${c.lon})`;
    const query = `[out:json][timeout:60];(nwr["shop"]["name"]${around};nwr["amenity"]["name"]${around};nwr["leisure"]["name"]${around};nwr["tourism"]["name"]${around};nwr["office"]["name"]${around};);out center 1500;`;
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AEVORA-lead-gen/1.0' },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`OpenStreetMap (Overpass) ${res.status}`);
    const elements = ((await res.json()) as any).elements ?? [];
    this.logger.log(`OpenStreetMap: ${elements.length} named places around ${location}`);
    this.osmCache.set(location, { at: Date.now(), elements });
    return elements;
  }

  private async searchOsm(q: LeadSearchQuery, max: number, known: Set<string>): Promise<FoundLead[]> {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${q.category} in ${q.location}`)}&format=json&limit=${max}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'AEVORA-lead-gen/1.0' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const elements = await res.json() as any[];
    const out: FoundLead[] = [];
    for (const e of elements) {
      if (!e.name) continue;
      const lead = {
        googlePlaceId: `osm-nom-${e.place_id}`,
        businessName: e.name,
        category: q.category,
        location: e.display_name,
        website: null,
        email: null,
        phone: null,
        description: `${e.class} · ${e.type}`,
        reviewCount: 0,
        lat: Number(e.lat),
        lng: Number(e.lon),
      };
      if (known.has(lead.googlePlaceId)) continue;
      out.push({ ...lead, qualityScore: scoreLead(lead) });
    }
    return out.sort((a, b) => b.qualityScore - a.qualityScore);
  }

  private async searchRaw(q: LeadSearchQuery, knownPlaceIds: Set<string>): Promise<FoundLead[]> {
    const max = Math.min(q.maxResults ?? 20, 20); // Places API page cap
    if (this.source === 'osm') return this.searchOsm(q, max, knownPlaceIds);
    if (this.source === 'mock') {
      this.logger.warn('Lead gen provider disabled (LEAD_GEN_PROVIDER_ENABLED!=true or no GOOGLE_PLACES_API_KEY) — returning mock leads');
      return this.mock(q, max).filter((l) => !knownPlaceIds.has(l.googlePlaceId));
    }

    const body: any = { textQuery: `${q.variant ? `${q.variant} ` : ''}${q.category} in ${q.location}`, maxResultCount: max };
    if (q.radius) {
      const center = await this.places({ textQuery: q.location, maxResultCount: 1 });
      const loc = center[0]?.location;
      if (loc) body.locationBias = { circle: { center: loc, radius: Math.min(q.radius, 50000) } };
    }

    const results: FoundLead[] = [];
    for (const p of await this.places(body)) {
      if (knownPlaceIds.has(p.id)) continue;
      const website: string | null = p.websiteUri ?? null;
      const lead = {
        googlePlaceId: p.id,
        businessName: p.displayName?.text ?? 'Unknown',
        category: q.category,
        location: p.formattedAddress ?? q.location,
        website,
        email: website ? await this.scrapeEmail(website) : null,
        phone: p.nationalPhoneNumber ?? null,
        description: p.editorialSummary?.text ?? null,
        reviewCount: p.userRatingCount ?? 0,
        lat: p.location?.latitude,
        lng: p.location?.longitude,
      };
      results.push({ ...lead, qualityScore: scoreLead(lead) });
    }
    return results;
  }

  private async places(body: any): Promise<any[]> {
    const res = await fetch(PLACES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Places API ${res.status}: ${await res.text()}`);
    return (await res.json()).places ?? [];
  }

  private async scrapeEmail(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const html = (await res.text()).slice(0, 500_000);
      const m = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.(?!png|jpg|jpeg|gif|svg|webp)[A-Z]{2,}/i);
      return m ? m[0].toLowerCase() : null;
    } catch {
      return null;
    }
  }

  private mock(q: LeadSearchQuery, max: number): FoundLead[] {
    return Array.from({ length: Math.min(max, 5) }, (_, i) => {
      const lead = {
        googlePlaceId: `mock-${q.variant ? `${q.variant}-` : ''}${q.category}-${q.location}-${i}`.replace(/\s+/g, '_'),
        businessName: `${q.category[0].toUpperCase()}${q.category.slice(1)} ${['Palace', 'Corner', 'Hub', 'Point', 'Express'][i]}`,
        category: q.category,
        location: q.location,
        website: i % 2 ? `https://example.com/${q.category}-${i}` : null,
        email: i % 3 ? null : `owner${i}@example.com`,
        phone: `+91-90000000${i}${i}`,
        description: `Mock ${q.category} lead`,
        reviewCount: 20 * (i + 1),
      };
      return { ...lead, qualityScore: scoreLead(lead) };
    });
  }
}
