# components/

Five React Native components that make up the entire UI. `RouteMap` is the root; the others are either direct children of the MapLibre `MapView` or overlaid on top of it.

---

## RouteMap.tsx

The root component. Renders the MapLibre map view, owns the camera ref, and wires up the long-press gesture that adds waypoints.

### Key responsibilities

**Starting the routing side-effect:**
```tsx
useRouting();
```
Called at the top of `RouteMap`. This is the only place the hook is mounted, so routing fires exactly once per waypoint/snapping change, not once per component.

**Long-press to add waypoints:**
```tsx
<MapLibreGL.MapView onLongPress={handleLongPress} ... >
```
Long-press (rather than single tap) was chosen to avoid accidentally adding waypoints while panning. A long press is an unambiguous intent.

**Camera fly-to from elevation chart:**
```tsx
useEffect(() => {
  if (!focusCoordinate) return;
  cameraRef.current?.setCamera({ centerCoordinate: focusCoordinate, ... });
  setFocusCoordinate(null);
}, [focusCoordinate, setFocusCoordinate]);
```
`ElevationProfile` writes a coordinate to the store when the user taps the chart. `RouteMap` watches that value and imperatively moves the camera. After flying, `focusCoordinate` is cleared so the effect doesn't re-trigger.

**MapLibre access token:**
```tsx
MapLibreGL.setAccessToken(null);
```
MapLibre was forked from the Mapbox SDK. The SDK still checks for a Mapbox token by default. Setting it to `null` disables that check so we can use OpenFreeMap tiles without a Mapbox account.

**`attributionEnabled`:**
OpenFreeMap and OSM require attribution under their licences. `attributionEnabled` keeps a small "© OpenStreetMap contributors" notice visible. Disabling it would violate the tile provider's terms.

### Component tree inside MapView

```
MapLibreGL.MapView
  └── MapLibreGL.Camera       (programmatic fly-to)
  └── RoutePolyline           (route line layer)
  └── WaypointMarker × N      (one per waypoint)
```

Components placed inside `MapView` render as map layers — they participate in the map's coordinate space and are affected by pan/zoom. `ControlsPanel` is placed *outside* `MapView` so it stays fixed to the screen.

---

## WaypointMarker.tsx

A single draggable map marker for one waypoint. Rendered once per item in `waypoints` by `RouteMap`.

### PointAnnotation with `draggable`

```tsx
<MapLibreGL.PointAnnotation
  id={`waypoint-${waypoint.id}`}
  coordinate={[waypoint.coordinate.longitude, waypoint.coordinate.latitude]}
  draggable
  onDragEnd={handleDragEnd}
  onSelected={() => removeWaypoint(waypoint.id)}
>
```

`PointAnnotation` is MapLibre's component for placing a custom React Native view at a geographic coordinate. The `draggable` prop enables the native gesture recogniser. `onDragEnd` fires once when the finger lifts, not on every pixel — which is why we don't need to debounce inside this component (the debounce in `useRouting` handles the API rate limiting).

`onSelected` fires when the user taps (not drags) the marker. Tap-to-remove is a common pattern in route builders, though it could also open a context menu in a future iteration.

### Coordinate order

```tsx
coordinate={[waypoint.coordinate.longitude, waypoint.coordinate.latitude]}
```

MapLibre always expects `[longitude, latitude]` (GeoJSON order, x before y). The store stores `{ longitude, latitude }` as named properties, so the conversion is explicit here rather than hidden.

### Visual design

```tsx
const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];
function getLabel(index: number): string {
  return String.fromCharCode(65 + (index % 26)); // A, B, C...
}
```

Waypoints cycle through a palette and get letter labels (A, B, C…). This gives each marker a distinct identity at a glance without requiring the user to name them. The `% 26` wraps back to A after Z for routes with many waypoints.

**`collapsable={false}`** on the inner `View` is a React Native Android requirement for `PointAnnotation` children. Without it, the Android view optimiser may collapse the view node, causing MapLibre's measurement pass to fail and the marker to disappear.

---

## RoutePolyline.tsx

Reads `route` from the store and renders it as a line layer on the map.

### Two layers for one line

```tsx
<MapLibreGL.LineLayer id="routeCasing" style={{ lineColor: '#1d4ed8', lineWidth: 7, lineOpacity: 0.3 }} layerIndex={10} />
<MapLibreGL.LineLayer id="routeLine"   style={{ lineColor: '#3b82f6', lineWidth: 4 }} layerIndex={11} />
```

Two `LineLayer`s are stacked on the same `ShapeSource`. The bottom layer ("casing") is wider, darker, and semi-transparent — it creates a subtle outline/shadow that makes the route visible over both light and dark map tiles. The top layer is the actual blue route line. This two-layer technique is standard in cartographic rendering and requires no image assets.

`layerIndex={10}` and `layerIndex={11}` pin the layers above the map's own road and trail layers (which are typically at lower indices in the style), so the route is always drawn on top.

### `ShapeSource` + `LineLayer`

MapLibre's rendering model separates data (sources) from styling (layers). `ShapeSource` holds the GeoJSON feature; `LineLayer` describes how to draw it. This means you could attach multiple layers to the same source — for example, a `SymbolLayer` to add distance labels along the route — without changing the data structure.

---

## ControlsPanel.tsx

A bottom sheet (`@gorhom/bottom-sheet`) with all user controls: snap toggle, undo/clear, GPX import/export, and offline download.

### Snap points

```tsx
const snapPoints = useMemo(() => ['18%', '55%'], []);
```

The sheet rests at 18% height (just enough for the snap toggle and compact stats) and expands to 55% when the user pulls it up (elevation chart + all buttons visible). `useMemo` is required by `@gorhom/bottom-sheet` — the snap points array must be a stable reference.

### GPX Import flow

```
DocumentPicker.getDocumentAsync()
  → FileSystem.readAsStringAsync(uri)
  → parseGpx(content)
  → loadWaypoints(parsed.waypoints)
  → useRouting fires automatically
```

`DocumentPicker` opens the system file picker. The file URI is then read as a string by `expo-file-system` (native file I/O) and passed to the pure `parseGpx` function. The parsed waypoints replace any existing waypoints in the store, which triggers `useRouting` to compute a route automatically.

### GPX Export flow

```
exportGpx(waypoints, route.geometry.coordinates)
  → buildGpxString() → FileSystem.writeAsStringAsync(cacheDir/filename)
  → Sharing.shareAsync()
```

The export function is called with the raw coordinate array from the route's GeoJSON geometry. These are `[lng, lat, ele]` triples — the elevation is already embedded in the route response because we request `elevation: true` from GraphHopper.

### Offline download

```tsx
const bounds = await mapViewRef.current?.getVisibleBounds();
await MapLibreGL.offlineManager.createPack({ name, styleURL, minZoom, maxZoom, bounds }, progressCb, errorCb);
```

`getVisibleBounds` returns the current map viewport as `[[neLng, neLat], [swLng, swLat]]`. This is passed directly to `offlineManager.createPack`, which downloads all tiles within those bounds between `OFFLINE_MIN_ZOOM` and `OFFLINE_MAX_ZOOM`. The tiles are stored in a SQLite database on-device managed by MapLibre. On subsequent map loads, MapLibre automatically serves tiles from this cache when the device is offline.

The `mapViewRef` is passed down from `RouteMap` as a prop because `ControlsPanel` needs to call `getVisibleBounds` imperatively — it cannot observe the camera state reactively.

### `ActionButton` sub-component

A small inline component for the Undo/Clear/Import/Export buttons. It is defined in the same file rather than as a separate module because it is only used here and has no reuse outside this panel. Extracting it to its own file would add navigation overhead for no benefit.

---

## ElevationProfile.tsx

An SVG area chart showing the elevation profile of the computed route, with a tap-to-fly interaction.

### Data flow

```
store.elevationData → buildChart() → SVG path strings → <Svg>
store.route         → used to look up route coordinates on tap
```

`buildChart` is a pure function that converts `[distanceKm, elevationM][]` into SVG path strings and axis tick data. It lives outside the component so it can be computed with `useMemo` — it only recalculates when `elevationData` or `width` changes.

### SVG coordinate system

The chart maps distance to x and elevation to y within a padded inner rectangle. The padding constants `PAD = { top: 4, bottom: 20, left: 36, right: 8 }` leave room for axis labels on the left and bottom:

```ts
const toX = (dist: number) => PAD.left + (dist / maxDist) * innerW;
const toY = (ele: number) => PAD.top + (1 - (ele - minEle) / eleRange) * innerH;
```

The `1 - ...` in `toY` flips the y-axis — SVG y increases downward, but elevation should increase upward on the chart.

### Area path construction

```ts
const areaPath = `${linePath} L ${lastX},${baseY} L ${firstX},${baseY} Z`;
```

The filled area is the line path continued down to the bottom-left corner and closed. This creates the classic area chart fill. A `LinearGradient` from semi-opaque blue to nearly-transparent gives depth without obscuring the terrain context below.

### Tap-to-fly interaction

```tsx
const handlePress = (evt) => {
  const touchX = evt.nativeEvent.locationX;
  // Convert touchX → distance → closest elevationData index → route coordinate
  setFocusCoordinate([coord[0], coord[1]]);
};
```

When the user taps the SVG, the tap x-position is converted back to a distance along the route. The closest `elevationData` point to that distance is found by linear search. The corresponding route coordinate (at the same index in `route.geometry.coordinates`) is then set as `focusCoordinate`, which `RouteMap` watches to trigger a camera fly-to.

The index correspondence between `elevationData` and `route.geometry.coordinates` works because both arrays are built from the same coordinate array in `routing.ts` — `elevationData[i]` is derived from `coords[i]`.

### Why `react-native-svg` over a charting library?

Charting libraries (Victory Native, react-native-chart-kit) add significant bundle weight and often have opinions about styling that are hard to override. The elevation profile has a very specific, simple shape — a filled area chart with two axis tick sets and a tap gesture. Building it with raw SVG elements takes ~80 lines and has zero additional dependencies.
