import MapLibreGL from '@maplibre/maplibre-react-native';
import type { Feature, Point } from 'geojson';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Polygon } from 'react-native-svg';
import { type Coordinate, useRouteStore } from '../store/routeStore';

interface Props {
	id: string;
	coordinate: Coordinate;
	afterIndex: number;
	/** Compass bearing in degrees (0 = north, 90 = east) for this segment's direction */
	segmentBearing: number;
	onDragMove?: (coord: Coordinate) => void;
	onDragFinish?: () => void;
}

export default function MidpointMarker({
	id,
	coordinate,
	afterIndex,
	segmentBearing,
	onDragMove,
	onDragFinish,
}: Props) {
	const insertWaypoint = useRouteStore((s) => s.insertWaypoint);

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
			insertWaypoint(afterIndex, { longitude, latitude });
			onDragFinish?.();
		},
		[afterIndex, insertWaypoint, onDragFinish],
	);

	return (
		<MapLibreGL.PointAnnotation
			id={id}
			coordinate={[coordinate.longitude, coordinate.latitude]}
			draggable
			onDrag={handleDrag}
			onDragEnd={handleDragEnd}
		>
			<View style={styles.marker} collapsable={false}>
				<Svg width={20} height={20} viewBox="0 0 20 20">
					<G rotation={segmentBearing} originX={10} originY={10}>
						<Polygon
							points="10,0 19,15 1,15"
							fill="#94a3b8"
							stroke="#fff"
							strokeWidth={1.5}
							strokeLinejoin="round"
						/>
					</G>
				</Svg>
			</View>
		</MapLibreGL.PointAnnotation>
	);
}

const styles = StyleSheet.create({
	marker: {
		width: 20,
		height: 20,
		alignItems: 'center',
		justifyContent: 'center',
		elevation: 8,
	},
});
