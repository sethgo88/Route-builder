# Route Builder — Architecture

## Data Flow

```
User long-presses map
  → addWaypoint(coord) → Zustand store
    → useRouting() detects waypoints change
      → useDebounce(400ms) fires
        → useQuery fetches Stadia Valhalla
          → setRoute / setElevationData / setRouteStats → Zustand store
            → RoutePolyline, ElevationProfile, ControlsPanel re-render
```

## Routing: Two-Request Pattern

Each route calculation makes two sequential POST requests:

### 1. Route Geometry — `/route/v1`
```
POST https://api.stadiamaps.com/route/v1?api_key=<key>
{
  locations: [{ lon, lat, type: "break" }, ...],
  costing: "pedestrian",
  costing_options: { pedestrian: { use_trails: 1.0 | 0.5 } },
  directions_type: "none"
}
```
Returns `trip.legs[].shape` — a polyline6-encoded string per leg.

### 2. Elevation — `/elevation/v1`
```
POST https://api.stadiamaps.com/elevation/v1?api_key=<key>
{
  shape: [{ lon, lat }, ...],  // decoded coords from step 1
  range: true
}
```
Returns `range_height: [[distanceKm, elevationM], ...]`.

## Polyline6 Decoding

Valhalla uses polyline encoding at **precision 1e6** (6 decimal places).
The encoded stream yields `[lat, lon]` pairs — these are **swapped to `[lon, lat]`** for GeoJSON compatibility (`decodePolyline6` in `routing.ts`).

## Multi-Leg Concatenation

A route with N waypoints has N-1 legs. Each leg's `shape` is decoded separately and appended. To avoid duplicating the junction point between legs, the **first coordinate of each subsequent leg is skipped**:
```ts
coords.push(...(coords.length > 0 ? legCoords.slice(1) : legCoords));
```

## snapToTrails

The `isSnapping` store toggle maps to Valhalla's `use_trails` option:
- `true` → `use_trails: 1.0` — strongly prefers designated trails
- `false` → `use_trails: 0.5` — neutral, will use roads too

## Zustand Store Shape

```ts
{
  waypoints: Waypoint[];         // user-placed points
  route: Feature<LineString> | null;
  elevationData: [number, number][];  // [distanceKm, elevationM]
  routeStats: RouteStats | null;      // { distanceKm, gainM, lossM }
  isSnapping: boolean;
  isLoading: boolean;
  focusCoordinate: Coordinate | null; // elevation profile tap → camera fly
}
```

## Component Responsibilities

| Component | Reads from store | Writes to store |
|---|---|---|
| `RouteMap` | `waypoints`, `route`, `isLoading`, `focusCoordinate` | `addWaypoint`, `moveWaypoint` |
| `WaypointMarker` | per-waypoint coordinate | `moveWaypoint`, `removeWaypoint` |
| `MidpointMarker` | route coords + waypoints | `insertWaypoint` |
| `RoutePolyline` | `route` | — |
| `ControlsPanel` | `routeStats`, `isSnapping`, `waypoints`, `route` | `setIsSnapping`, `clearAll`, `undoLastWaypoint`, `loadWaypoints` |
| `ElevationProfile` | `elevationData`, `routeStats` | `setFocusCoordinate` |

## GPX Import/Export

**Import** (`gpxParser.ts`): parses `<wpt>` elements as waypoints; falls back to evenly-sampled `<trkpt>` points if no waypoints found. Calls `loadWaypoints()` on the store.

**Export** (`gpxExport.ts`): serialises current waypoints + route coords to GPX 1.1 XML, writes to the device cache directory, then opens the native share sheet.
