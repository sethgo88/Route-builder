# Route Builder — Store Reference

> **Keep this file current when:** adding/removing/renaming fields or actions in `routeStore.ts`, `authStore.ts`, or `settingsStore.ts` · changing the default value of any field · adding a non-obvious side-effect to an action.

## routeStore (`src/store/routeStore.ts`)

`useRouteStore` is the single Zustand store for all active editing state.

### State

| Field | Type | Default | Purpose |
|---|---|---|---|
| `editingMode` | `'view' \| 'creating' \| 'editing'` | `'view'` | Which UI mode the app is in |
| `waypoints` | `Waypoint[]` | `[]` | User-placed route points |
| `history` | `Waypoint[][]` | `[]` | Snapshots for undo — each entry is a full waypoints array |
| `future` | `Waypoint[][]` | `[]` | Snapshots for redo — pushed when undoing |
| `route` | `Feature<LineString> \| null` | `null` | Computed route from Valhalla |
| `elevationData` | `[number, number][]` | `[]` | `[distanceKm, elevationM]` pairs for the chart |
| `routeStats` | `RouteStats \| null` | `null` | `{ distanceKm, gainM, lossM }` |
| `isSnapping` | `boolean` | `true` | Snap toggle state — stamped as `snapAfter` on new waypoints |
| `isLoading` | `boolean` | `false` | True while routing query is in flight |
| `focusCoordinate` | `[number, number] \| null` | `null` | Set by ElevationProfile tap; RouteMap flies camera then clears it |
| `elevationMarkerCoord` | `[number, number] \| null` | `null` | Persists after camera fly; renders a dot marker on the map |
| `activeRouteId` | `number \| null` | `null` | SQLite ID of the route being edited; null in creating/view |
| `routeColor` | `string` (hex) | `'#3b82f6'` | Line colour for the active route |
| `editingRouteName` | `string` | `''` | Route name while in editing mode |
| `draggingWaypointIndices` | `number[]` | `[]` | Indices of waypoints currently being dragged; adjacent segments suppressed |
| `pendingDragSegments` | `number[]` | `[]` | Segment indices showing dotted straight lines until route resolves |
| `dragPreviewCoord` | `Coordinate \| null` | `null` | Current drag finger position |
| `dragPreviewNeighbors` | `Coordinate[]` | `[]` | Neighbour waypoint coords for preview lines |

### Actions

| Action | Signature | Notes |
|---|---|---|
| `setEditingMode` | `(mode: EditingMode) => void` | |
| `addWaypoint` | `(coord: Coordinate) => void` | Pushes history, stamps `snapAfter` from `isSnapping` |
| `insertWaypoint` | `(afterIndex: number, coord: Coordinate) => void` | Pushes history, stamps `snapAfter` from `isSnapping` |
| `moveWaypoint` | `(id: string, coord: Coordinate) => void` | Pushes history |
| `removeWaypoint` | `(id: string) => void` | Pushes history |
| `undo` | `() => void` | Pops history, pushes current waypoints onto future |
| `redo` | `() => void` | Pops future, pushes current waypoints onto history |
| `canUndo` | `() => boolean` | Returns `history.length > 0` |
| `canRedo` | `() => boolean` | Returns `future.length > 0` |
| `setRoute` | `(route \| null) => void` | **Side-effect: also clears `pendingDragSegments`** |
| `setElevationData` | `(data: [number, number][]) => void` | |
| `setRouteStats` | `(stats: RouteStats \| null) => void` | |
| `setIsSnapping` | `(value: boolean) => void` | Does not re-route existing waypoints |
| `setIsLoading` | `(value: boolean) => void` | |
| `setFocusCoordinate` | `(coord \| null) => void` | ElevationProfile sets; RouteMap consumes and clears |
| `setElevationMarkerCoord` | `(coord \| null) => void` | |
| `setRouteColor` | `(color: string) => void` | |
| `setEditingRouteName` | `(name: string) => void` | |
| `clearAll` | `() => void` | Resets waypoints, route, elevation, history, future, activeRouteId, color. **Does NOT touch the database.** |
| `loadWaypoints` | `(coords: Coordinate[]) => void` | Replaces waypoints from GPX import; all `snapAfter = false` |
| `loadRouteForEditing` | `(id: number) => void` | **Synchronous** call to `getRoute(id)` from SQLite. Sets editing mode, loads waypoints/route/stats/color/name. `snapAfter` defaults to `true` for waypoints without the field (legacy routes). |
| `setDraggingIndices` | `(indices: number[]) => void` | |
| `clearDraggingIndices` | `() => void` | |
| `setPendingDragSegments` | `(indices: number[]) => void` | |
| `setDragPreview` | `(coord: Coordinate, neighbors: Coordinate[]) => void` | |
| `clearDragPreview` | `() => void` | |

### Core Types (exported from routeStore.ts)

```ts
interface Coordinate { longitude: number; latitude: number; }

interface Waypoint {
  id: string;           // UUID (makeId())
  coordinate: Coordinate;
  snapAfter: boolean;   // true = Valhalla trail routing for segment INTO this waypoint
}

interface RouteStats { distanceKm: number; gainM: number; lossM: number; }

type EditingMode = 'view' | 'creating' | 'editing';

const DEFAULT_ROUTE_COLOR = '#3b82f6';
```

---

## authStore (`src/store/authStore.ts`)

`useAuthStore` — Supabase session state.

| Field/Action | Type | Notes |
|---|---|---|
| `user` | `User \| null` | Supabase user object |
| `session` | `Session \| null` | Supabase session object |
| `isLoading` | `boolean` | `true` while initial session restore is in flight (starts `true`) |
| `setSession(session)` | `(Session \| null) => void` | Atomically sets both `session` and `user` (`session?.user ?? null`) |
| `setLoading(loading)` | `(boolean) => void` | |

The `onAuthStateChange` listener (wired up in `App.tsx`) calls `setSession` on every auth event.

---

## settingsStore (`src/store/settingsStore.ts`)

`useSettingsStore` — user preferences.

| Field/Action | Type | Notes |
|---|---|---|
| `unitSystem` | `'metric' \| 'imperial'` | Default `'metric'` |
| `loadSettings()` | `() => void` | Reads `unit_system` from SQLite. **Call once on app init.** |
| `setUnitSystem(value)` | `(UnitSystem) => void` | Updates store + writes SQLite + calls `pushSetting` (Supabase, fire-and-forget) |

`UnitSystem` type is exported from `src/utils/units.ts`.
