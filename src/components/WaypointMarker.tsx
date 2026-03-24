import MapLibreGL from '@maplibre/maplibre-react-native';
import type { Feature, Point } from 'geojson';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Polygon } from 'react-native-svg';
import {
	type Coordinate,
	useRouteStore,
	type Waypoint,
} from '../store/routeStore';

interface Props {
	waypoint: Waypoint;
	index: number;
	total: number;
	/** Compass bearing in degrees (0 = north, 90 = east) for the route direction at this waypoint */
	routeBearing: number;
	mapMoving: boolean;
	onDragMove?: (coord: Coordinate) => void;
	onDragFinish?: () => void;
}

function getMarkerColor(index: number, total: number): string {
	if (index === 0) return '#22c55e'; // green - start
	if (index === total - 1) return '#ef4444'; // red - end
	return '#94a3b8'; // gray - middle
}

export default function WaypointMarker({
	waypoint,
	index,
	total,
	routeBearing,
	mapMoving,
	onDragMove,
	onDragFinish,
}: Props) {
	const moveWaypoint = useRouteStore((s) => s.moveWaypoint);
	const removeWaypoint = useRouteStore((s) => s.removeWaypoint);

	const color = getMarkerColor(index, total);
	const isEndpoint = index === 0 || index === total - 1;

	const handleDrag = useCallback(
		(feature: Feature<Point>) => {
			const [longitude, latitude] = feature.geometry.coordinates;
			onDragMove?.({ longitude, latitude });
		},
		[onDragMove],
	);

	const handleDragEnd = useCallback(
		(feature: Feature<Point>) => {
			const [longitude, latitude] = feature.geometry.coordinates;
			moveWaypoint(waypoint.id, { longitude, latitude });
			onDragFinish?.();
		},
		[waypoint.id, moveWaypoint, onDragFinish],
	);

	return (
		<MapLibreGL.PointAnnotation
			id={`waypoint-${waypoint.id}`}
			coordinate={[waypoint.coordinate.longitude, waypoint.coordinate.latitude]}
			draggable={!mapMoving}
			onDrag={mapMoving ? undefined : handleDrag}
			onDragEnd={mapMoving ? undefined : handleDragEnd}
			onSelected={mapMoving ? undefined : () => removeWaypoint(waypoint.id)}
		>
			{isEndpoint ? (
				<View
					style={[styles.dot, { backgroundColor: color }]}
					collapsable={false}
				/>
			) : (
				<View style={styles.triangle} collapsable={false}>
					<Svg width={20} height={20} viewBox="0 0 20 20">
						<G rotation={routeBearing} originX={10} originY={10}>
							<Polygon
								points="10,0 19,15 1,15"
								fill={color}
								stroke="#fff"
								strokeWidth={1.5}
								strokeLinejoin="round"
							/>
						</G>
					</Svg>
				</View>
			)}
		</MapLibreGL.PointAnnotation>
	);
}

const styles = StyleSheet.create({
	dot: {
		width: 16,
		height: 16,
		borderRadius: 8,
		borderWidth: 2,
		borderColor: '#fff',
		elevation: 10,
	},
	triangle: {
		width: 20,
		height: 20,
		alignItems: 'center',
		justifyContent: 'center',
		elevation: 10,
	},
});
