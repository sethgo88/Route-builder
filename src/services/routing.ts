import type { Feature, LineString } from 'geojson';
import { GRAPHHOPPER_BASE_URL, GRAPHHOPPER_API_KEY } from '../constants/map';
import type { Coordinate, RouteStats } from '../store/routeStore';

export interface RouteResult {
  route: Feature<LineString>;
  /** [distanceKm, elevationM] pairs along the route */
  elevationData: [number, number][];
  stats: RouteStats;
}

/** Haversine distance between two lat/lng points in kilometres */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildElevationProfile(
  coords: number[][],
): [number, number][] {
  if (coords.length === 0) return [];
  let distKm = 0;
  const profile: [number, number][] = [[0, coords[0][2] ?? 0]];

  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2, ele] = coords[i];
    distKm += haversineKm(lat1, lon1, lat2, lon2);
    profile.push([distKm, ele ?? 0]);
  }
  return profile;
}

/**
 * Fetches a route from GraphHopper between the given waypoints.
 *
 * @param waypoints  Array of at least 2 coordinates
 * @param snapToTrails  true → 'hike' profile (follows OSM trails)
 *                      false → 'foot' profile (more direct)
 */
export async function fetchRoute(
  waypoints: Coordinate[],
  snapToTrails: boolean,
): Promise<RouteResult> {
  if (!GRAPHHOPPER_API_KEY) {
    throw new Error(
      'GraphHopper API key not set. Add EXPO_PUBLIC_GRAPHHOPPER_KEY to your .env file.',
    );
  }

  const profile = snapToTrails ? 'hike' : 'foot';

  const response = await fetch(
    `${GRAPHHOPPER_BASE_URL}/route?key=${GRAPHHOPPER_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: waypoints.map((wp) => [wp.longitude, wp.latitude]),
        profile,
        elevation: true,
        points_encoded: false,
        instructions: false,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GraphHopper error ${response.status}: ${body}`);
  }

  const data = await response.json();
  const path = data.paths?.[0];
  if (!path) throw new Error('No route found between waypoints');

  const coords: number[][] = path.points.coordinates;

  const route: Feature<LineString> = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: {},
  };

  const elevationData = buildElevationProfile(coords);

  const stats: RouteStats = {
    distanceKm: (path.distance as number) / 1000,
    gainM: path.ascend as number ?? 0,
    lossM: path.descend as number ?? 0,
  };

  return { route, elevationData, stats };
}
