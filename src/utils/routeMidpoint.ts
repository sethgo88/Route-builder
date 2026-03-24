import type { Coordinate } from '../store/routeStore';

/**
 * How many route coords to look ahead/behind when computing a local tangent.
 * Higher = smoother bearing; lower = more responsive to tight curves.
 */
const BEARING_LOOK = 2;

/**
 * Compass bearing (0=N, 90=E) along the route at `centerIdx`,
 * averaged over ±BEARING_LOOK coords.
 */
function routeBearingAt(coords: number[][], centerIdx: number): number {
	const from = Math.max(0, centerIdx - BEARING_LOOK);
	const to = Math.min(coords.length - 1, centerIdx + BEARING_LOOK);
	if (from === to) return 0;
	const [lon1, lat1] = coords[from];
	const [lon2, lat2] = coords[to];
	const dLon = ((lon2 - lon1) * Math.PI) / 180;
	const r1 = (lat1 * Math.PI) / 180;
	const r2 = (lat2 * Math.PI) / 180;
	const y = Math.sin(dLon) * Math.cos(r2);
	const x =
		Math.cos(r1) * Math.sin(r2) -
		Math.sin(r1) * Math.cos(r2) * Math.cos(dLon);
	return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Index of the route coordinate closest to [lon, lat], searching from `fromIndex` forward. */
function closestIndex(
	coords: number[][],
	fromIndex: number,
	lon: number,
	lat: number,
): number {
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
		total += Math.hypot(
			coords[i][0] - coords[i - 1][0],
			coords[i][1] - coords[i - 1][1],
		);
	}

	const half = total / 2;
	let walked = 0;
	for (let i = 1; i < coords.length; i++) {
		const seg = Math.hypot(
			coords[i][0] - coords[i - 1][0],
			coords[i][1] - coords[i - 1][1],
		);
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
 * Splits the route into one coordinate sub-array per consecutive waypoint pair.
 * Returns N-1 arrays for N waypoints.
 */
export function splitRouteByWaypoints(
	routeCoords: number[][],
	waypoints: Coordinate[],
): number[][][] {
	if (waypoints.length < 2 || routeCoords.length === 0) return [];

	const indices: number[] = [];
	let searchFrom = 0;
	for (const wp of waypoints) {
		const idx = closestIndex(
			routeCoords,
			searchFrom,
			wp.longitude,
			wp.latitude,
		);
		indices.push(idx);
		searchFrom = idx;
	}

	const segments: number[][][] = [];
	for (let i = 0; i < indices.length - 1; i++) {
		const seg = routeCoords.slice(indices[i], indices[i + 1] + 1);
		segments.push(
			seg.length >= 2 ? seg : routeCoords.slice(indices[i], indices[i] + 2),
		);
	}
	return segments;
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
		const idx = closestIndex(
			routeCoords,
			searchFrom,
			wp.longitude,
			wp.latitude,
		);
		indices.push(idx);
		searchFrom = idx;
	}

	const midpoints: Coordinate[] = [];
	for (let i = 0; i < indices.length - 1; i++) {
		const segment = routeCoords.slice(indices[i], indices[i + 1] + 1);
		const [longitude, latitude] = midpointAlongPath(
			segment.length >= 2
				? segment
				: routeCoords.slice(indices[i], indices[i] + 2),
		);
		midpoints.push({ longitude, latitude });
	}
	return midpoints;
}

/**
 * Like computeSegmentMidpoints but also returns the local route bearing at each midpoint.
 * The bearing is computed from the actual route tangent (not straight-line between waypoints).
 */
export function computeSegmentMidpointsWithBearings(
	routeCoords: number[][],
	waypoints: Coordinate[],
): Array<{ coordinate: Coordinate; bearing: number }> {
	if (waypoints.length < 2 || routeCoords.length === 0) return [];

	const indices: number[] = [];
	let searchFrom = 0;
	for (const wp of waypoints) {
		const idx = closestIndex(routeCoords, searchFrom, wp.longitude, wp.latitude);
		indices.push(idx);
		searchFrom = idx;
	}

	return Array.from({ length: indices.length - 1 }, (_, i) => {
		const slice = routeCoords.slice(indices[i], indices[i + 1] + 1);
		const seg = slice.length >= 2 ? slice : routeCoords.slice(indices[i], indices[i] + 2);

		// Walk to the midpoint and track which segment index it falls in
		let total = 0;
		for (let k = 1; k < seg.length; k++) {
			total += Math.hypot(seg[k][0] - seg[k - 1][0], seg[k][1] - seg[k - 1][1]);
		}
		const half = total / 2;
		let walked = 0;
		let midCoord: [number, number] = [seg[0][0], seg[0][1]];
		let localMidIdx = 0;
		for (let k = 1; k < seg.length; k++) {
			const d = Math.hypot(seg[k][0] - seg[k - 1][0], seg[k][1] - seg[k - 1][1]);
			if (walked + d >= half) {
				const t = d === 0 ? 0 : (half - walked) / d;
				midCoord = [
					seg[k - 1][0] + t * (seg[k][0] - seg[k - 1][0]),
					seg[k - 1][1] + t * (seg[k][1] - seg[k - 1][1]),
				];
				localMidIdx = k;
				break;
			}
			walked += d;
			localMidIdx = k;
		}

		// Convert local segment index back to global route index for accurate tangent
		const globalMidIdx = indices[i] + localMidIdx;
		return {
			coordinate: { longitude: midCoord[0], latitude: midCoord[1] },
			bearing: routeBearingAt(routeCoords, globalMidIdx),
		};
	});
}

/**
 * Returns the local route bearing at each waypoint, derived from the route tangent
 * rather than the straight line between neighboring waypoints.
 */
export function computeWaypointBearingsFromRoute(
	routeCoords: number[][],
	waypoints: Coordinate[],
): number[] {
	if (routeCoords.length < 2) return waypoints.map(() => 0);

	const bearings: number[] = [];
	let searchFrom = 0;
	for (const wp of waypoints) {
		const idx = closestIndex(routeCoords, searchFrom, wp.longitude, wp.latitude);
		bearings.push(routeBearingAt(routeCoords, idx));
		searchFrom = idx;
	}
	return bearings;
}
