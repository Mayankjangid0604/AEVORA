import { companyProfile } from '../config/company';
import { cityCoordinates } from './india-cities';
export type PinType = 'LEAD' | 'PROJECT' | 'PAID_CLIENT';

export interface MapPin {
  id: string;
  type: PinType;
  name: string;
  status: string;
  valuePaise: number;
  lat: number;
  lng: number;
  approximate: boolean; // true = placed near Sikar by industry, not a real Google Places location
  industry?: string;
  address?: string;
}

interface LeadLike {
  id: string;
  name: string;
  status: string;
  industry: string | null;
  geography: string | null;
  metadata: unknown;
}

interface ProjectLike {
  id: string;
  status: string;
  quotedAmount: number | null;
  lead: LeadLike;
}

export const SIKAR = { lat: 27.6094, lng: 75.1399 };

// Industry → neighbourhood offset from Sikar centre, so approximate pins don't pile up on one spot.
const AREA_OFFSETS: Record<string, { lat: number; lng: number }> = {
  restaurant: { lat: 0.02, lng: 0.01 },
  gym: { lat: -0.01, lng: 0.02 },
  salon: { lat: 0.015, lng: -0.015 },
  medical_clinic: { lat: -0.02, lng: -0.01 },
  coaching_center: { lat: 0.01, lng: 0.025 },
  retail_shop: { lat: -0.015, lng: 0.015 },
  hardware_store: { lat: 0.025, lng: -0.02 },
  hotel: { lat: -0.005, lng: 0.03 },
};

const PAID = ['PAID', 'CLOSED'];
const CLOSED_LOST = ['FAILED'];

/**
 * Stored coordinates first (Google Places, the city-table backfill, or set by the Chairman); then the lead's city from
 * the bundled Indian city table; otherwise a stable made-up spot near Sikar (approximate — never shown on the globe).
 */
export function leadCoordinates(lead: Pick<LeadLike, 'id' | 'industry' | 'metadata'> & Partial<Pick<LeadLike, 'geography'>>): { lat: number; lng: number; approximate: boolean } {
  const m = (lead.metadata ?? {}) as { lat?: unknown; lng?: unknown };
  if (typeof m.lat === 'number' && typeof m.lng === 'number' && Number.isFinite(m.lat) && Number.isFinite(m.lng)) {
    return { lat: m.lat, lng: m.lng, approximate: false };
  }
  const city = cityCoordinates(lead.geography);
  if (city) return { lat: city.lat, lng: city.lng, approximate: false };
  const offset = AREA_OFFSETS[(lead.industry ?? '').toLowerCase().replace(/\s+/g, '_')] ?? { lat: 0, lng: 0 };
  const hash = [...lead.id].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const spread = 0.008;
  return {
    lat: SIKAR.lat + offset.lat + ((hash % 100) / 100 - 0.5) * spread,
    lng: SIKAR.lng + offset.lng + (((hash * 7) % 100) / 100 - 0.5) * spread,
    approximate: true,
  };
}

/** One pin per business: a lead's pin is replaced by its client project (latest project wins). */
export function buildPins(leads: LeadLike[], projects: ProjectLike[]) {
  const byLead = new Map<string, MapPin>();
  for (const lead of leads) {
    byLead.set(lead.id, {
      id: lead.id,
      type: lead.status === 'CONVERTED' ? 'PAID_CLIENT' : 'LEAD',
      name: lead.name,
      status: lead.status,
      valuePaise: 0,
      ...leadCoordinates(lead),
      industry: lead.industry ?? undefined,
      address: lead.geography ?? companyProfile().address,
    });
  }
  for (const p of projects) {
    if (CLOSED_LOST.includes(p.status)) continue;
    byLead.set(p.lead.id, {
      id: p.id,
      type: PAID.includes(p.status) ? 'PAID_CLIENT' : 'PROJECT',
      name: p.lead.name,
      status: p.status,
      valuePaise: p.quotedAmount ?? 0,
      ...leadCoordinates(p.lead),
      industry: p.lead.industry ?? undefined,
      address: p.lead.geography ?? companyProfile().address,
    });
  }
  const pins = [...byLead.values()];
  const sumRs = (type: PinType) => Math.round(pins.filter((p) => p.type === type).reduce((s, p) => s + p.valuePaise, 0) / 100);
  return {
    pins,
    summary: {
      totalPins: pins.length,
      leads: pins.filter((p) => p.type === 'LEAD').length,
      activeProjects: pins.filter((p) => p.type === 'PROJECT').length,
      paidClients: pins.filter((p) => p.type === 'PAID_CLIENT').length,
      totalPipelineRs: sumRs('PROJECT'), // open projects only
      paidRs: sumRs('PAID_CLIENT'),
      approximatePins: pins.filter((p) => p.approximate).length,
    },
  };
}
