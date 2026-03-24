import type { Feature, LineString } from 'geojson';
import { create } from 'zustand';
import { getRoute } from '../services/db';

export interface Coordinate {
	longitude: number;
	latitude: number;
}

export interface Waypoint {
	id: string;
	coordinate: Coordinate;
}

export interface RouteStats {
	distanceKm: number;
	gainM: number;
	lossM: number;
}

/** 'view' = idle list; 'creating' = new route; 'editing' = editing a saved route */
export type EditingMode = 'view' | 'creating' | 'editing';

export const DEFAULT_ROUTE_COLOR = '#3b82f6';

interface RouteState {
	editingMode: EditingMode;
	waypoints: Waypoint[];
	route: Feature<LineString> | null;
	/** [distanceKm, elevationM] pairs for the elevation profile chart */
	elevationData: [number, number][];
	routeStats: RouteStats | null;
	/** When true, routing uses Valhalla use_trails: 1.0 (prefers trails).
	 *  When false, uses use_trails: 0.5 (standard pedestrian). */
	isSnapping: boolean;
	isLoading: boolean;
	/** Set by ElevationProfile on tap; watched by RouteMap to fly camera */
	focusCoordinate: [number, number] | null;
	/** Persists after camera fly; used to render a dot marker on the map */
	elevationMarkerCoord: [number, number] | null;
	/** ID of the route currently loaded in editing mode; null otherwise */
	activeRouteId: number | null;
	/** Current route line color (hex). Used for new routes and when editing. */
	routeColor: string;
	/** Route name while in editing mode. */
	editingRouteName: string;
	/** Indices of waypoints currently being dragged; adjacent route segments are suppressed */
	draggingWaypointIndices: number[];
	/** Segment indices that render as dotted straight lines after drag ends, until route resolves */
	pendingDragSegments: number[];
	/** Current drag position; null when not dragging */
	dragPreviewCoord: Coordinate | null;
	/** Neighbour waypoint coordinates for the drag preview lines */
	dragPreviewNeighbors: Coordinate[];
}

interface RouteActions {
	setEditingMode: (mode: EditingMode) => void;
	addWaypoint: (coord: Coordinate) => void;
	insertWaypoint: (afterIndex: number, coord: Coordinate) => void;
	moveWaypoint: (id: string, coord: Coordinate) => void;
	removeWaypoint: (id: string) => void;
	undoLastWaypoint: () => void;
	setRoute: (route: Feature<LineString> | null) => void;
	setElevationData: (data: [number, number][]) => void;
	setRouteStats: (stats: RouteStats | null) => void;
	setIsSnapping: (value: boolean) => void;
	setIsLoading: (value: boolean) => void;
	setFocusCoordinate: (coord: [number, number] | null) => void;
	setElevationMarkerCoord: (coord: [number, number] | null) => void;
	setRouteColor: (color: string) => void;
	setEditingRouteName: (name: string) => void;
	/** Clears only the active editing state (waypoints, route, elevation, stats).
	 *  Does NOT affect persisted saved routes in the database. */
	clearAll: () => void;
	/** Load an array of coordinates as waypoints (e.g. from GPX import) */
	loadWaypoints: (coords: Coordinate[]) => void;
	/** Load a saved route by id into editing mode */
	loadRouteForEditing: (id: number) => void;
	setDraggingIndices: (indices: number[]) => void;
	clearDraggingIndices: () => void;
	setPendingDragSegments: (indices: number[]) => void;
	setDragPreview: (coord: Coordinate, neighbors: Coordinate[]) => void;
	clearDragPreview: () => void;
}

function makeId(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

export const useRouteStore = create<RouteState & RouteActions>((set) => ({
	editingMode: 'view',
	waypoints: [],
	route: null,
	elevationData: [],
	routeStats: null,
	isSnapping: true,
	isLoading: false,
	focusCoordinate: null,
	elevationMarkerCoord: null,
	activeRouteId: null,
	routeColor: DEFAULT_ROUTE_COLOR,
	editingRouteName: '',
	draggingWaypointIndices: [],
	pendingDragSegments: [],
	dragPreviewCoord: null,
	dragPreviewNeighbors: [],

	setEditingMode: (editingMode) => set({ editingMode }),
	setRouteColor: (routeColor) => set({ routeColor }),
	setEditingRouteName: (editingRouteName) => set({ editingRouteName }),

	addWaypoint: (coord) =>
		set((state) => ({
			waypoints: [...state.waypoints, { id: makeId(), coordinate: coord }],
		})),

	insertWaypoint: (afterIndex, coord) =>
		set((state) => {
			const wps = [...state.waypoints];
			wps.splice(afterIndex + 1, 0, { id: makeId(), coordinate: coord });
			return { waypoints: wps };
		}),

	moveWaypoint: (id, coord) =>
		set((state) => ({
			waypoints: state.waypoints.map((wp) =>
				wp.id === id ? { ...wp, coordinate: coord } : wp,
			),
		})),

	removeWaypoint: (id) =>
		set((state) => ({
			waypoints: state.waypoints.filter((wp) => wp.id !== id),
		})),

	undoLastWaypoint: () =>
		set((state) => ({
			waypoints: state.waypoints.slice(0, -1),
		})),

	setRoute: (route) => set({ route, pendingDragSegments: [] }),
	setElevationData: (elevationData) => set({ elevationData }),
	setRouteStats: (routeStats) => set({ routeStats }),
	setIsSnapping: (isSnapping) => set({ isSnapping }),
	setIsLoading: (isLoading) => set({ isLoading }),
	setFocusCoordinate: (focusCoordinate) => set({ focusCoordinate }),
	setElevationMarkerCoord: (elevationMarkerCoord) => set({ elevationMarkerCoord }),

	clearAll: () =>
		set({
			waypoints: [],
			route: null,
			elevationData: [],
			routeStats: null,
			focusCoordinate: null,
			elevationMarkerCoord: null,
			activeRouteId: null,
			routeColor: DEFAULT_ROUTE_COLOR,
			editingRouteName: '',
		}),

	loadWaypoints: (coords) =>
		set({
			waypoints: coords.map((coord) => ({ id: makeId(), coordinate: coord })),
			route: null,
			elevationData: [],
			routeStats: null,
		}),

	loadRouteForEditing: (id) => {
		const saved = getRoute(id);
		if (!saved) return;
		set({
			activeRouteId: id,
			editingMode: 'editing',
			waypoints: saved.waypoints,
			route: saved.geometry,
			routeStats: saved.stats,
			routeColor: saved.color,
			editingRouteName: saved.name,
			elevationData: [],
			focusCoordinate: null,
			elevationMarkerCoord: null,
		});
	},

	setDraggingIndices: (draggingWaypointIndices) =>
		set({ draggingWaypointIndices }),
	clearDraggingIndices: () => set({ draggingWaypointIndices: [] }),
	setPendingDragSegments: (pendingDragSegments) => set({ pendingDragSegments }),
	setDragPreview: (dragPreviewCoord, dragPreviewNeighbors) =>
		set({ dragPreviewCoord, dragPreviewNeighbors }),
	clearDragPreview: () =>
		set({ dragPreviewCoord: null, dragPreviewNeighbors: [] }),
}));
