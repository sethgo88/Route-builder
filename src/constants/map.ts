// Map style: OpenFreeMap liberty style — 100% free, no API key required
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// Topo overlay: OpenTopoMap — free, no API key, shows trails + contours
export const TOPO_TILE_URL = 'https://tile.opentopomap.org/{z}/{x}/{y}.png';

// GraphHopper routing API — register free at graphhopper.com (~500 req/day)
export const GRAPHHOPPER_BASE_URL = 'https://graphhopper.com/api/1';
export const GRAPHHOPPER_API_KEY = process.env.EXPO_PUBLIC_GRAPHHOPPER_KEY ?? '';

// Default map center (Colorado — great for hiking demos)
export const DEFAULT_CENTER: [number, number] = [-105.6836, 40.3428];
export const DEFAULT_ZOOM = 12;

// Offline pack settings
export const OFFLINE_MIN_ZOOM = 10;
export const OFFLINE_MAX_ZOOM = 16;
