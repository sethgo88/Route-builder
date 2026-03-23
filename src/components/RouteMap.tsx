import MapLibreGL, {
	type CameraRef,
	type MapViewRef,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import type { Feature, Geometry, Point } from 'geojson';
import { Layers2, List, Locate, Trash2, Undo2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native';
import type { MapStyleId } from '../constants/map';
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_STYLES } from '../constants/map';
import { useRouting } from '../hooks/useRouting';
import { type Coordinate, useRouteStore } from '../store/routeStore';
import { computeSegmentMidpoints } from '../utils/routeMidpoint';
import ControlsPanel from './ControlsPanel';
import MidpointMarker from './MidpointMarker';
import RouteListModal from './RouteListModal';
import RoutePolyline from './RoutePolyline';
import WaypointMarker from './WaypointMarker';

export default function RouteMap() {
	// Drive routing side-effects
	useRouting();

	// Request location permissions on mount (Android runtime requirement)
	useEffect(() => {
		Location.requestForegroundPermissionsAsync();
	}, []);

	const editingMode = useRouteStore((s) => s.editingMode);
	const waypoints = useRouteStore((s) => s.waypoints);
	const route = useRouteStore((s) => s.route);
	const isLoading = useRouteStore((s) => s.isLoading);
	const addWaypoint = useRouteStore((s) => s.addWaypoint);
	const undoLastWaypoint = useRouteStore((s) => s.undoLastWaypoint);
	const clearAll = useRouteStore((s) => s.clearAll);
	const focusCoordinate = useRouteStore((s) => s.focusCoordinate);
	const setFocusCoordinate = useRouteStore((s) => s.setFocusCoordinate);
	const setDraggingIndices = useRouteStore((s) => s.setDraggingIndices);
	const clearDraggingIndices = useRouteStore((s) => s.clearDraggingIndices);
	const setPendingDragSegments = useRouteStore((s) => s.setPendingDragSegments);
	const setDragPreview = useRouteStore((s) => s.setDragPreview);
	const clearDragPreview = useRouteStore((s) => s.clearDragPreview);

	const mapViewRef = useRef<MapViewRef>(null);
	const cameraRef = useRef<CameraRef>(null);
	const hasCenteredOnUser = useRef(false);

	const [userLocation, setUserLocation] = useState<[number, number] | null>(
		null,
	);
	const [activeStyleId, setActiveStyleId] = useState<MapStyleId>('outdoors');
	const [layerMenuOpen, setLayerMenuOpen] = useState(false);
	const [routeListOpen, setRouteListOpen] = useState(false);

	const isCreating = editingMode === 'creating';

	const activeStyle =
		MAP_STYLES.find((s) => s.id === activeStyleId) ?? MAP_STYLES[0];

	const segmentMidpoints = useMemo(
		() =>
			route
				? computeSegmentMidpoints(
						route.geometry.coordinates,
						waypoints.map((wp) => wp.coordinate),
					)
				: [],
		[route, waypoints],
	);

	// Fly to coordinate when set from the elevation profile
	useEffect(() => {
		if (!focusCoordinate) return;
		cameraRef.current?.setCamera({
			centerCoordinate: focusCoordinate,
			zoomLevel: 14,
			animationDuration: 600,
			animationMode: 'flyTo',
		});
		setFocusCoordinate(null);
	}, [focusCoordinate, setFocusCoordinate]);

	const handleUserLocationUpdate = useCallback(
		(location: MapLibreGL.Location) => {
			const coord: [number, number] = [
				location.coords.longitude,
				location.coords.latitude,
			];
			setUserLocation(coord);
			if (!hasCenteredOnUser.current) {
				hasCenteredOnUser.current = true;
				cameraRef.current?.setCamera({
					centerCoordinate: coord,
					zoomLevel: DEFAULT_ZOOM,
					animationDuration: 800,
					animationMode: 'flyTo',
				});
			}
		},
		[],
	);

	const handleLocateMe = useCallback(() => {
		if (!userLocation) return;
		cameraRef.current?.setCamera({
			centerCoordinate: userLocation,
			zoomLevel: DEFAULT_ZOOM,
			animationDuration: 600,
			animationMode: 'flyTo',
		});
	}, [userLocation]);

	const hasWaypoints = waypoints.length > 0;

	const handleClearAll = useCallback(() => {
		Alert.alert('Clear route', 'Remove all waypoints and the route?', [
			{ text: 'Cancel', style: 'cancel' },
			{ text: 'Clear', style: 'destructive', onPress: clearAll },
		]);
	}, [clearAll]);

	const handleLongPress = useCallback(
		(feature: Feature<Geometry>) => {
			if (!isCreating) return;
			const point = feature as Feature<Point>;
			const [longitude, latitude] = point.geometry.coordinates;
			addWaypoint({ longitude, latitude });
		},
		[addWaypoint, isCreating],
	);

	return (
		<View style={styles.container}>
			<MapLibreGL.MapView
				ref={mapViewRef}
				style={styles.map}
				mapStyle={activeStyle.style}
				onLongPress={handleLongPress}
				logoEnabled={false}
				attributionEnabled
				attributionPosition={{ bottom: 8, right: 8 }}
			>
				<MapLibreGL.Camera
					ref={cameraRef}
					zoomLevel={DEFAULT_ZOOM}
					centerCoordinate={DEFAULT_CENTER}
					animationMode="moveTo"
				/>

				<MapLibreGL.UserLocation visible onUpdate={handleUserLocationUpdate} />

				<RoutePolyline />

				{isCreating &&
					waypoints.map((wp, index) => (
						<WaypointMarker
							key={wp.id}
							waypoint={wp}
							index={index}
							total={waypoints.length}
							onDragMove={(coord) => {
								const neighbors: Coordinate[] = [];
								if (index > 0) neighbors.push(waypoints[index - 1].coordinate);
								if (index < waypoints.length - 1)
									neighbors.push(waypoints[index + 1].coordinate);
								setDragPreview(coord, neighbors);
								setDraggingIndices([index]);
							}}
							onDragFinish={() => {
								clearDragPreview();
								clearDraggingIndices();
								const pending: number[] = [];
								if (index > 0) pending.push(index - 1);
								if (index < waypoints.length - 1) pending.push(index);
								setPendingDragSegments(pending);
							}}
						/>
					))}

				{isCreating &&
					segmentMidpoints.map((midCoord, index) => {
						const wp = waypoints[index];
						const next = waypoints[index + 1];
						return (
							<MidpointMarker
								key={`mid-${wp.id}-${next.id}`}
								id={`mid-${wp.id}-${next.id}`}
								coordinate={midCoord}
								afterIndex={index}
								onDragMove={(coord) => {
									setDragPreview(coord, [wp.coordinate, next.coordinate]);
									setDraggingIndices([index, index + 1]);
								}}
								onDragFinish={() => {
									clearDragPreview();
									clearDraggingIndices();
									setPendingDragSegments([index]);
								}}
							/>
						);
					})}
			</MapLibreGL.MapView>

			{isLoading && (
				<View style={styles.loadingOverlay} pointerEvents="none">
					<ActivityIndicator size="small" color="#3b82f6" />
				</View>
			)}

			{/* Map controls — top right */}
			<View style={styles.layerButtonContainer}>
				{layerMenuOpen && (
					<View style={styles.layerMenu}>
						{MAP_STYLES.map((style) => (
							<TouchableOpacity
								key={style.id}
								style={[
									styles.layerMenuItem,
									style.id === activeStyleId && styles.layerMenuItemActive,
								]}
								onPress={() => {
									setActiveStyleId(style.id);
									setLayerMenuOpen(false);
								}}
							>
								<Text
									style={[
										styles.layerMenuItemText,
										style.id === activeStyleId &&
											styles.layerMenuItemTextActive,
									]}
								>
									{style.label}
								</Text>
							</TouchableOpacity>
						))}
					</View>
				)}
				<TouchableOpacity
					style={styles.layerButton}
					onPress={() => setLayerMenuOpen((v) => !v)}
				>
					<Layers2 size={20} color="#374151" />
				</TouchableOpacity>
				<TouchableOpacity style={styles.layerButton} onPress={handleLocateMe}>
					<Locate size={20} color={userLocation ? '#374151' : '#9ca3af'} />
				</TouchableOpacity>
				<TouchableOpacity
					style={styles.layerButton}
					onPress={() => setRouteListOpen(true)}
				>
					<List size={20} color="#374151" />
				</TouchableOpacity>
				{isCreating && (
					<>
						<TouchableOpacity
							style={styles.layerButton}
							onPress={undoLastWaypoint}
							disabled={!hasWaypoints}
						>
							<Undo2 size={20} color={hasWaypoints ? '#374151' : '#9ca3af'} />
						</TouchableOpacity>
						<TouchableOpacity
							style={styles.layerButton}
							onPress={handleClearAll}
							disabled={!hasWaypoints}
						>
							<Trash2 size={20} color={hasWaypoints ? '#dc2626' : '#9ca3af'} />
						</TouchableOpacity>
					</>
				)}
			</View>

			<ControlsPanel mapViewRef={mapViewRef} />

			<RouteListModal
				open={routeListOpen}
				onClose={() => setRouteListOpen(false)}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	map: StyleSheet.absoluteFillObject,
	loadingOverlay: {
		position: 'absolute',
		top: 16,
		alignSelf: 'center',
		backgroundColor: 'rgba(255,255,255,0.9)',
		borderRadius: 20,
		padding: 8,
	},
	layerButtonContainer: {
		position: 'absolute',
		top: 56,
		right: 12,
		alignItems: 'flex-end',
		gap: 6,
	},
	layerButton: {
		width: 40,
		height: 40,
		borderRadius: 8,
		backgroundColor: '#fff',
		alignItems: 'center',
		justifyContent: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.2,
		shadowRadius: 3,
		elevation: 4,
	},
	layerMenu: {
		backgroundColor: '#fff',
		borderRadius: 8,
		overflow: 'hidden',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.15,
		shadowRadius: 6,
		elevation: 6,
	},
	layerMenuItem: {
		paddingVertical: 10,
		paddingHorizontal: 16,
	},
	layerMenuItemActive: {
		backgroundColor: '#eff6ff',
	},
	layerMenuItemText: {
		fontSize: 14,
		color: '#374151',
		fontWeight: '500',
	},
	layerMenuItemTextActive: {
		color: '#2563eb',
		fontWeight: '600',
	},
});
