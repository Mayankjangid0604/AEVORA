/** Shared by the map (client-only) and pages, without pulling Leaflet into the page bundle. */
export interface MapPin {
  id: string;
  type: 'LEAD' | 'PROJECT' | 'PAID_CLIENT';
  name: string;
  status: string;
  valuePaise: number;
  lat: number;
  lng: number;
  approximate?: boolean;
  industry?: string;
  address?: string;
}

export const PIN_COLORS: Record<MapPin['type'], string> = {
  LEAD: '#f97316', // orange
  PROJECT: '#3b82f6', // blue
  PAID_CLIENT: '#22c55e', // green
};
