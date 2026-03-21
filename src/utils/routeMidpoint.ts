import type { Coordinate } from '../store/routeStore';

/** Index of the route coordinate closest to [lon, lat], searching from `fromIndex` forward. */
function closestIndex(coords: number[][], fromIndex: number, lon: number, lat: number): number {
  let bestIdx = fromIndex;
  let bestDist = Infinity;
  for (let i = fromIndex; i < coords.length; i++) {
    const dx = coords[i][0] - lon;
    const dy = coords[i][1] - lat;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Coordinate at the geographic midpoint (by cumulative distance) of a coordinate array. */
function midpointAlongPath(coords: number[][]): [number, number] {
  if (coords.length === 1) return [coords[0][0], coords[0][1]];

  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
  }

  const half = total / 2;
  let walked = 0;
  for (let i = 1; i < coords.length; i++) {
    const seg = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
    if (walked + seg >= half) {
      const t = seg === 0 ? 0 : (half - walked) / seg;
      return [
        coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]),
        coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1]),
      ];
    }
    walked += seg;
  }
  return [coords[coords.length - 1][0], coords[coords.length - 1][1]];
}

/**
 * For each consecutive waypoint pair, returns the coordinate at the midpoint
 * along the actual route line (not the straight-line midpoint).
 */
export function computeSegmentMidpoints(
  routeCoords: number[][],
  waypoints: Coordinate[],
): Coordinate[] {
  if (waypoints.length < 2 || routeCoords.length === 0) return [];

  // Find the route index closest to each waypoint, advancing forward each time
  const indices: number[] = [];
  let searchFrom = 0;
  for (const wp of waypoints) {
    const idx = closestIndex(routeCoords, searchFrom, wp.longitude, wp.latitude);
    indices.push(idx);
    searchFrom = idx;
  }

  const midpoints: Coordinate[] = [];
  for (let i = 0; i < indices.length - 1; i++) {
    const segment = routeCoords.slice(indices[i], indices[i + 1] + 1);
    const [longitude, latitude] = midpointAlongPath(segment.length >= 2 ? segment : routeCoords.slice(indices[i], indices[i] + 2));
    midpoints.push({ longitude, latitude });
  }
  return midpoints;
}
