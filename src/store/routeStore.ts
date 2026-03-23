import type { Feature, LineString } from 'geojson';
import { create } from 'zustand';

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

/** 'view' = read-only, no editing; 'creating' = user is building a new route */
export type EditingMode = 'view' | 'creating';

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
	/** Clears only the active editing state (waypoints, route, elevation, stats).
	 *  Does NOT affect persisted saved routes in the database. */
	clearAll: () => void;
	/** Load an array of coordinates as waypoints (e.g. from GPX import) */
	loadWaypoints: (coords: Coordinate[]) => void;
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
	draggingWaypointIndices: [],
	pendingDragSegments: [],
	dragPreviewCoord: null,
	dragPreviewNeighbors: [],

	setEditingMode: (editingMode) => set({ editingMode }),

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

	clearAll: () =>
		set({
			waypoints: [],
			route: null,
			elevationData: [],
			routeStats: null,
			focusCoordinate: null,
		}),

	loadWaypoints: (coords) =>
		set({
			waypoints: coords.map((coord) => ({ id: makeId(), coordinate: coord })),
			route: null,
			elevationData: [],
			routeStats: null,
		}),

	setDraggingIndices: (draggingWaypointIndices) =>
		set({ draggingWaypointIndices }),
	clearDraggingIndices: () => set({ draggingWaypointIndices: [] }),
	setPendingDragSegments: (pendingDragSegments) => set({ pendingDragSegments }),
	setDragPreview: (dragPreviewCoord, dragPreviewNeighbors) =>
		set({ dragPreviewCoord, dragPreviewNeighbors }),
	clearDragPreview: () =>
		set({ dragPreviewCoord: null, dragPreviewNeighbors: [] }),
}));
