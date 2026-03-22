// Map styles — Stadia Maps (200k req/month free). Get a key at stadiamaps.com
export const STADIA_API_KEY = process.env.EXPO_PUBLIC_STADIA_KEY ?? '';
const STADIA_KEY = STADIA_API_KEY;
if (__DEV__) console.log('[map] STADIA_KEY present:', STADIA_KEY.length > 0);

// Inline style objects with the API key baked into each tile URL.
// mapStyle accepts objects directly — no JSON.stringify needed.
const stadiaStyle = (tileset: string) => ({
	version: 8 as const,
	sources: {
		stadia: {
			type: 'raster' as const,
			tiles: [
				`https://tiles.stadiamaps.com/tiles/${tileset}/{z}/{x}/{y}@2x.png?api_key=${STADIA_KEY}`,
			],
			tileSize: 256,
			attribution:
				'© <a href="https://stadiamaps.com/">Stadia Maps</a> © <a href="https://openmaptiles.org/">OpenMapTiles</a> © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
		},
	},
	layers: [{ id: 'stadia-raster', type: 'raster' as const, source: 'stadia' }],
});

export const MAP_STYLES = [
	{ id: 'outdoors', label: 'Outdoors', style: stadiaStyle('outdoors') },
	{ id: 'terrain', label: 'Terrain', style: stadiaStyle('stamen_terrain') },
	{
		id: 'satellite',
		label: 'Satellite',
		style: stadiaStyle('alidade_satellite'),
	},
] as const;

export type MapStyleId = (typeof MAP_STYLES)[number]['id'];

// Tile URL for offline pack downloads
export const OFFLINE_TILE_URL = `https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}@2x.png?api_key=${STADIA_KEY}`;

// Stadia routing (Valhalla) — same API key as tiles, no separate account needed
export const VALHALLA_BASE_URL = 'https://api.stadiamaps.com';

// Default map center (Colorado — great for hiking demos)
export const DEFAULT_CENTER: [number, number] = [-105.6836, 40.3428];
export const DEFAULT_ZOOM = 12;

// Offline pack settings
export const OFFLINE_MIN_ZOOM = 10;
export const OFFLINE_MAX_ZOOM = 16;
