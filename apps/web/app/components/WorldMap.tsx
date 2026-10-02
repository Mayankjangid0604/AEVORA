'use client';

import dynamic from 'next/dynamic';

export { PIN_COLORS, type MapPin } from './map-pins';

/** Leaflet needs the browser DOM, so the map only renders client-side. */
const WorldMap = dynamic(() => import('./WorldMapInner'), {
  ssr: false,
  loading: () => <div className="state-loading" style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading map…</div>,
});

export default WorldMap;
