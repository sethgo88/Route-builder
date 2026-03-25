# Route Builder — CLAUDE.md

> Global rules (workflow, git, TypeScript, Biome) are in `/c/web/CLAUDE.md`. This file covers only what's specific to this project.

## Project Overview
React Native (Expo bare workflow) + TypeScript Android app for planning hiking and trail routes.
Map tiles and routing via Stadia Maps. Local SQLite storage + optional Supabase cloud sync.

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
  constants/map.ts      API keys, tile URLs, VALHALLA_BASE_URL, offline tile settings
  store/
    routeStore.ts       Zustand store — all active editing state (waypoints, route, drag preview, undo/redo)
    authStore.ts        Supabase auth state (user, session)
    settingsStore.ts    User preferences (unit system)
  hooks/
    useRouting.ts       TanStack Query hook: debounced route fetch on waypoint change
    useDebounce.ts      Generic debounce utility
    useRoutes.ts        Fetches saved routes from SQLite
  services/
    routing.ts          Stadia Valhalla API client — fetchRouteSegmented + legacy fetchRoute
    gpxParser.ts        GPX XML → Coordinate[] via fast-xml-parser
    gpxExport.ts        Coordinate[] → GPX 1.1 XML + native share sheet
    db.ts               SQLite CRUD (routes + settings tables) + sync helpers
    authService.ts      Supabase auth (signIn, signUp, signOut, getSession, onAuthStateChange)
    supabase.ts         Supabase client + SecureStore session persistence
    syncService.ts      Local-first cloud sync (pushRoute, pullMissingRoutes, push/pullSettings)
  components/
    RouteMap.tsx        Root map, camera, long-press gesture; calls useRouting()
    WaypointMarker.tsx  Draggable PointAnnotation per waypoint
    MidpointMarker.tsx  Insert-waypoint button on route segment midpoints
    RoutePolyline.tsx   Per-segment ShapeSource+LineLayer; handles drag-preview rendering
    ControlsPanel.tsx   Bottom sheet — snap toggle, stats, GPX, offline tiles, save/edit/delete
    ElevationProfile.tsx  SVG elevation chart with tap-to-fly-camera
    RouteActionBar.tsx  Creating mode ✓/✗ bar; owns NameRouteModal + UnsavedChangesModal
    AccountModal.tsx    Auth form; triggers pullMissingRoutes/pullSettings on sign-in
    RouteListModal.tsx  Saved routes list
    NameRouteModal.tsx  Route naming dialog
    UnsavedChangesModal.tsx  Leave guard dialog
  utils/
    routeMidpoint.ts    Segment midpoints + route tangent bearings
    units.ts            km↔mi, m↔ft formatters
docs/
  architecture.md       Editing modes, data flows, routing, snap toggle, GPX
  store.md              Complete Zustand store reference (all state + actions + types)
  data.md               SQLite schema, db.ts API, Supabase tables, sync strategy
  components.md         Component tree, store matrix, service contracts, utility functions
  accuracy.md           Research spike: GPS, Valhalla calibration, polyline validation
```

## Docs Reference
- `docs/architecture.md` — editing modes, data flows, routing, snap toggle
- `docs/store.md` — all Zustand state fields and actions
- `docs/data.md` — SQLite schema, db.ts API, Supabase tables
- `docs/components.md` — component tree, store reads/writes, service contracts

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
