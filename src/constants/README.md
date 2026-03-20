# constants/map.ts

Central place for every URL and configuration value the app references. Nothing here contains logic — it is purely data.

---

## What's in the file

```ts
MAP_STYLE_URL   // OpenFreeMap vector tile style URL
TOPO_TILE_URL   // OpenTopoMap raster tile URL (not currently wired up — available for future topo overlay)
GRAPHHOPPER_BASE_URL  // Base URL for all GraphHopper API calls
GRAPHHOPPER_API_KEY   // Loaded from EXPO_PUBLIC_GRAPHHOPPER_KEY env var
DEFAULT_CENTER        // [lng, lat] — where the camera starts on first load
DEFAULT_ZOOM          // Initial zoom level
OFFLINE_MIN_ZOOM      // Lowest zoom level included in offline tile packs
OFFLINE_MAX_ZOOM      // Highest zoom level included in offline tile packs
```

---

## Tile providers

### OpenFreeMap (`MAP_STYLE_URL`)

OpenFreeMap (`tiles.openfreemap.org`) serves vector tiles in Mapbox Vector Tile format using an open-source style called "liberty". It requires no API key and has no usage cap for reasonable traffic. The tiles are derived from OpenStreetMap data and include trails, paths, and topographic context.

This is used as the primary base map style passed to `MapLibreGL.MapView`'s `styleURL` prop. MapLibre fetches both the style JSON (which describes how to render each layer) and the tile data it references.

### OpenTopoMap (`TOPO_TILE_URL`)

OpenTopoMap serves pre-rendered raster PNG tiles that look like classic topographic maps — contour lines, hill shading, trail markers. It is exported here for easy use as an optional overlay `RasterLayer` if you want a more traditional topo look. It is not wired up in the current UI but adding it is a few lines of MapLibre JSX.

---

## Environment variable pattern

```ts
export const GRAPHHOPPER_API_KEY = process.env.EXPO_PUBLIC_GRAPHHOPPER_KEY ?? '';
```

Expo exposes environment variables to JS bundles only if they start with `EXPO_PUBLIC_`. The `?? ''` fallback means the app will still compile without a key set — the routing service then throws a descriptive error at call time rather than crashing silently at startup.

---

## Offline zoom range

`OFFLINE_MIN_ZOOM = 10` and `OFFLINE_MAX_ZOOM = 16` represent a practical balance between coverage and file size. Zoom 10 shows enough context to navigate to a trailhead; zoom 16 shows enough detail to follow a narrow path. Each additional zoom level roughly quadruples the number of tiles, so the range is kept tight. These constants are passed directly to `MapLibreGL.offlineManager.createPack()` in `ControlsPanel`.
