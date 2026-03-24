import MapLibreGL from '@maplibre/maplibre-react-native';
import type { Feature, LineString, MultiLineString } from 'geojson';
import { useMemo } from 'react';
import { useRouteStore } from '../store/routeStore';
import { splitRouteByWaypoints } from '../utils/routeMidpoint';

const DOTTED_LINE = {
	lineColor: '#94a3b8',
	lineWidth: 2,
	lineDasharray: [4, 3],
};

/**
 * Renders the computed route as coloured segments.
 * - Segments adjacent to a dragging waypoint are suppressed (dragPreview covers them).
 * - Unsnapped segments (after drag end, before new route loads) render as dotted straight lines.
 * - Snapped segments render as a solid line using routeColor from the store.
 * Also renders drag-preview dotted lines while a marker is being dragged.
 * Must be a direct child of MapLibreGL.MapView.
 */
export default function RoutePolyline() {
	const route = useRouteStore((s) => s.route);
	const waypoints = useRouteStore((s) => s.waypoints);
	const routeColor = useRouteStore((s) => s.routeColor);
	const pendingDragSegments = useRouteStore((s) => s.pendingDragSegments);
	const draggingWaypointIndices = useRouteStore(
		(s) => s.draggingWaypointIndices,
	);
	const dragPreviewCoord = useRouteStore((s) => s.dragPreviewCoord);
	const dragPreviewNeighbors = useRouteStore((s) => s.dragPreviewNeighbors);

	const solidLine = useMemo(
		() => ({
			lineColor: routeColor,
			lineWidth: 4,
			lineCap: 'round' as const,
			lineJoin: 'round' as const,
		}),
		[routeColor],
	);

	const segments = useMemo(() => {
		if (!route || waypoints.length < 2) return [];
		return splitRouteByWaypoints(
			route.geometry.coordinates,
			waypoints.map((wp) => wp.coordinate),
		);
	}, [route, waypoints]);

	// Segment indices suppressed during active drag (dragPreview renders them instead)
	const draggingAffected = useMemo(() => {
		const set = new Set<number>();
		for (const idx of draggingWaypointIndices) {
			if (idx > 0) set.add(idx - 1);
			if (idx < waypoints.length - 1) set.add(idx);
		}
		return set;
	}, [draggingWaypointIndices, waypoints.length]);

	const pendingSet = useMemo(
		() => new Set(pendingDragSegments),
		[pendingDragSegments],
	);

	const dragPreviewShape = useMemo((): Feature<MultiLineString> | null => {
		if (!dragPreviewCoord || dragPreviewNeighbors.length === 0) return null;
		return {
			type: 'Feature',
			geometry: {
				type: 'MultiLineString',
				coordinates: dragPreviewNeighbors.map((n) => [
					[dragPreviewCoord.longitude, dragPreviewCoord.latitude],
					[n.longitude, n.latitude],
				]),
			},
			properties: {},
		};
	}, [dragPreviewCoord, dragPreviewNeighbors]);

	if (!route) return null;

	return (
		<>
			{segments.map((segCoords, i) => {
				const wpA = waypoints[i];
				const wpB = waypoints[i + 1];
				if (!wpA || !wpB) return null;

				// Stable ID derived from bounding waypoint IDs
				const segId = `${wpA.id}-${wpB.id}`;

				if (draggingAffected.has(i)) return null;

				// Route geometry hasn't caught up yet (e.g. new waypoint just added)
				if (segCoords.length < 2) return null;

				if (pendingSet.has(i)) {
					// Use a distinct source ID ("unsnapped") so MapLibre destroys and
					// recreates the layer when this segment transitions back to snapped.
					// Reusing the same ID would leave the dotted style in place.
					const unsnappedId = `${segId}-unsnapped`;
					const shape: Feature<LineString> = {
						type: 'Feature',
						geometry: {
							type: 'LineString',
							coordinates: [
								[wpA.coordinate.longitude, wpA.coordinate.latitude],
								[wpB.coordinate.longitude, wpB.coordinate.latitude],
							],
						},
						properties: {},
					};
					return (
						<MapLibreGL.ShapeSource
							key={unsnappedId}
							id={unsnappedId}
							shape={shape}
						>
							<MapLibreGL.LineLayer
								id={`${unsnappedId}-line`}
								style={DOTTED_LINE}
								aboveLayerID="stadia-raster"
							/>
						</MapLibreGL.ShapeSource>
					);
				}

				const shape: Feature<LineString> = {
					type: 'Feature',
					geometry: { type: 'LineString', coordinates: segCoords },
					properties: {},
				};
				return (
					<MapLibreGL.ShapeSource key={segId} id={segId} shape={shape}>
						<MapLibreGL.LineLayer
							id={`${segId}-line`}
							style={solidLine}
							aboveLayerID="stadia-raster"
						/>
					</MapLibreGL.ShapeSource>
				);
			})}

			{dragPreviewShape && (
				<MapLibreGL.ShapeSource id="drag-preview" shape={dragPreviewShape}>
					<MapLibreGL.LineLayer
						id="drag-preview-line"
						style={DOTTED_LINE}
						aboveLayerID="stadia-raster"
					/>
				</MapLibreGL.ShapeSource>
			)}
		</>
	);
}
