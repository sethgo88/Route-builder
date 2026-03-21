import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import type { Feature, Point } from 'geojson';
import { useRouteStore, type Waypoint, type Coordinate } from '../store/routeStore';

interface Props {
  waypoint: Waypoint;
  index: number;
  total: number;
  onDragMove?: (coord: Coordinate) => void;
  onDragFinish?: () => void;
}

function getMarkerColor(index: number, total: number): string {
  if (index === 0) return '#22c55e';           // green — start
  if (index === total - 1) return '#ef4444';   // red — end
  return '#3b82f6';                            // blue — middle
}

export default function WaypointMarker({ waypoint, index, total, onDragMove, onDragFinish }: Props) {
  const moveWaypoint = useRouteStore((s) => s.moveWaypoint);
  const removeWaypoint = useRouteStore((s) => s.removeWaypoint);

  const color = getMarkerColor(index, total);

  const handleDrag = useCallback(
    (feature: Feature<Point>) => {
      const [longitude, latitude] = feature.geometry.coordinates;
      onDragMove?.({ longitude, latitude });
    },
    [onDragMove],
  );

  const handleDragEnd = useCallback(
    (feature: Feature<Point>) => {
      const [longitude, latitude] = feature.geometry.coordinates;
      moveWaypoint(waypoint.id, { longitude, latitude });
      onDragFinish?.();
    },
    [waypoint.id, moveWaypoint, onDragFinish],
  );

  return (
    <MapLibreGL.PointAnnotation
      id={`waypoint-${waypoint.id}`}
      coordinate={[waypoint.coordinate.longitude, waypoint.coordinate.latitude]}
      draggable
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      onSelected={() => {
        // Tap the marker to remove it
        removeWaypoint(waypoint.id);
      }}
    >
      {/* MapLibre requires a single, fixed-size child view */}
      <View style={[styles.marker, { backgroundColor: color }]} collapsable={false} />
    </MapLibreGL.PointAnnotation>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 5,
  },
});
