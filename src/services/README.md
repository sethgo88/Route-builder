# services/

Three pure service modules — no React, no store imports, just functions that talk to external APIs or transform data.

---

## routing.ts

Handles all communication with the GraphHopper Directions API and builds the elevation profile data from the response.

### The API call

```ts
fetchRoute(waypoints: Coordinate[], snapToTrails: boolean): Promise<RouteResult>
```

GraphHopper is called via a `POST` to `/route` with a JSON body rather than query string parameters. This is because the list of waypoints can be long and query strings have length limits on some devices/proxies. The body shape:

```json
{
  "points": [[-105.68, 40.34], [-105.65, 40.36]],
  "profile": "hike",
  "elevation": true,
  "points_encoded": false,
  "instructions": false
}
```

Key options:
- **`profile: "hike"`** — GraphHopper's hiking profile prefers `highway=path`, `highway=track`, and other OSM trail tags over roads. This is the mechanism behind "snap to trails". Switching to `"foot"` gives a more direct pedestrian route that may use roads.
- **`elevation: true`** — Returns `[lng, lat, elevation_m]` triples instead of `[lng, lat]` pairs. The third value feeds the elevation profile chart. Without this, the chart would have no data.
- **`points_encoded: false`** — Returns the route geometry as a plain GeoJSON LineString. Encoded polyline format is smaller over the wire but requires a decoder; plain GeoJSON plugs directly into MapLibre's `ShapeSource`.
- **`instructions: false`** — Turn-by-turn instructions are not used anywhere in the app. Omitting them keeps the response payload small.

### Trail snapping decision

```ts
const profile = snapToTrails ? 'hike' : 'foot';
```

"Trail snapping" in this app means routing *along existing OSM trails* rather than snapping a GPS recording to the road network. GraphHopper's `hike` profile natively does this — it costs paths and tracks much lower than roads, so the router prefers them. No separate map-matching API call is needed.

### Elevation profile builder

```ts
function buildElevationProfile(coords: number[][]): [number, number][]
```

Walks the route coordinates and accumulates distance using the Haversine formula. Each point becomes a `[distanceKm, elevationMetres]` pair. This format was chosen because it maps directly to what the SVG chart needs: x = distance, y = elevation.

The Haversine formula is implemented inline rather than pulling in a library like Turf.js because it is the only geo math needed anywhere in the codebase. Adding Turf for one function adds ~200 KB to the bundle.

```ts
function haversineKm(lat1, lon1, lat2, lon2): number
```

Haversine gives the great-circle distance between two points on a sphere. For the distances involved in hiking routes (typically < 50 km) the difference between Haversine and a more precise ellipsoidal formula (Vincenty) is less than 0.5%, which is negligible for display purposes.

### Error handling

The function throws with a descriptive message on any non-OK HTTP response, including the API's own error message from the response body. The caller (`useRouting`) catches this and surfaces it via `Alert.alert`.

---

## gpxParser.ts

Converts a GPX XML string into usable coordinates.

```ts
parseGpx(gpxContent: string): ParsedGpx
// Returns: { waypoints: Coordinate[], trackPoints: Coordinate[] }
```

### Why `fast-xml-parser`?

GPX is XML. The browser `DOMParser` is not available in React Native's JS engine. `fast-xml-parser` is a zero-native-dependency XML parser that runs in any JS environment. It handles namespaces, attribute parsing, and edge cases like a single `<wpt>` vs an array of `<wpt>` elements.

### GPX structure

A `.gpx` file can contain two kinds of coordinate data:

- **`<wpt>` elements** — discrete named waypoints. These map naturally to the app's waypoint model.
- **`<trk>/<trkseg>/<trkpt>` elements** — continuous GPS track recordings. These are the dense point clouds recorded during an actual hike.

### The fallback strategy

```ts
if (waypoints.length === 0 && trackPoints.length >= 2) {
  const step = Math.max(1, Math.floor(trackPoints.length / 20));
  // sample every `step`th track point
}
```

Most GPX files exported from Garmin, Strava, or AllTrails contain only `<trk>` data, not `<wpt>` elements. If the file has no waypoints, the parser samples up to ~20 evenly-spaced track points and promotes them to waypoints. This gives the routing engine a manageable number of points to route through. Sampling 20 points from a 2000-point track preserves the overall shape without sending 2000 waypoints to GraphHopper (which would hit rate limits and take seconds to compute).

### `isArray` config option

```ts
isArray: (name) => ['wpt', 'trkpt', 'trk', 'trkseg'].includes(name)
```

`fast-xml-parser` normally gives you an object when there's one child element and an array when there are multiple. This is a classic XML parsing gotcha — your code would work with two waypoints but silently fail with one. The `isArray` callback forces these tags to always be arrays, eliminating the need to handle both cases everywhere.

---

## gpxExport.ts

Generates a GPX 1.1 XML string and shares it via the native share sheet.

### `buildGpxString`

```ts
buildGpxString(waypoints: Waypoint[], routeCoords: number[][]): string
```

Produces a GPX file with two sections:
1. **`<wpt>` tags** — one per waypoint, labelled "Waypoint 1", "Waypoint 2", etc. These are the user's intent points.
2. **`<trk>/<trkseg>/<trkpt>` tags** — the dense route line from GraphHopper, with elevation in `<ele>` tags. This is what Garmin Connect and similar apps read as the actual path.

Both sections are included because different apps prioritise different data. Garmin Connect reads the track. Some apps read the waypoints for turn-by-turn context.

### `exportGpx`

```ts
exportGpx(waypoints: Waypoint[], routeCoords: number[][]): Promise<void>
```

1. Builds the GPX string
2. Writes it to `FileSystem.cacheDirectory` (a temp directory that the OS cleans up) with a date-stamped filename
3. Calls `Sharing.shareAsync` which opens the native Android/iOS share sheet

The file is written to the cache directory rather than the documents directory because the user is sharing it outward — they do not need the file to persist on-device after sharing. Using the cache directory also avoids requesting storage permissions on newer Android versions.

The `mimeType: 'application/gpx+xml'` and `UTI: 'com.topografix.gpx'` hints tell the share sheet which apps to prioritise (Garmin Connect, OsmAnd, etc.).
