# Route Builder

An Android app for building hiking and trail routes, built as a free replacement for Gaia GPS's route-planning workflow. Built with React Native (Expo) — if you know React, the patterns here will feel immediately familiar.

---

## What it does

- **Long-press** the map to drop waypoints (A, B, C…)
- Routes are automatically recalculated whenever waypoints change
- **Snap to trails** routes along OSM hiking trails using GraphHopper's `hike` profile
- **Drag any waypoint** to reposition it — the route updates after a short debounce
- **Tap a waypoint** to remove it
- **Elevation profile** chart with tap-to-fly-camera interaction
- **GPX import** — pick a `.gpx` file and waypoints load automatically
- **GPX export** — generates a Garmin-compatible `.gpx` file and opens the share sheet
- **Offline map caching** — download map tiles for the visible region via MapLibre's offline manager

---

## Tech stack

| Layer | Library | Why |
|---|---|---|
| App framework | Expo (bare workflow) + React Native | React patterns, native Android output |
| Map rendering | `@maplibre/maplibre-react-native` | Open-source, free, no Mapbox token needed |
| Map tiles | OpenFreeMap (`tiles.openfreemap.org`) | 100% free, no API key, good vector tile quality |
| Routing & trail snapping | GraphHopper Directions API | Free tier (~500 req/day), `hike` profile follows OSM trails natively |
| State management | Zustand | Minimal boilerplate, selector-based subscriptions |
| Bottom sheet | `@gorhom/bottom-sheet` | Smooth snap-point sheets, well-maintained |
| Elevation chart | `react-native-svg` | Lightweight, no native deps beyond RN |
| GPX parsing | `fast-xml-parser` | Zero-dep XML parser, handles edge cases well |
| GPX export / share | `expo-file-system` + `expo-sharing` | Write to cache dir then open native share sheet |

---

## Project structure

```
Route-builder/
├── App.tsx                        Entry point — wraps everything in gesture and safe-area providers
├── app.json                       Expo config (package name, permissions, plugins)
├── .env.example                   Copy to .env and fill in your API key
└── src/
    ├── constants/
    │   └── map.ts                 Tile URLs, GraphHopper base URL, default map center
    ├── store/
    │   └── routeStore.ts          Single Zustand store for all app state
    ├── hooks/
    │   └── useRouting.ts          Side-effect hook: watches waypoints, fetches routes
    ├── services/
    │   ├── routing.ts             GraphHopper API client + elevation profile builder
    │   ├── gpxParser.ts           GPX XML → Coordinate[] using fast-xml-parser
    │   └── gpxExport.ts           Coordinate[] → GPX XML string + share sheet
    └── components/
        ├── RouteMap.tsx           Root map component — MapLibre view, camera, gestures
        ├── WaypointMarker.tsx     Draggable PointAnnotation per waypoint
        ├── RoutePolyline.tsx      ShapeSource + LineLayer rendering the route
        ├── ControlsPanel.tsx      Bottom sheet with all controls and stats
        └── ElevationProfile.tsx   SVG elevation chart with tap-to-fly interaction
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Get a GraphHopper API key

Register for free at [graphhopper.com](https://www.graphhopper.com/). The free tier gives ~500 route requests per day, which is plenty for personal use.

### 3. Add your API key

```bash
cp .env.example .env
# Edit .env and set EXPO_PUBLIC_GRAPHHOPPER_KEY=your_key_here
```

### 4. Run on Android

You need a physical device or emulator with Android Studio set up. MapLibre requires a custom dev client (not Expo Go).

```bash
# First time: generate native Android project
npm run prebuild

# Then run
npm run android
```

---

## Architecture decisions

### Why Expo bare workflow instead of Expo Go?

`@maplibre/maplibre-react-native` includes native C++ code (the GL rendering engine). Expo Go only supports pure-JS libraries — native modules require either a custom dev client or the bare workflow. The bare workflow gives us full native access while keeping the Expo toolchain (OTA updates, EAS Build, etc.).

### Why GraphHopper over OSRM or OpenRouteService?

OSRM is primarily road-optimised — it treats hiking like walking on roads and ignores trail metadata. OpenRouteService has a good hiking profile but GraphHopper was chosen because it also returns 3D coordinates (elevation per point) in the same response, which feeds the elevation profile without a second API call. GraphHopper's `hike` profile is built on OSM `highway=path/track/footway` tags, so it naturally routes along mapped trails.

### Why is "trail snapping" just the routing profile?

In many route-builder apps, "snap to trail" is a separate map-matching step where a GPS trace is corrected to the nearest road. Here, snapping is achieved more simply: when the `hike` profile is active, GraphHopper's router only selects paths that exist in OSM, so the resulting polyline already follows real trails. A separate map-matching API call would only be needed if you were correcting noisy GPS recordings — not needed for intent-based route planning.

### Why Zustand over Redux or React Context?

Zustand stores are plain JS objects with no Provider boilerplate. Components subscribe to exactly the slices they need via selector functions, which means only the components that use a changed field re-render. For a single-screen app this keeps the re-render tree very tight, which matters when the map is re-rendering on every drag event.

### Why a hook (`useRouting`) instead of triggering fetches inside the store?

Zustand stores are not React components — they have no lifecycle. Putting `useEffect`/debounce logic inside the store would require workarounds (e.g. setTimeout in action creators). A custom hook is the idiomatic React way to express "when X changes, do Y" and keeps async side effects out of the store entirely. The store stays a pure state container; the hook is the reactive glue.
