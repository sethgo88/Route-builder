# Accuracy Improvements — Research Findings

Research spike for issue #14. Documents actionable enhancements across GPS precision,
Valhalla routing calibration, and polyline decoding robustness. Each finding lists
current behavior, proposed change, effort estimate (S = hours, M = day, L = days),
and affected files. Follow-up issues are linked where created.

---

## 1. GPS Accuracy

### Finding 1 — expo-location accuracy mode not configured (S) ✅ implemented 2026-03-25

| | |
|---|---|
| **Current behavior** | `RouteMap.tsx:33` calls `Location.requestForegroundPermissionsAsync()` but never passes accuracy options when watching or fetching the user's location. MapLibreGL's `UserLocation` component uses the OS default, which may fall back to network/coarse location. |
| **Proposed change** | Pass `{ accuracy: Location.Accuracy.BestForNavigation }` (or at minimum `Accuracy.High`) when initiating location updates. This maps to `kCLLocationAccuracyBestForNavigation` on iOS and the highest-accuracy GPS mode on Android. **Implemented:** `useEffect` in `RouteMap.tsx` now calls `getCurrentPositionAsync({ accuracy: BestForNavigation })` after permission grant, activating high-accuracy GPS mode for MapLibreGL `UserLocation`. |
| **Effort** | S |
| **Affected files** | `src/components/RouteMap.tsx` |

### Finding 2 — Android manifest fine location declaration (S) ✅ audited 2026-03-25

| | |
|---|---|
| **Current behavior** | The bare Expo workflow generates an `android/app/src/main/AndroidManifest.xml`. Expo SDK adds `ACCESS_FINE_LOCATION` automatically when `expo-location` is present, but in a bare workflow this can silently revert to `ACCESS_COARSE_LOCATION` only if the manifest is regenerated without the plugin config. |
| **Proposed change** | Audit `android/app/src/main/AndroidManifest.xml` to confirm `<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>` is present. Also add `ACCESS_BACKGROUND_LOCATION` if background tracking is ever needed. Document findings in a comment in `app.json`. **Audited:** `ACCESS_FINE_LOCATION` confirmed present in both `AndroidManifest.xml` (line 3) and `app.json` permissions array. Bare workflow preserves it on prebuild. No change required. |
| **Effort** | S |
| **Affected files** | `android/app/src/main/AndroidManifest.xml`, `app.json` |

### Finding 3 — MapLibreGL UserLocation heading/tracking mode (M)

| | |
|---|---|
| **Current behavior** | `RouteMap.tsx:152` renders `<MapLibreGL.UserLocation visible onUpdate={handleUserLocationUpdate}/>` with no `renderMode` or heading indicator props. The dot shows position but no direction, which reduces situational awareness on trail navigation. |
| **Proposed change** | Set `renderMode="compass"` (shows a heading cone) and evaluate `showsUserHeadingIndicator={true}`. This requires the heading permission on iOS and compass hardware (available on most Android devices). Could be surfaced as a "Track heading" toggle. |
| **Effort** | M |
| **Affected files** | `src/components/RouteMap.tsx` |

---

## 2. Valhalla Routing

### Finding 4 — Walking speed miscalibrated for hiking (S) ✅ implemented 2026-03-25

| | |
|---|---|
| **Current behavior** | `src/services/routing.ts:93–101` uses `costing: 'pedestrian'` with only `use_trails` set. Valhalla's default pedestrian walking speed is **5.1 km/h**, which is appropriate for urban walking but significantly overestimates pace on technical hiking terrain (typical 3.5–4.5 km/h). This causes ETA and distance-time calculations to be optimistic. |
| **Proposed change** | Add `walking_speed: 4.0` to `costing_options.pedestrian`. Valhalla accepts values from 1–25 km/h. A value of 4.0 km/h aligns with Naismith's Rule base pace and is a common default in hiking apps. This is a one-line addition with no UI changes required. **Implemented:** `walkingSpeed` stored in `settingsStore` (default 4.0, persisted to SQLite), exposed as a +/− stepper in `ControlsPanel`, passed to all Valhalla requests. Changing speed invalidates the route query cache. |
| **Effort** | S |
| **Affected files** | `src/services/routing.ts` |

### Finding 5 — Hill preference parameter absent (S)

| | |
|---|---|
| **Current behavior** | No `use_hills` parameter is sent to Valhalla. The engine defaults to a neutral hill preference (0.5), meaning it will route over steep terrain without any user control. |
| **Proposed change** | Add a `use_hills` costing option (0.0 = strongly avoid hills, 1.0 = prefer hills). Expose as a slider or preset in `ControlsPanel.tsx` (e.g., "Avoid hills" / "Neutral" / "Prefer hills"). Store the preference in `routeStore.ts` alongside `isSnapping`. |
| **Effort** | S |
| **Affected files** | `src/services/routing.ts`, `src/store/routeStore.ts`, `src/components/ControlsPanel.tsx` |

### Finding 6 — No SAC scale difficulty filtering (M)

| | |
|---|---|
| **Current behavior** | Valhalla's pedestrian costing may route over technically difficult trails (T4–T6 on the SAC scale) without any difficulty cap. This is a safety concern — the app could suggest scrambling or alpine routes to unprepared users. |
| **Proposed change** | Add `max_hiking_difficulty` to `costing_options.pedestrian`. Valhalla maps this to OSM `sac_scale` values: 1 = hiking, 2 = mountain hiking, 3 = demanding mountain hiking, 4–6 = alpine grades. Default to 3 (demanding mountain hiking) with a user-configurable setting in `ControlsPanel.tsx`. |
| **Effort** | M |
| **Affected files** | `src/services/routing.ts`, `src/store/routeStore.ts`, `src/components/ControlsPanel.tsx` |

---

## 3. Polyline Decoding

### Finding 7 — decodePolyline6 lacks input validation (S) ✅ implemented 2026-03-25

| | |
|---|---|
| **Current behavior** | `src/services/routing.ts:28–54` — `decodePolyline6` has no guards. Passing an empty string silently returns `[]`, which causes the route render to produce an empty LineString (valid GeoJSON but invisible). A truncated or corrupted encoded string will enter the decode loop mid-sequence and either produce nonsense coordinates (outside `[-90,90]` / `[-180,180]`) or throw a `charCodeAt` exception if `index` runs past `encoded.length`. |
| **Proposed change** | (1) Early-return `[]` for empty/falsy input. (2) After decoding, validate each coordinate: `if (Math.abs(lat) > 90 \|\| Math.abs(lon) > 180) throw new Error(...)`. (3) Wrap call sites in `try/catch` that surfaces a user-visible error via the existing `Alert` pattern in `useRouting.ts`. **Implemented:** `decodePolyline6` now early-returns `[]` for empty input and throws on out-of-range coordinates. Errors propagate through TanStack Query to the existing `Alert` handler in `useRouting.ts`. |
| **Effort** | S |
| **Affected files** | `src/services/routing.ts` |

### Finding 8 — Polyline precision constant is undocumented (S) ✅ implemented 2026-03-25

| | |
|---|---|
| **Current behavior** | The precision divisor `1e6` appears inline at `src/services/routing.ts:51` with a brief comment. Valhalla uses precision 1e6 (polyline6), while Google Maps / standard polyline encoding uses 1e5 (polyline5). The distinction is non-obvious; a future contributor could mistakenly change `1e6` to `1e5`, introducing a 10× coordinate error. |
| **Proposed change** | Extract `const POLYLINE6_PRECISION = 1e6` as a module-level named constant with a JSDoc comment explaining that Valhalla uses polyline6 (not the standard polyline5 at 1e5). **Implemented:** `POLYLINE6_PRECISION = 1e6` extracted as a named constant with a JSDoc warning not to change it to 1e5. |
| **Effort** | S |
| **Affected files** | `src/services/routing.ts` |

### Finding 9 — Native GeoJSON shape format available (M) ❌ not supported by Stadia

| | |
|---|---|
| **Current behavior** | Valhalla encodes route geometry as polyline6, requiring client-side decoding (`decodePolyline6`, ~27 lines) and manual multi-leg concatenation at `src/services/routing.ts:120–124`. |
| **Proposed change** | Valhalla's `/route/v1` endpoint accepts `shape_format: 'geojson'` in the request body, returning a GeoJSON `LineString` per leg directly. This eliminates `decodePolyline6` entirely and simplifies concatenation to a coordinate array merge. The response Zod schema and `fetchRoute` logic would need updating, but the surface area is confined to `routing.ts`. **Not implemented:** Stadia's hosted Valhalla returns HTTP 400 — `unknown variant geojson, expected polyline6 or polyline5`. Findings #7 and #8 were addressed directly in `decodePolyline6` instead. |
| **Effort** | M |
| **Affected files** | `src/services/routing.ts` |

---

## Summary Table

| # | Area | Finding | Effort | Follow-up Issue |
|---|------|---------|--------|-----------------|
| 1 | GPS | expo-location accuracy mode | S | ✅ implemented |
| 2 | GPS | Android fine location manifest audit | S | ✅ audited — no change needed |
| 3 | GPS | MapLibreGL heading/tracking mode | M | TBD |
| 4 | Routing | Walking speed (user-controlled, default 4.0 km/h) | S | ✅ implemented |
| 5 | Routing | `use_hills` hill preference | S | TBD |
| 6 | Routing | SAC scale difficulty cap | M | TBD |
| 7 | Polyline | `decodePolyline6` input validation | S | ✅ implemented |
| 8 | Polyline | `POLYLINE6_PRECISION` named constant | S | ✅ implemented |
| 9 | Polyline | Native GeoJSON `shape_format` | M | ❌ not supported by Stadia |
