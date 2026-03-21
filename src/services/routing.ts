import type { Feature, LineString } from 'geojson';
import { VALHALLA_BASE_URL, STADIA_API_KEY } from '../constants/map';
import type { Coordinate, RouteStats } from '../store/routeStore';

export interface RouteResult {
  route: Feature<LineString>;
  /** [distanceKm, elevationM] pairs along the route */
  elevationData: [number, number][];
  stats: RouteStats;
}

/**
 * Decodes a Valhalla polyline6-encoded string into [lon, lat] coordinate pairs.
 * Valhalla encodes at precision 1e6 and returns [lat, lon] order.
 */
function decodePolyline6(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lon += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lon / 1e6, lat / 1e6]); // GeoJSON is [lon, lat]
  }
  return coords;
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

  const locations = waypoints.map((wp) => ({ lon: wp.longitude, lat: wp.latitude, type: 'break' }));

  // 1. Fetch route geometry
  const routeResponse = await fetch(
    `${VALHALLA_BASE_URL}/route/v1?api_key=${STADIA_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations,
        costing: 'pedestrian',
        costing_options: {
          pedestrian: { use_trails: snapToTrails ? 1.0 : 0.5 },
        },
        directions_type: 'none',
      }),
    },
  );

  if (!routeResponse.ok) {
    const body = await routeResponse.text();
    throw new Error(`Valhalla route error ${routeResponse.status}: ${body}`);
  }

  const routeData = await routeResponse.json();
  const legs: Array<{ shape: string }> = routeData.trip?.legs;
  if (!legs?.length) throw new Error('No route found between waypoints');

  // Concatenate all legs; skip the duplicate junction point between legs
  const coords: [number, number][] = [];
  for (const leg of legs) {
    const legCoords = decodePolyline6(leg.shape);
    coords.push(...(coords.length > 0 ? legCoords.slice(1) : legCoords));
  }
  const distanceKm: number = routeData.trip.summary.length; // already in km

  const route: Feature<LineString> = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: {},
  };

  // 2. Fetch elevation for each shape point
  const elevationResponse = await fetch(
    `${VALHALLA_BASE_URL}/elevation/v1?api_key=${STADIA_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shape: coords.map(([lon, lat]) => ({ lon, lat })),
        range: true,
      }),
    },
  );

  if (!elevationResponse.ok) {
    const body = await elevationResponse.text();
    throw new Error(`Elevation error ${elevationResponse.status}: ${body}`);
  }

  const elevationData = await elevationResponse.json();
  // range_height: [[rangeKm, elevationM], ...]
  const rangeHeight: [number, number][] = elevationData.range_height ?? [];
  const heights = rangeHeight.map(([_, h]) => h);
  const { gainM, lossM } = calcGainLoss(heights);

  const stats: RouteStats = { distanceKm, gainM, lossM };

  return { route, elevationData: rangeHeight, stats };
}
