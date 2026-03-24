import MapLibreGL, {
	type CameraRef,
	type MapViewRef,
	type OnPressEvent,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import type {
	Feature,
	FeatureCollection,
	Geometry,
	LineString,
	Point,
} from 'geojson';
import { Layers2, Locate, Plus, Trash2, Undo2 } from 'lucide-react-native';
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
import { useRoutes } from '../hooks/useRoutes';
import { useRouting } from '../hooks/useRouting';
import type { SavedRoute } from '../services/db';
import { type Coordinate, useRouteStore } from '../store/routeStore';
import {
	computeSegmentMidpointsWithBearings,
	computeWaypointBearingsFromRoute,
} from '../utils/routeMidpoint';
import ControlsPanel from './ControlsPanel';
import MidpointMarker from './MidpointMarker';
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
	const setEditingMode = useRouteStore((s) => s.setEditingMode);
	const loadRouteForEditing = useRouteStore((s) => s.loadRouteForEditing);
	const focusCoordinate = useRouteStore((s) => s.focusCoordinate);
	const setFocusCoordinate = useRouteStore((s) => s.setFocusCoordinate);
	const elevationMarkerCoord = useRouteStore((s) => s.elevationMarkerCoord);
	const setDraggingIndices = useRouteStore((s) => s.setDraggingIndices);
	const clearDraggingIndices = useRouteStore((s) => s.clearDraggingIndices);
	const setPendingDragSegments = useRouteStore((s) => s.setPendingDragSegments);
	const setDragPreview = useRouteStore((s) => s.setDragPreview);
	const clearDragPreview = useRouteStore((s) => s.clearDragPreview);

	const { data: savedRoutes } = useRoutes();

	const bgRoutesShape = useMemo(
		(): FeatureCollection<LineString> => ({
			type: 'FeatureCollection',
			features: (savedRoutes ?? []).map((r) => ({
				type: 'Feature',
				id: String(r.id),
				geometry: r.geometry.geometry,
				properties: { routeId: r.id, color: r.color },
			})),
		}),
		[savedRoutes],
	);

	const handleBgRoutePress = useCallback(
		(e: OnPressEvent) => {
			const routeId = e.features[0]?.properties?.routeId as number | undefined;
			if (routeId == null) return;
			const found = savedRoutes?.find((r) => r.id === routeId) ?? null;
			setPreviewRoute(found);
		},
		[savedRoutes],
	);

	const mapViewRef = useRef<MapViewRef>(null);
	const cameraRef = useRef<CameraRef>(null);
	const hasCenteredOnUser = useRef(false);

	const [userLocation, setUserLocation] = useState<[number, number] | null>(
		null,
	);
	const [activeStyleId, setActiveStyleId] = useState<MapStyleId>('outdoors');
	const [layerMenuOpen, setLayerMenuOpen] = useState(false);
	const [previewRoute, setPreviewRoute] = useState<SavedRoute | null>(null);

	const isCreating = editingMode === 'creating';
	const isEditing = editingMode === 'editing';
	const isActive = isCreating || isEditing;

	const activeStyle =
		MAP_STYLES.find((s) => s.id === activeStyleId) ?? MAP_STYLES[0];

	const segmentData = useMemo(
		() =>
			route
				? computeSegmentMidpointsWithBearings(
						route.geometry.coordinates,
						waypoints.map((wp) => wp.coordinate),
					)
				: [],
		[route, waypoints],
	);

	const waypointBearings = useMemo(
		() =>
			route
				? computeWaypointBearingsFromRoute(
						route.geometry.coordinates,
						waypoints.map((wp) => wp.coordinate),
					)
				: waypoints.map(() => 0),
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

	// Fit camera to route bounding box when a saved route is loaded (null → non-null, editing mode only)
	const prevRouteRef = useRef<typeof route>(null);
	useEffect(() => {
		const prev = prevRouteRef.current;
		prevRouteRef.current = route;
		if (!route || prev !== null || editingMode !== 'editing') return;

		const coords = route.geometry.coordinates;
		if (coords.length === 0) return;
		let minLon = coords[0][0];
		let maxLon = coords[0][0];
		let minLat = coords[0][1];
		let maxLat = coords[0][1];
		for (const [lon, lat] of coords) {
			if (lon < minLon) minLon = lon;
			if (lon > maxLon) maxLon = lon;
			if (lat < minLat) minLat = lat;
			if (lat > maxLat) maxLat = lat;
		}
		cameraRef.current?.fitBounds([maxLon, maxLat], [minLon, minLat], 40, 800);
	}, [route, editingMode]);

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
			if (!isActive) return;
			const point = feature as Feature<Point>;
			const [longitude, latitude] = point.geometry.coordinates;
			addWaypoint({ longitude, latitude });
		},
		[addWaypoint, isActive],
	);

	return (
		<View style={styles.container}>
			<MapLibreGL.MapView
				ref={mapViewRef}
				style={styles.map}
				mapStyle={activeStyle.style}
				onLongPress={handleLongPress}
				onPress={() => setPreviewRoute(null)}
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

				{/* Background routes — single FeatureCollection, visible in view mode only */}
				{editingMode === 'view' && (
					<MapLibreGL.ShapeSource
						id="background-routes"
						shape={bgRoutesShape}
						onPress={handleBgRoutePress}
					>
						<MapLibreGL.LineLayer
							id="background-routes-line"
							style={{
								lineColor: ['get', 'color'],
								lineWidth: 2,
								lineOpacity: 1,
								lineCap: 'round',
								lineJoin: 'round',
							}}
							aboveLayerID="stadia-raster"
						/>
					</MapLibreGL.ShapeSource>
				)}

				<RoutePolyline />

				{elevationMarkerCoord && (
					<MapLibreGL.ShapeSource
						id="elevationMarker"
						shape={{
							type: 'Feature',
							geometry: { type: 'Point', coordinates: elevationMarkerCoord },
							properties: {},
						}}
					>
						<MapLibreGL.CircleLayer
							id="elevationMarkerCircle"
							style={{
								circleRadius: 7,
								circleColor: '#ffffff',
								circleStrokeColor: '#3b82f6',
								circleStrokeWidth: 2,
							}}
						/>
					</MapLibreGL.ShapeSource>
				)}

				{isActive &&
					waypoints.map((wp, index) => (
						<WaypointMarker
							key={wp.id}
							waypoint={wp}
							index={index}
							total={waypoints.length}
							routeBearing={waypointBearings[index] ?? 0}
							onDragMove={(coord) => {
								const neighbors: Coordinate[] = [];
								if (index > 0)
									neighbors.push(waypoints[index - 1].coordinate);
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

				{isActive &&
					segmentData.map((mid, index) => {
						const wp = waypoints[index];
						const next = waypoints[index + 1];
						return (
							<MidpointMarker
								key={`mid-${wp.id}-${next.id}`}
								id={`mid-${wp.id}-${next.id}`}
								coordinate={mid.coordinate}
								afterIndex={index}
								segmentBearing={mid.bearing}
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
				{/* Add route button — hidden while creating a new route */}
				{!isCreating && (
					<TouchableOpacity
						style={styles.layerButton}
						onPress={() => setEditingMode('creating')}
					>
						<Plus size={20} color="#374151" />
					</TouchableOpacity>
				)}
				{isActive && (
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

			{previewRoute && (
				<View style={styles.previewCard}>
					<View style={styles.previewHeader}>
						<View style={styles.previewTitleRow}>
							<View
								style={[
									styles.previewColorDot,
									{ backgroundColor: previewRoute.color },
								]}
							/>
							<Text style={styles.previewName} numberOfLines={1}>
								{previewRoute.name}
							</Text>
						</View>
						<TouchableOpacity onPress={() => setPreviewRoute(null)}>
							<Text style={styles.previewDismiss}>✕</Text>
						</TouchableOpacity>
					</View>
					{previewRoute.stats && (
						<Text style={styles.previewMeta}>
							{previewRoute.stats.distanceKm.toFixed(2)} km{'  '}↑{' '}
							{Math.round(previewRoute.stats.gainM)} m{'  '}↓{' '}
							{Math.round(previewRoute.stats.lossM)} m
						</Text>
					)}
					<TouchableOpacity
						style={styles.previewViewBtn}
						onPress={() => {
							loadRouteForEditing(previewRoute.id);
							setPreviewRoute(null);
						}}
					>
						<Text style={styles.previewViewBtnText}>View</Text>
					</TouchableOpacity>
				</View>
			)}

			<ControlsPanel mapViewRef={mapViewRef} />
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
	previewCard: {
		position: 'absolute',
		bottom: 150,
		left: 16,
		right: 16,
		backgroundColor: '#fff',
		borderRadius: 12,
		padding: 14,
		gap: 8,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.15,
		shadowRadius: 8,
		elevation: 6,
	},
	previewHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	previewTitleRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		flex: 1,
		marginRight: 8,
	},
	previewColorDot: {
		width: 12,
		height: 12,
		borderRadius: 6,
		borderWidth: 1,
		borderColor: 'rgba(0,0,0,0.15)',
		flexShrink: 0,
	},
	previewName: {
		fontSize: 15,
		fontWeight: '700',
		color: '#111827',
		flex: 1,
	},
	previewDismiss: {
		fontSize: 16,
		color: '#9ca3af',
		paddingHorizontal: 4,
	},
	previewMeta: {
		fontSize: 13,
		color: '#6b7280',
	},
	previewViewBtn: {
		backgroundColor: '#2563eb',
		borderRadius: 8,
		paddingVertical: 9,
		alignItems: 'center',
	},
	previewViewBtnText: {
		color: '#fff',
		fontSize: 14,
		fontWeight: '700',
	},
});
