// Map styles — Stadia Maps (200k req/month free). Get a key at stadiamaps.com
const STADIA_KEY = process.env.EXPO_PUBLIC_STADIA_KEY ?? '';
const stadia = (style: string) =>
  `https://tiles.stadiamaps.com/styles/${style}.json?api_key=${STADIA_KEY}`;

export const MAP_STYLES = [
  { id: 'outdoors',  label: 'Outdoors',  url: stadia('outdoors') },
  { id: 'terrain',   label: 'Terrain',   url: stadia('stamen_terrain') },
  { id: 'satellite', label: 'Satellite', url: stadia('alidade_satellite') },
] as const;

export type MapStyleId = (typeof MAP_STYLES)[number]['id'];

// Legacy alias used by ControlsPanel offline downloads (defaults to Outdoors)
export const MAP_STYLE_URL = MAP_STYLES[0].url;

// GraphHopper routing API — register free at graphhopper.com (~500 req/day)
export const GRAPHHOPPER_BASE_URL = 'https://graphhopper.com/api/1';
export const GRAPHHOPPER_API_KEY = process.env.EXPO_PUBLIC_GRAPHHOPPER_KEY ?? '';

// Default map center (Colorado — great for hiking demos)
export const DEFAULT_CENTER: [number, number] = [-105.6836, 40.3428];
export const DEFAULT_ZOOM = 12;

// Offline pack settings
export const OFFLINE_MIN_ZOOM = 10;
export const OFFLINE_MAX_ZOOM = 16;
