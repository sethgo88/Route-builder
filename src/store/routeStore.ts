import { create } from 'zustand';
import type { Feature, LineString } from 'geojson';

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

interface RouteState {
  waypoints: Waypoint[];
  route: Feature<LineString> | null;
  /** [distanceKm, elevationM] pairs for the elevation profile chart */
  elevationData: [number, number][];
  routeStats: RouteStats | null;
  /** When true, routing uses GraphHopper 'hike' profile (follows trails).
   *  When false, uses 'foot' profile (less strict trail following). */
  isSnapping: boolean;
  isLoading: boolean;
  /** Set by ElevationProfile on tap; watched by RouteMap to fly camera */
  focusCoordinate: [number, number] | null;
}

interface RouteActions {
  addWaypoint: (coord: Coordinate) => void;
  moveWaypoint: (id: string, coord: Coordinate) => void;
  removeWaypoint: (id: string) => void;
  undoLastWaypoint: () => void;
  setRoute: (route: Feature<LineString> | null) => void;
  setElevationData: (data: [number, number][]) => void;
  setRouteStats: (stats: RouteStats | null) => void;
  setIsSnapping: (value: boolean) => void;
  setIsLoading: (value: boolean) => void;
  setFocusCoordinate: (coord: [number, number] | null) => void;
  clearAll: () => void;
  /** Load an array of coordinates as waypoints (e.g. from GPX import) */
  loadWaypoints: (coords: Coordinate[]) => void;
}

function makeId(): string {
  return `wp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export const useRouteStore = create<RouteState & RouteActions>((set) => ({
  waypoints: [],
  route: null,
  elevationData: [],
  routeStats: null,
  isSnapping: true,
  isLoading: false,
  focusCoordinate: null,

  addWaypoint: (coord) =>
    set((state) => ({
      waypoints: [...state.waypoints, { id: makeId(), coordinate: coord }],
    })),

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

  setRoute: (route) => set({ route }),
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
}));
