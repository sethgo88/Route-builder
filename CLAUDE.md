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

Run both before committing:
```bash
pnpm lint && pnpm typecheck
```

## Stack
React Native 0.76, Expo 52 (bare workflow), MapLibre GL (`@maplibre/maplibre-react-native`), Zustand, TanStack Query, Zod v4, `react-native-svg`, `lucide-react-native`, `fast-xml-parser`, Stadia Maps (tiles + Valhalla routing)

## Folder Structure
```
src/
  constants/
    map.ts              API keys, tile URLs, VALHALLA_BASE_URL, map defaults
  store/
    routeStore.ts       Single Zustand store — waypoints, route, elevation, stats
  hooks/
    useRouting.ts       TanStack Query hook: debounced route fetch on waypoint change
    useDebounce.ts      Generic debounce utility
  services/
    routing.ts          Stadia Valhalla API client (route + elevation) — Zod-validated
    gpxParser.ts        GPX XML → Coordinate[] via fast-xml-parser
    gpxExport.ts        Coordinate[] → GPX XML + native share sheet
  components/
    RouteMap.tsx        Root map, camera, long-press gesture
    WaypointMarker.tsx  Draggable PointAnnotation per waypoint
    MidpointMarker.tsx  Insert-waypoint button on route segment midpoints
    RoutePolyline.tsx   ShapeSource + LineLayer for the route line
    ControlsPanel.tsx   Bottom sheet — style picker, snap toggle, stats, export
    ElevationProfile.tsx  SVG elevation chart with tap-to-fly-camera
docs/
  architecture.md       Data flow, routing details, store shape, component map
```

## Routing Architecture
See `docs/architecture.md` for full data flow, polyline6 decoding, multi-leg concatenation, and API details.

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
