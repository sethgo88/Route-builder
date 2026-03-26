import type { Feature, LineString } from 'geojson';
import { z } from 'zod';
import { STADIA_API_KEY, VALHALLA_BASE_URL } from '../constants/map';
import type { Coordinate, RouteStats, Waypoint } from '../store/routeStore';

/**
 * Valhalla encodes route geometry at precision 1e6 (polyline6).
 * Standard Google Maps polyline uses 1e5 (polyline5) — do NOT change this value.
 */
const POLYLINE6_PRECISION = 1e6;

const ValhallaRouteResponseSchema = z.object({
	trip: z.object({
		legs: z.array(z.object({ shape: z.string() })).min(1),
		summary: z.object({ length: z.number() }),
	}),
});

const ElevationResponseSchema = z.object({
	range_height: z.array(z.tuple([z.number(), z.number()])),
});

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
	if (!encoded) return [];
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
		const decodedLat = lat / POLYLINE6_PRECISION;
		const decodedLon = lon / POLYLINE6_PRECISION;
		if (Math.abs(decodedLat) > 90 || Math.abs(decodedLon) > 180) {
			throw new Error(
				`Decoded coordinate out of range: [${decodedLon}, ${decodedLat}]`,
			);
		}
		coords.push([decodedLon, decodedLat]); // GeoJSON is [lon, lat]
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
 * Calls Valhalla to get route shape points between exactly two coordinates.
 * Returns decoded [lon, lat] pairs.
 */
async function fetchRouteShape(
	from: Coordinate,
	to: Coordinate,
	walkingSpeed: number,
): Promise<[number, number][]> {
	const locations = [
		{ lon: from.longitude, lat: from.latitude, type: 'break' },
		{ lon: to.longitude, lat: to.latitude, type: 'break' },
	];

	const response = await fetch(
		`${VALHALLA_BASE_URL}/route/v1?api_key=${STADIA_API_KEY}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				locations,
				costing: 'pedestrian',
				costing_options: {
					pedestrian: { use_trails: 1.0, walking_speed: walkingSpeed },
				},
				directions_type: 'none',
			}),
		},
	);

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Valhalla route error ${response.status}: ${body}`);
	}

	const parsed = ValhallaRouteResponseSchema.safeParse(await response.json());
	if (!parsed.success) {
		throw new Error(
			`Unexpected Valhalla route response: ${parsed.error.message}`,
		);
	}

	const coords: [number, number][] = [];
	for (const leg of parsed.data.trip.legs) {
		const legCoords = decodePolyline6(leg.shape);
		coords.push(...(coords.length > 0 ? legCoords.slice(1) : legCoords));
	}
	return coords;
}

/**
 * Fetches elevation data for the given [lon, lat] shape points.
 * Returns range_height (cumulative distance in metres + elevation) and raw heights.
 */
async function fetchElevationForCoords(
	coords: [number, number][],
): Promise<{ rangeHeight: [number, number][]; heights: number[] }> {
	const response = await fetch(
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

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Elevation error ${response.status}: ${body}`);
	}

	const parsed = ElevationResponseSchema.safeParse(await response.json());
	if (!parsed.success) {
		throw new Error(`Unexpected elevation response: ${parsed.error.message}`);
	}

	const rangeHeight = parsed.data.range_height;
	const heights = rangeHeight.map(([, h]) => h);
	return { rangeHeight, heights };
}

/**
 * Fetches a route from Stadia Valhalla between the given waypoints.
 * Uses the 'pedestrian' costing; snapToTrails boosts trail preference.
 */
export async function fetchRoute(
	waypoints: Coordinate[],
	snapToTrails: boolean,
	walkingSpeed: number,
): Promise<RouteResult> {
	if (!STADIA_API_KEY) {
		throw new Error(
			'Stadia API key not set. Add EXPO_PUBLIC_STADIA_KEY to your .env file.',
		);
	}

	const locations = waypoints.map((wp) => ({
		lon: wp.longitude,
		lat: wp.latitude,
		type: 'break',
	}));

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
					pedestrian: {
						use_trails: snapToTrails ? 1.0 : 0.5,
						walking_speed: walkingSpeed,
					},
				},
				directions_type: 'none',
			}),
		},
	);

	if (!routeResponse.ok) {
		const body = await routeResponse.text();
		throw new Error(`Valhalla route error ${routeResponse.status}: ${body}`);
	}

	const routeParsed = ValhallaRouteResponseSchema.safeParse(
		await routeResponse.json(),
	);
	if (!routeParsed.success) {
		throw new Error(
			`Unexpected Valhalla route response: ${routeParsed.error.message}`,
		);
	}
	const { legs } = routeParsed.data.trip;

	// Concatenate all legs; skip the duplicate junction point between legs
	const coords: [number, number][] = [];
	for (const leg of legs) {
		const legCoords = decodePolyline6(leg.shape);
		coords.push(...(coords.length > 0 ? legCoords.slice(1) : legCoords));
	}
	const distanceKm = routeParsed.data.trip.summary.length; // already in km

	const route: Feature<LineString> = {
		type: 'Feature',
		geometry: { type: 'LineString', coordinates: coords },
		properties: {},
	};

	// 2. Fetch elevation for each shape point
	const { rangeHeight, heights } = await fetchElevationForCoords(coords);
	const { gainM, lossM } = calcGainLoss(heights);

	// Normalise range to km so elevationData matches the [distanceKm, elevationM] contract
	const elevationData: [number, number][] = rangeHeight.map(([r, h]) => [
		r / 1000,
		h,
	]);

	const stats: RouteStats = { distanceKm, gainM, lossM };

	return { route, elevationData, stats };
}

/**
 * Routes each segment independently using the snapAfter value stored on each waypoint.
 * snapAfter = true  → Valhalla trail routing
 * snapAfter = false → straight line between the two waypoints
 * Elevation is fetched once for the full concatenated shape.
 */
export async function fetchRouteSegmented(
	waypoints: Waypoint[],
	walkingSpeed: number,
): Promise<RouteResult> {
	if (!STADIA_API_KEY) {
		throw new Error(
			'Stadia API key not set. Add EXPO_PUBLIC_STADIA_KEY to your .env file.',
		);
	}

	// Build shape by routing each pair of adjacent waypoints
	const allCoords: [number, number][] = [];
	for (let i = 0; i < waypoints.length - 1; i++) {
		const from = waypoints[i].coordinate;
		const to = waypoints[i + 1].coordinate;
		let segCoords: [number, number][];

		if (waypoints[i + 1].snapAfter) {
			segCoords = await fetchRouteShape(from, to, walkingSpeed);
		} else {
			// Straight line — just the two endpoints
			segCoords = [
				[from.longitude, from.latitude],
				[to.longitude, to.latitude],
			];
		}

		// Skip duplicate junction point when appending after the first segment
		allCoords.push(...(allCoords.length > 0 ? segCoords.slice(1) : segCoords));
	}

	const route: Feature<LineString> = {
		type: 'Feature',
		geometry: { type: 'LineString', coordinates: allCoords },
		properties: {},
	};

	// Fetch elevation once for the full shape
	const { rangeHeight, heights } = await fetchElevationForCoords(allCoords);
	const { gainM, lossM } = calcGainLoss(heights);

	// Normalise range to km; last range_height entry gives total distance
	const elevationData: [number, number][] = rangeHeight.map(([r, h]) => [
		r / 1000,
		h,
	]);
	const distanceKm =
		rangeHeight.length > 0 ? rangeHeight[rangeHeight.length - 1][0] / 1000 : 0;

	return { route, elevationData, stats: { distanceKm, gainM, lossM } };
}
