# Android Route Builder App — Implementation Plan

## Context

The user wants to build an Android app to replace Gaia GPS, focused specifically on the **route-building workflow**: placing waypoints, snapping routes to existing trails, dragging/repositioning waypoints, and computing shortest paths. The repo is currently empty. The user is an experienced React frontend dev, so React Native (Expo) is the ideal bridge — familiar React patterns with native Android output.

---

## Recommended Tech Stack

| Layer | Library / Service | Why |
|---|---|---|
| **App Framework** | Expo (bare workflow) + React Native | Familiar React DX, native Android output, supports native modules |
| **Maps** | `@maplibre/maplibre-react-native` | Open-source, free, vector tiles, great Android support |
| **Map Tiles** | OpenFreeMap (`https://tiles.openfreemap.org`) | 100% free, no API key, good quality vector tiles |
| **Topo Overlay** | OpenTopoMap raster tiles | Free, no key, shows trails and elevation contours |
| **Routing** | GraphHopper Directions API (free tier) | Hiking profile, trail-aware, 500 req/day free, API key required |
| **Trail Snapping** | GraphHopper `hike` profile | Routes naturally follow OSM trails — no separate matching needed |
| **Gestures** | `react-native-gesture-handler` + `react-native-reanimated` | Draggable markers, smooth UX |
| **State** | `zustand` | Lightweight, perfect for React devs, no boilerplate |

---

## Project Structure

```
Route-builder/
├── App.tsx                    # Entry point
├── app.json                   # Expo config
├── package.json
├── tsconfig.json
├── babel.config.js
├── .env.example
└── src/
    ├── components/
    │   ├── RouteMap.tsx        # MapLibre map with route layer
    │   ├── WaypointMarker.tsx  # Draggable marker component
    │   ├── RoutePolyline.tsx   # Renders route line on map
    │   ├── ControlsPanel.tsx   # Bottom sheet UI (controls + stats + offline)
    │   └── ElevationProfile.tsx # SVG elevation chart
    ├── hooks/
    │   └── useRouting.ts       # Debounced routing side-effects
    ├── services/
    │   ├── routing.ts          # GraphHopper routing API calls
    │   ├── gpxParser.ts        # GPX XML → waypoints
    │   └── gpxExport.ts        # route → GPX XML string (Garmin-compatible)
    ├── store/
    │   └── routeStore.ts       # Zustand store
    └── constants/
        └── map.ts              # Tile URLs, API endpoints
```

---

## Implementation Steps

### 1. Config Files
- `package.json` with all dependencies
- `app.json` — Expo config, Android package name, permissions
- `tsconfig.json`, `babel.config.js` (reanimated plugin last)

### 2. Map Setup (`RouteMap.tsx`)
- `MapLibreGL.MapView` with OpenFreeMap liberty style
- Long press on map → adds waypoint
- `MapLibreGL.Camera` ref for programmatic fly-to
- Calls `useRouting()` hook at root

### 3. Zustand Store (`routeStore.ts`)
```ts
interface RouteStore {
  waypoints: Waypoint[]
  route: GeoJSON.Feature<GeoJSON.LineString> | null
  elevationData: [number, number][]      // [distanceKm, elevationM]
  routeStats: { distanceKm; gainM; lossM } | null
  isSnapping: boolean                     // hike vs foot profile
  isLoading: boolean
  focusCoordinate: [number, number] | null  // camera fly-to target
  addWaypoint / moveWaypoint / removeWaypoint / undoLastWaypoint
  setRoute / setElevationData / setRouteStats
  setIsSnapping / setIsLoading / setFocusCoordinate
  clearAll / loadWaypoints
}
```

### 4. Routing Hook (`hooks/useRouting.ts`)
- Watches `waypoints` in store
- Debounces 400ms (avoids API spam during drag)
- Calls `fetchRoute()` when ≥ 2 waypoints exist
- Stores result: route GeoJSON + elevation profile + stats

### 5. Draggable Waypoints (`WaypointMarker.tsx`)
- `MapLibreGL.PointAnnotation` with `draggable` prop
- `onDragEnd` → `moveWaypoint(id, newCoord)` → triggers re-route
- Lettered labels (A, B, C...) in colored circles

### 6. Routing Service (`services/routing.ts`)
- `POST https://graphhopper.com/api/1/route?key=KEY`
- Profile: `hike` (snapping on) vs `foot` (snapping off)
- `elevation=true` for 3D coordinates
- Returns `{ route, elevationData, stats }`

### 7. Route Display (`RoutePolyline.tsx`)
- `ShapeSource` + `LineLayer`, blue 4px line
- Separate dashed layer for "straight line" preview when < 2 waypoints

### 8. Controls Panel (`ControlsPanel.tsx`)
- `@gorhom/bottom-sheet` — snaps at 20% / 60% height
- Snap to trails toggle, Undo, Clear, GPX Import, GPX Export
- Route stats: distance, elevation gain ↑, loss ↓
- Download offline tiles for visible region

### 9. Elevation Profile (`ElevationProfile.tsx`)
- `react-native-svg` area chart inside ControlsPanel
- Extract `[distanceKm, elevationM]` from 3D route coordinates
- Tap chart → `setFocusCoordinate` → camera flies to that map location
- Display min/max elevation, total gain/loss

### 10. GPX Import (`services/gpxParser.ts`)
- `expo-document-picker` → pick `.gpx` file
- `fast-xml-parser` → extract `<wpt>` tags as waypoints
- `<trk>/<trkpt>` loaded as imported track overlay

### 11. GPX Export (`services/gpxExport.ts`)
- GPX 1.1 XML with `<wpt>` + `<trk>` + elevation in `<ele>` tags
- Garmin Connect compatible
- Save with `expo-file-system` → share via `expo-sharing`

### 12. Offline Map Caching
- `MapLibreGL.offlineManager.createPack()` with visible map bounds
- Show download progress % in ControlsPanel
- Tiles cached on-device via MapLibre's SQLite store

---

## API Setup

**GraphHopper (free tier):**
- Register at graphhopper.com → get free API key
- Free: ~500 route requests/day
- Store key in `.env` as `EXPO_PUBLIC_GRAPHHOPPER_KEY`

**Map Tiles:**
- OpenFreeMap: `https://tiles.openfreemap.org/styles/liberty` — no key needed
- OpenTopoMap: `https://tile.opentopomap.org/{z}/{x}/{y}.png` — no key needed

---

## Updated Library List

| Library | Purpose |
|---|---|
| `@maplibre/maplibre-react-native` | Map rendering, offline manager |
| `react-native-gesture-handler` | Draggable marker gestures |
| `react-native-reanimated` | Smooth animations |
| `zustand` | State management |
| `@gorhom/bottom-sheet` | Controls bottom sheet |
| `react-native-svg` | Elevation profile chart |
| `fast-xml-parser` | Parse GPX XML |
| `expo-document-picker` | GPX file import |
| `expo-file-system` | Write GPX export |
| `expo-sharing` | Share GPX (Garmin, email, etc.) |
| `react-native-safe-area-context` | Safe area handling |

---

## Verification

1. `npx expo run:android` → app launches on device/emulator
2. Long press map → waypoint appears with letter label
3. Add second waypoint → route line appears along trails
4. Drag waypoint → route updates after 400ms debounce
5. Toggle "Snap to trails" → route follows OSM trail network
6. Add 3+ waypoints → shortest path through all computed
7. Tap "Download Visible Area" → offline tiles cached
8. Tap GPX Import → pick file → waypoints load
9. Tap GPX Export → share sheet opens → can upload to Garmin Connect
10. Elevation chart visible in bottom sheet → tap chart → camera flies to location
