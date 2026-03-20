import { XMLParser } from 'fast-xml-parser';
import type { Coordinate } from '../store/routeStore';

export interface ParsedGpx {
  /** Named waypoints from <wpt> tags — loaded as editable route waypoints */
  waypoints: Coordinate[];
  /** Track points from <trk>/<trkseg>/<trkpt> — shown as imported overlay */
  trackPoints: Coordinate[];
}

function toNum(val: string | number | undefined): number {
  return typeof val === 'number' ? val : parseFloat(String(val ?? '0'));
}

/**
 * Parses a GPX XML string and extracts waypoints and track points.
 * Uses <wpt> tags for waypoints; falls back to <trkpt> if no <wpt> found.
 */
export function parseGpx(gpxContent: string): ParsedGpx {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['wpt', 'trkpt', 'trk', 'trkseg'].includes(name),
  });

  const result = parser.parse(gpxContent);
  const gpx = result?.gpx;
  if (!gpx) throw new Error('Invalid GPX file: missing <gpx> root element');

  // Parse <wpt> waypoints
  const wptArray: unknown[] = Array.isArray(gpx.wpt) ? gpx.wpt : gpx.wpt ? [gpx.wpt] : [];
  const waypoints: Coordinate[] = wptArray.map((wpt: any) => ({
    latitude: toNum(wpt['@_lat']),
    longitude: toNum(wpt['@_lon']),
  }));

  // Parse <trk>/<trkseg>/<trkpt> track points
  const trackPoints: Coordinate[] = [];
  const tracks: unknown[] = Array.isArray(gpx.trk) ? gpx.trk : gpx.trk ? [gpx.trk] : [];

  for (const trk of tracks as any[]) {
    const segs: unknown[] = Array.isArray(trk.trkseg)
      ? trk.trkseg
      : trk.trkseg
        ? [trk.trkseg]
        : [];
    for (const seg of segs as any[]) {
      const pts: unknown[] = Array.isArray(seg.trkpt)
        ? seg.trkpt
        : seg.trkpt
          ? [seg.trkpt]
          : [];
      for (const pt of pts as any[]) {
        trackPoints.push({
          latitude: toNum(pt['@_lat']),
          longitude: toNum(pt['@_lon']),
        });
      }
    }
  }

  // If no explicit waypoints, use evenly-sampled track points as waypoints
  if (waypoints.length === 0 && trackPoints.length >= 2) {
    const step = Math.max(1, Math.floor(trackPoints.length / 20));
    for (let i = 0; i < trackPoints.length; i += step) {
      waypoints.push(trackPoints[i]);
    }
    // Always include the last point
    const last = trackPoints[trackPoints.length - 1];
    if (waypoints[waypoints.length - 1] !== last) {
      waypoints.push(last);
    }
  }

  return { waypoints, trackPoints };
}
