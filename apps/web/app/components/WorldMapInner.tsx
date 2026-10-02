'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import { PIN_COLORS, type MapPin } from './map-pins';

const PIN_LABELS: Record<MapPin['type'], string> = { LEAD: 'Lead', PROJECT: 'Active project', PAID_CLIENT: 'Paid client' };
const SIKAR: [number, number] = [27.6094, 75.1399];

// Business names come from Google Places — never put them into popup HTML unescaped.
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function popupHtml(pin: MapPin): string {
  const color = PIN_COLORS[pin.type];
  const value = pin.valuePaise > 0 ? `<br><strong>Value:</strong> ₹${Math.round(pin.valuePaise / 100).toLocaleString('en-IN')}` : '';
  return `<div style="font-family:sans-serif;min-width:160px">
    <div style="font-weight:700;font-size:14px;margin-bottom:4px">${esc(pin.name)}</div>
    <div style="font-size:12px;color:${color};font-weight:600">${PIN_LABELS[pin.type]}</div>
    <div style="font-size:12px;color:#555;margin-top:4px">
      ${pin.industry ? `Industry: ${esc(pin.industry)}<br>` : ''}Status: ${esc(pin.status)}${value}
      <br>${esc(pin.address || '')}${pin.approximate ? '<br><em>Approximate location</em>' : ''}
    </div>
  </div>`;
}

/** Leaflet + OpenStreetMap (no API key). The map is created once; pin refreshes only redraw the marker layer. */
export default function WorldMapInner({ pins, height = '500px' }: { pins: MapPin[]; height?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  const draw = () => {
    const L = leafletRef.current;
    const layer = layerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    for (const pin of pinsRef.current) {
      L.circleMarker([pin.lat, pin.lng], {
        radius: pin.type === 'PAID_CLIENT' ? 10 : 7,
        fillColor: PIN_COLORS[pin.type],
        color: '#fff',
        weight: 2,
        fillOpacity: 0.9,
      })
        .bindPopup(popupHtml(pin))
        .addTo(layer);
    }
  };

  useEffect(() => {
    let cancelled = false;
    import('leaflet').then((L) => {
      if (cancelled || !containerRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { center: SIKAR, zoom: 13 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      draw();
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(draw, [pins]);

  return <div ref={containerRef} role="application" aria-label="Client map of Sikar" style={{ height, width: '100%', borderRadius: 12, overflow: 'hidden' }} />;
}
