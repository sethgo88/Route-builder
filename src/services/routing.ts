import type { Feature, LineString } from 'geojson';
import { VALHALLA_BASE_URL, STADIA_API_KEY } from '../constants/map';
import type { Coordinate, RouteStats } from '../store/routeStore';

export interface RouteResult {
  route: Feature<LineString>;
  /** [distanceKm, elevationM] pairs along the route */
  elevationData: [number, number][];
  stats: RouteStats;
}

function calcGainLoss(heights: number[]): { gainM: number; lossM: number } {
  let gainM = 0;
  let lossM = 0;
  for (let i = 1; i < heights.length; i++) {
    const diff = heights[i] - heights[i - 1];
    if (diff > 0) gainM += diff;
    else lossM += -diff;
  }
  return { gainM, lossM };
}

/**
 * Fetches a route from Stadia Valhalla between the given waypoints.
 * Uses the 'pedestrian' costing; snapToTrails boosts trail preference.
 */
export async function fetchRoute(
  waypoints: Coordinate[],
  snapToTrails: boolean,
): Promise<RouteResult> {
  if (!STADIA_API_KEY) {
    throw new Error(
      'Stadia API key not set. Add EXPO_PUBLIC_STADIA_KEY to your .env file.',
    );
  }

  const locations = waypoints.map((wp) => ({ lon: wp.longitude, lat: wp.latitude }));

  // 1. Fetch route geometry
  const routeResponse = await fetch(
    `${VALHALLA_BASE_URL}/route?api_key=${STADIA_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations,
        costing: 'pedestrian',
        costing_options: {
          pedestrian: { use_trails: snapToTrails ? 1.0 : 0.5 },
        },
        shape_format: 'geojson',
        directions_type: 'none',
      }),
    },
  );

  if (!routeResponse.ok) {
    const body = await routeResponse.text();
    throw new Error(`Valhalla route error ${routeResponse.status}: ${body}`);
  }

  const routeData = await routeResponse.json();
  const leg = routeData.trip?.legs?.[0];
  if (!leg) throw new Error('No route found between waypoints');

  // shape is GeoJSON geometry: { type: 'LineString', coordinates: [[lon, lat], ...] }
  const coords: [number, number][] = leg.shape.coordinates;
  const distanceKm: number = routeData.trip.summary.length; // already in km

  const route: Feature<LineString> = {
    type: 'Feature',
    geometry: leg.shape,
    properties: {},
  };

  // 2. Fetch elevation for each shape point
  const heightResponse = await fetch(
    `${VALHALLA_BASE_URL}/height?api_key=${STADIA_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shape: coords.map(([lon, lat]) => ({ lon, lat })),
        range: true,
      }),
    },
  );

  if (!heightResponse.ok) {
    const body = await heightResponse.text();
    throw new Error(`Valhalla height error ${heightResponse.status}: ${body}`);
  }

  const heightData = await heightResponse.json();
  // range_height: [[rangeKm, elevationM], ...]
  const elevationData: [number, number][] = heightData.range_height ?? [];
  const heights = elevationData.map(([_, h]) => h);
  const { gainM, lossM } = calcGainLoss(heights);

  const stats: RouteStats = { distanceKm, gainM, lossM };

  return { route, elevationData, stats };
}
