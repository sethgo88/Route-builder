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
	/** Snap setting for the segment FROM the previous waypoint TO this one.
	 *  Stamped at add-time from isSnapping. true = trail route; false = straight line. */
	snapAfter: boolean;
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
	/** Snapshots of waypoints before each mutating action — supports multi-step undo */
	history: Waypoint[][];
	/** Snapshots pushed onto the future stack when undoing — supports redo */
	future: Waypoint[][];
	route: Feature<LineString> | null;
	/** [distanceKm, elevationM] pairs for the elevation profile chart */
	elevationData: [number, number][];
	routeStats: RouteStats | null;
	/** Snap setting applied to each new waypoint added. Stored as snapAfter on the waypoint. */
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
	undo: () => void;
	redo: () => void;
	canUndo: () => boolean;
	canRedo: () => boolean;
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

export const useRouteStore = create<RouteState & RouteActions>((set, get) => ({
	editingMode: 'view',
	waypoints: [],
	history: [],
	future: [],
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
			history: [...state.history, state.waypoints],
			future: [],
			waypoints: [
				...state.waypoints,
				{ id: makeId(), coordinate: coord, snapAfter: state.isSnapping },
			],
		})),

	insertWaypoint: (afterIndex, coord) =>
		set((state) => {
			const wps = [...state.waypoints];
			wps.splice(afterIndex + 1, 0, {
				id: makeId(),
				coordinate: coord,
				snapAfter: state.isSnapping,
			});
			return {
				history: [...state.history, state.waypoints],
				future: [],
				waypoints: wps,
			};
		}),

	moveWaypoint: (id, coord) =>
		set((state) => ({
			history: [...state.history, state.waypoints],
			future: [],
			waypoints: state.waypoints.map((wp) =>
				wp.id === id ? { ...wp, coordinate: coord } : wp,
			),
		})),

	removeWaypoint: (id) =>
		set((state) => ({
			history: [...state.history, state.waypoints],
			future: [],
			waypoints: state.waypoints.filter((wp) => wp.id !== id),
		})),

	undo: () =>
		set((state) => {
			if (state.history.length === 0) return state;
			const previous = state.history[state.history.length - 1];
			return {
				waypoints: previous,
				history: state.history.slice(0, -1),
				future: [state.waypoints, ...state.future],
			};
		}),

	redo: () =>
		set((state) => {
			if (state.future.length === 0) return state;
			const [next, ...remaining] = state.future;
			return {
				waypoints: next,
				history: [...state.history, state.waypoints],
				future: remaining,
			};
		}),

	canUndo: () => get().history.length > 0,
	canRedo: () => get().future.length > 0,

	setRoute: (route) => set({ route, pendingDragSegments: [] }),
	setElevationData: (elevationData) => set({ elevationData }),
	setRouteStats: (routeStats) => set({ routeStats }),
	setIsSnapping: (isSnapping) => set({ isSnapping }),
	setIsLoading: (isLoading) => set({ isLoading }),
	setFocusCoordinate: (focusCoordinate) => set({ focusCoordinate }),
	setElevationMarkerCoord: (elevationMarkerCoord) =>
		set({ elevationMarkerCoord }),

	clearAll: () =>
		set({
			waypoints: [],
			history: [],
			future: [],
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
			waypoints: coords.map((coord) => ({
				id: makeId(),
				coordinate: coord,
				snapAfter: false,
			})),
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
			// Default snapAfter to true for waypoints saved before this field existed
			waypoints: saved.waypoints.map((wp) => ({
				...wp,
				snapAfter: wp.snapAfter ?? true,
			})),
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
