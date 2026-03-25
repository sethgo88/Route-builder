# Route Builder — Component Reference

> **Keep this file current when:** adding a new component · changing what store fields a component reads/writes · changing a service function signature or return type · adding a utility function · moving logic between components.

## Component Tree

```
App
└── RouteMap                         root; calls useRouting() to drive routing side-effects
    ├── MapLibreGL.MapView
    │   ├── ShapeSource "background-routes"   (view mode) all saved routes as FeatureCollection
    │   ├── RoutePolyline                     route line + drag-preview layers
    │   ├── ShapeSource "elevationMarker"     dot from elevation profile tap
    │   ├── WaypointMarker × N               (creating/editing) draggable per waypoint
    │   └── MidpointMarker × N-1             (creating/editing) insert-waypoint button
    └── ControlsPanel                        @gorhom/bottom-sheet
        ├── RouteActionBar                   (creating mode) ✓ / ✗ save bar
        ├── ElevationProfile                 SVG elevation chart
        ├── AccountModal                     auth form (modal)
        └── UnsavedChangesModal              leave guard (modal)
```

---

## Component Store Matrix

### RouteMap (`src/components/RouteMap.tsx`)

Heaviest component. Orchestrates map gestures, markers, and routing.

**Store reads:** `editingMode`, `waypoints`, `route`, `isLoading`, `isSnapping`, `focusCoordinate`, `elevationMarkerCoord`, `draggingWaypointIndices`, `dragPreviewCoord`, `routeColor`

**Store writes:** `addWaypoint`, `undo`, `redo`, `clearAll`, `setEditingMode`, `loadRouteForEditing`, `setFocusCoordinate`, `setElevationMarkerCoord`, `setIsSnapping`, `setDraggingIndices`, `clearDraggingIndices`, `setPendingDragSegments`, `setDragPreview`, `clearDragPreview`

**Local state:** `activeStyleId` (map tile style), `layerMenuOpen`, `previewRoute: SavedRoute | null` (tapped background route preview), `isMapMoving` (disables waypoint touch during pan), `userLocation`

**Key behaviors:**
- Long-press → `addWaypoint`. Disabled when `isMapMoving` or `editingMode === 'view'`.
- `focusCoordinate` is consumed via `useEffect` → camera fly → `setFocusCoordinate(null)`.
- Background route tap → sets `previewRoute` → small card renders → "Edit" calls `loadRouteForEditing`.
- Passes `mapViewRef` to `ControlsPanel` for offline tile bounds.

---

### ControlsPanel (`src/components/ControlsPanel.tsx`)

Bottom sheet (3 snap points). The most complex component — owns save/update/delete/GPX/offline/account.

**Store reads:** `editingMode`, `waypoints`, `route`, `routeStats`, `isSnapping`, `isLoading`, `routeColor`, `activeRouteId`, `editingRouteName`

**Store writes:** `setIsSnapping`, `clearAll`, `setEditingMode`, `setRouteColor`, `setEditingRouteName`

**Auth store reads:** `user` (for account button state)

**Settings store reads/writes:** `unitSystem`, `setUnitSystem`

**Props:** `mapViewRef: React.RefObject<MapViewRef>`

**Key behaviors:**
- **view mode:** Shows saved route list. Tap route → `loadRouteForEditing`.
- **creating mode:** Renders `RouteActionBar`, snap toggle, color picker, stats, GPX import/export, offline download.
- **editing mode:** Renders snap toggle, color picker (updates via `setRouteColor`), stats, name field (`setEditingRouteName`), Save button (`updateRoute` + `pushRoute` + `clearAll` + `setEditingMode('view')`), Delete button (`deleteRoute` + `deleteRouteInCloud` + `clearAll`), GPX export.
- GPX import: `DocumentPicker` → `FileSystem.readAsStringAsync` → `parseGpx` → `loadWaypoints`.
- Calls `initDb()` via `useEffect` on mount.

---

### RouteActionBar (`src/components/RouteActionBar.tsx`)

Creating mode only. Rendered inside `ControlsPanel`.

**Props:** `onRouteSaved: () => void`

**Store reads:** `waypoints`, `route`, `routeStats`, `routeColor`

**Store writes:** `clearAll`, `setEditingMode`

**Key behaviors:**
- ✓ button enabled when `waypoints.length >= 2 && route !== null`.
- Tap ✓ → `NameRouteModal` opens → confirm → `saveRoute` → `pushRoute` (fire-and-forget) → `clearAll` → `setEditingMode('view')` → `onRouteSaved()`.
- Tap ✗ with unsaved waypoints → `UnsavedChangesModal` with "Discard" / "Save & Exit" / "Cancel".
- "Save & Exit" auto-names with `"Route DD-MM-YY HH:MM"`.

---

### ElevationProfile (`src/components/ElevationProfile.tsx`)

SVG area chart of elevation along the route.

**Store reads:** `elevationData`, `routeStats`, `route` (to map touch X position → route coordinate)

**Store writes:** `setFocusCoordinate` (triggers camera fly in RouteMap), `setElevationMarkerCoord` (persists dot marker)

**Props:** `width: number` (caller subtracts horizontal padding from window width)

**Key behavior:** Tap/drag on chart computes distance ratio → interpolates into `route.geometry.coordinates` → writes `[lon, lat]` to both `focusCoordinate` and `elevationMarkerCoord`.

---

### RoutePolyline (`src/components/RoutePolyline.tsx`)

Renders route line as per-segment `ShapeSource` + `LineLayer` pairs. Must be a direct child of `MapLibreGL.MapView`.

**Store reads:** `route`, `waypoints`, `routeColor`, `pendingDragSegments`, `draggingWaypointIndices`, `dragPreviewCoord`, `dragPreviewNeighbors`

**Rendering rules (evaluated per segment index `i`):**
1. `draggingAffected` (adjacent to a dragging waypoint) → **hidden** (dragPreview covers them)
2. `pendingDragSegments` → **dotted grey straight line** between endpoint waypoints
3. Normal → **solid line** with `routeColor`
4. Also renders `"drag-preview"` `ShapeSource` as dotted `MultiLineString` while dragging

Segment IDs are stable strings `"${wpA.id}-${wpB.id}"`. Pending segments use `"${segId}-unsnapped"` to force MapLibre to destroy/recreate the layer when transitioning back to solid.

---

### WaypointMarker (`src/components/WaypointMarker.tsx`)

Draggable `PointAnnotation` per waypoint.

**Props:** `waypoint: Waypoint`, `index: number`, `label: string` (A, B, C…), `bearing: number`, `mapMoving: boolean`

**Store writes:** `moveWaypoint`, `removeWaypoint`, `setDraggingIndices`, `clearDraggingIndices`, `setPendingDragSegments`, `setDragPreview`, `clearDragPreview`

**Key behaviors:**
- Drag start → `setDraggingIndices([index])` + `setDragPreview(coord, neighbors)`.
- Drag move → `setDragPreview(coord, neighbors)`.
- Drag end → `moveWaypoint(id, coord)` + `clearDraggingIndices()` + `clearDragPreview()` + `setPendingDragSegments([index-1, index])`.
- Tap → `removeWaypoint(id)`.
- `mapMoving=true` disables the touch target to prevent accidental drag during map pan.
- `bearing` rotates the marker arrow along the route tangent (from `computeWaypointBearingsFromRoute`).

---

### MidpointMarker (`src/components/MidpointMarker.tsx`)

Insert-waypoint button at the geographic midpoint of each route segment.

**Props:** `coordinate: Coordinate`, `afterIndex: number`, `bearing: number`

**Store writes:** `insertWaypoint(afterIndex, coord)`

---

### AccountModal (`src/components/AccountModal.tsx`)

Auth form rendered as a modal from `ControlsPanel`.

**Auth store reads/writes:** `user`, `session`, `setSession`, `setLoading`

**Key behaviors:**
- Sign in → `signIn(email, password)` → on success: `setSession` + `pullMissingRoutes()` + `pullSettings(applyFn)` (both fire-and-forget).
- Register → `signUp(email, password)`.
- Sign out → `signOut()` + `setSession(null)`.
- Shows `countUnsyncedRoutes()` count with a "Sync now" button → `syncAllPending()`.

---

## Service Contracts

### `routing.ts`

```ts
// Current — routes each segment per waypoint.snapAfter
fetchRouteSegmented(waypoints: Waypoint[]): Promise<RouteResult>

// Legacy — all-or-nothing snap toggle
fetchRoute(waypoints: Coordinate[], snapToTrails: boolean): Promise<RouteResult>

interface RouteResult {
  route: Feature<LineString>;
  elevationData: [number, number][];  // [distanceKm, elevationM]
  stats: RouteStats;
}
```

### `authService.ts`

```ts
interface AuthResult { user: User | null; session: Session | null; error: string | null; }

signIn(email: string, password: string): Promise<AuthResult>
signUp(email: string, password: string): Promise<AuthResult>
signOut(): Promise<void>
getSession(): Promise<Session | null>   // restore from SecureStore
onAuthStateChange(callback: (session: Session | null) => void): () => void  // returns unsubscribe
```

### `syncService.ts`

```ts
pushRoute(localId: number): Promise<void>               // upsert; no-op if not signed in
deleteRouteInCloud(remoteId: string): Promise<void>     // soft-delete in Supabase
syncAllPending(): Promise<number>                        // push all unsynced; returns count
pullMissingRoutes(): Promise<void>                       // download missing after sign-in
pushSetting(key: string, value: string): Promise<void>
pullSettings(applyFn: (key: string, value: string) => void): Promise<void>
```

### `gpxParser.ts`

```ts
interface ParsedGpx { waypoints: Coordinate[]; trackPoints: Coordinate[]; }
parseGpx(gpxContent: string): ParsedGpx
// <wpt> → waypoints; falls back to evenly-sampled <trkpt> (up to 20 points) if no <wpt>
```

### `gpxExport.ts`

```ts
buildGpxString(waypoints: Waypoint[], routeCoords: number[][]): string  // GPX 1.1 XML
exportGpx(waypoints: Waypoint[], routeCoords: number[][]): Promise<void> // write + share sheet
```

---

## Utility Functions

### `routeMidpoint.ts`

All functions take `(routeCoords: number[][], waypoints: Coordinate[])`.

| Function | Returns | Purpose |
|---|---|---|
| `splitRouteByWaypoints` | `number[][][]` | N-1 coordinate sub-arrays, one per segment |
| `computeSegmentMidpoints` | `Coordinate[]` | Geographic midpoint along each segment |
| `computeSegmentMidpointsWithBearings` | `Array<{coordinate, bearing}>` | Midpoint + compass bearing from route tangent — used by `MidpointMarker` |
| `computeWaypointBearingsFromRoute` | `number[]` | Route tangent bearing at each waypoint — used by `WaypointMarker` for arrow rotation |

Internal helper `routeBearingAt` averages bearing over ±2 route coords (constant `BEARING_LOOK = 2`).

### `units.ts`

```ts
type UnitSystem = 'metric' | 'imperial';
formatDist(km: number, unitSystem: UnitSystem): string  // "12.3 km" or "7.7 mi"; sub-1km → "800 m"
formatEle(m: number, unitSystem: UnitSystem): string    // "1234 m" or "4050 ft"
```
