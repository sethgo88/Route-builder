# Route Builder — Architecture

> **Keep this file current when:** adding a new editing mode · changing a data flow (save, edit, drag, sign-in) · modifying `fetchRouteSegmented` or the snap logic in `routing.ts` · changing how background routes or offline tiles work · adding a new GPX import/export step.

## Editing Modes

`EditingMode = 'view' | 'creating' | 'editing'`

| Mode | What is active |
|---|---|
| `view` | Map shows saved routes as coloured overlays. Tapping a route opens a preview card with a "Edit" option. No waypoints are active. |
| `creating` | User is building a new unsaved route. Long-press adds waypoints. `RouteActionBar` (✓ / ✗) is visible inside `ControlsPanel`. |
| `editing` | A saved route is loaded by `loadRouteForEditing`. Same controls as creating, but save calls `updateRoute` instead of `saveRoute`. `activeRouteId` is set. |

Transitions: `view → creating` (tap "New Route" button), `view → editing` (tap route → "Edit"), `creating/editing → view` (save or discard via `RouteActionBar` / `ControlsPanel`).

---

## Data Flow — Add Waypoint

```
User long-presses map
  → RouteMap calls addWaypoint(coord)
    → Zustand stamps snapAfter from current isSnapping value
      → useRouting() detects waypoints change (useQuery key updates)
        → useDebounce(400ms) fires
          → fetchRouteSegmented(waypoints) called
            → per segment: snapAfter=true → Valhalla, snapAfter=false → straight line
              → elevation fetched once for full concatenated shape
                → setRoute(feature) [also clears pendingDragSegments]
                → setElevationData(data)
                → setRouteStats(stats)
                  → RoutePolyline, ElevationProfile, ControlsPanel re-render
```

---

## Data Flow — Drag Waypoint

```
User starts dragging WaypointMarker
  → setDraggingIndices([i])            // suppresses adjacent segments in RoutePolyline
  → setDragPreview(coord, neighbors)   // shows dotted preview lines

User releases drag
  → moveWaypoint(id, coord)            // commits position to store
  → clearDraggingIndices()
  → clearDragPreview()
  → setPendingDragSegments([i-1, i])   // adjacent segments render dotted until route resolves

useRouting() fires (debounced 400ms)
  → fetchRouteSegmented()
    → setRoute()                       // side-effect: clears pendingDragSegments
```

RoutePolyline rendering rules:
- `draggingAffected` indices → hidden (dragPreview covers them)
- `pendingDragSegments` indices → dotted straight line between endpoint waypoints
- Normal → solid line with `routeColor`

---

## Data Flow — Save New Route (creating mode)

```
User taps ✓ in RouteActionBar (canSave = waypoints ≥ 2 && route !== null)
  → NameRouteModal opens with default title "Route DD-MM-YY HH:MM"
    → User confirms name
      → saveRoute(name, color, waypoints, route, stats) → returns localId
      → pushRoute(localId)           // Supabase upsert, fire-and-forget
      → clearAll()                   // clears active editing state (not the DB)
      → setEditingMode('view')
      → onRouteSaved() callback      // triggers useRoutes() refetch
```

Leave guard: If user taps ✗ with unsaved waypoints, `UnsavedChangesModal` offers "Discard", "Save & Exit", or "Cancel". "Save & Exit" auto-names with default title.

---

## Data Flow — Edit Existing Route

```
User taps route in list → "Edit"
  → loadRouteForEditing(id)           // synchronous getRoute(id) from SQLite
    → sets editingMode='editing', activeRouteId=id, waypoints, route, routeStats, routeColor, editingRouteName

User edits (add/drag/remove waypoints) ...

User taps Save in ControlsPanel (editing mode)
  → updateRoute(activeRouteId, name, color, waypoints, route, stats)
  → pushRoute(activeRouteId)          // Supabase upsert, fire-and-forget
  → clearAll()
  → setEditingMode('view')
```

Leave guard: `UnsavedChangesModal` triggered when user attempts to exit with pending changes.

---

## Data Flow — Sign In + Cloud Sync

```
AccountModal → signIn(email, password)
  → on success: setSession(session) in authStore
    → pullMissingRoutes()            // download remote routes not in SQLite (fire-and-forget)
    → pullSettings(applyFn)          // last-writer-wins by updated_at (fire-and-forget)
```

`pushRoute(localId)` is called on every save/update regardless of auth state — if not signed in, it exits early silently. `syncAllPending()` is exposed via AccountModal "Sync now" button.

---

## Routing: fetchRouteSegmented

`fetchRouteSegmented(waypoints: Waypoint[]): Promise<RouteResult>`

For each consecutive waypoint pair, checks `waypoints[i+1].snapAfter`:
- `true` → calls `fetchRouteShape(from, to)` (Valhalla `/route/v1`, `pedestrian`, `use_trails: 1.0`)
- `false` → straight `[[from.lon, from.lat], [to.lon, to.lat]]`

Segments concatenated; junction points deduplicated. Single `/elevation/v1` call for the full shape. Elevation range normalised from metres to km.

`fetchRoute(waypoints, snapToTrails)` is the legacy all-or-nothing variant (not used by `useRouting` currently).

### Polyline6 Decoding
Valhalla encodes at precision `1e6` (6 decimal places). Encoded stream is `[lat, lon]` — decoded then swapped to `[lon, lat]` for GeoJSON. Junction points between legs are deduplicated: `legCoords.slice(1)` after the first leg.

---

## snapToTrails Toggle

The `Magnet` button in `RouteMap` calls `setIsSnapping(value)`. The value is **stamped onto each new waypoint** as `snapAfter` at add/insert time. Changing the toggle does not re-route existing waypoints — only affects waypoints added after the change. Per-waypoint snap state is persisted in SQLite alongside waypoint coordinates.

---

## Background Routes (view mode)

`RouteMap` calls `useRoutes()` to get all saved routes. A single `ShapeSource` (`id="background-routes"`) renders a `FeatureCollection` with one feature per route. Line colour comes from `feature.properties.color`. Tap fires `onPress` → local state `previewRoute` → small preview card at bottom → "Edit" calls `loadRouteForEditing(id)`.

---

## Offline Tiles

`ControlsPanel` (editing/creating mode) offers "Download for offline". Calls `MapLibreGL.offlineManager.createPack()` with the current map bounds (`mapViewRef.getVisibleBounds()`), zoom range `OFFLINE_MIN_ZOOM`–`OFFLINE_MAX_ZOOM` (10–16), and tile URL from `OFFLINE_TILE_URL` constant.

---

## GPX Import / Export

**Import** (`gpxParser.ts`): `parseGpx(content)` → `ParsedGpx`. Extracts `<wpt>` as waypoints; if none found, samples up to 20 evenly-spaced `<trkpt>` points. Result passed to `loadWaypoints()` on the store.

**Export** (`gpxExport.ts`): `exportGpx(waypoints, routeCoords)` → writes GPX 1.1 to `FileSystem.cacheDirectory`, opens system share sheet (`expo-sharing`).
