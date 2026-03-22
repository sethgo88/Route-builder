# Route Builder — CLAUDE.md

> Global rules (workflow, git, TypeScript, Biome) are in `/c/web/CLAUDE.md`. This file covers only what's specific to this project.

## Project Overview
React Native (Expo bare workflow) + TypeScript Android app for planning hiking and trail routes.
Map tiles and routing via Stadia Maps. No backend — all state is local.

## Key Commands
```bash
pnpm install
pnpm lint          # biome check .
pnpm format        # biome format --write .
pnpm typecheck     # tsc --noEmit
expo run:android   # dev build on device/emulator
expo prebuild --clean  # regenerate native Android project
```

## Stack
React Native 0.76, Expo 52 (bare workflow), MapLibre GL (`@maplibre/maplibre-react-native`), Zustand, `react-native-svg`, `fast-xml-parser`, Stadia Maps (tiles + Valhalla routing)

## Folder Structure
```
src/
  constants/
    map.ts              API keys, tile URLs, VALHALLA_BASE_URL, map defaults
  store/
    routeStore.ts       Single Zustand store — waypoints, route, elevation, stats
  hooks/
    useRouting.ts       Side-effect hook: debounced route fetch on waypoint change
  services/
    routing.ts          Stadia Valhalla API client (route + elevation)
    gpxParser.ts        GPX XML → Coordinate[] via fast-xml-parser
    gpxExport.ts        Coordinate[] → GPX XML + native share sheet
  components/
    RouteMap.tsx        Root map, camera, long-press gesture
    WaypointMarker.tsx  Draggable PointAnnotation per waypoint
    MidpointMarker.tsx  Insert-waypoint button on route segment midpoints
    RoutePolyline.tsx   ShapeSource + LineLayer for the route line
    ControlsPanel.tsx   Bottom sheet — style picker, snap toggle, stats, export
    ElevationProfile.tsx  SVG elevation chart with tap-to-fly-camera
```

## Routing Architecture
Two POST requests per route calculation:
1. `POST https://api.stadiamaps.com/route/v1` — pedestrian costing, returns polyline6-encoded shape
2. `POST https://api.stadiamaps.com/elevation/v1` — takes `encoded_polyline`, returns `range_height: [[km, m], ...]`

`leg.shape` is a polyline6 string (precision 1e6, lat/lon order) — decoded in `decodePolyline6()` in `routing.ts`.
Multi-waypoint routes have N-1 legs; all legs are concatenated (skip first point of each subsequent leg).
`snapToTrails` maps to `use_trails: 1.0` vs `0.5` in `costing_options.pedestrian`.

## Environment
```
EXPO_PUBLIC_STADIA_KEY=   # Stadia Maps key — used for both tiles and routing
```

## Task Management
GitHub Issues — repo: `sethgo88/Route-builder` (confirm repo name)

### Workflow
1. Before starting any work, check open issues
2. Never start work without a corresponding issue
3. **Before touching any file:** run `git branch --show-current`; if on `master`, run `git new feat/<description>`
4. Reference the issue number in commit messages
5. Close the issue when complete with a brief summary
