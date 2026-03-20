import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Waypoint } from '../store/routeStore';

/**
 * Generates a GPX 1.1 XML string compatible with Garmin Connect and other apps.
 *
 * @param waypoints   The user's editable route waypoints
 * @param routeCoords 3D coordinates from the GraphHopper response [lng, lat, ele?]
 */
export function buildGpxString(
  waypoints: Waypoint[],
  routeCoords: number[][],
): string {
  const now = new Date().toISOString();
  const datePart = now.split('T')[0];
  const name = `Route ${datePart}`;

  const wptTags = waypoints
    .map(
      (wp, i) =>
        `  <wpt lat="${wp.coordinate.latitude.toFixed(7)}" lon="${wp.coordinate.longitude.toFixed(7)}">
    <name>Waypoint ${i + 1}</name>
  </wpt>`,
    )
    .join('\n');

  const trkpts = routeCoords
    .map(([lng, lat, ele]) => {
      const elTag =
        ele != null ? `\n        <ele>${ele.toFixed(1)}</ele>` : '';
      return `      <trkpt lat="${lat.toFixed(7)}" lon="${lng.toFixed(7)}">${elTag}
      </trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Route Builder"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${name}</name>
    <time>${now}</time>
  </metadata>
${wptTags}
  <trk>
    <name>${name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

/**
 * Saves the GPX string to a temp file and opens the system share sheet.
 * The user can send it to Garmin Connect, email, Files, etc.
 */
export async function exportGpx(
  waypoints: Waypoint[],
  routeCoords: number[][],
): Promise<void> {
  const gpxContent = buildGpxString(waypoints, routeCoords);
  const date = new Date().toISOString().split('T')[0];
  const filename = `route-${date}.gpx`;
  const fileUri = `${FileSystem.cacheDirectory}${filename}`;

  await FileSystem.writeAsStringAsync(fileUri, gpxContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device');
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/gpx+xml',
    dialogTitle: 'Export Route GPX',
    UTI: 'com.topografix.gpx',
  });
}
