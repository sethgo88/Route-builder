import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import type { Feature, Point } from 'geojson';
import { useRouteStore, type Waypoint } from '../store/routeStore';

interface Props {
  waypoint: Waypoint;
  index: number;
}

// Cycle through a palette for multi-waypoint routes
const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];

function getLabel(index: number): string {
  return String.fromCharCode(65 + (index % 26)); // A, B, C ...
}

export default function WaypointMarker({ waypoint, index }: Props) {
  const moveWaypoint = useRouteStore((s) => s.moveWaypoint);
  const removeWaypoint = useRouteStore((s) => s.removeWaypoint);

  const color = COLORS[index % COLORS.length];

  const handleDragEnd = useCallback(
    (feature: Feature<Point>) => {
      const [longitude, latitude] = feature.geometry.coordinates;
      moveWaypoint(waypoint.id, { longitude, latitude });
    },
    [waypoint.id, moveWaypoint],
  );

  return (
    <MapLibreGL.PointAnnotation
      id={`waypoint-${waypoint.id}`}
      coordinate={[waypoint.coordinate.longitude, waypoint.coordinate.latitude]}
      draggable
      onDragEnd={handleDragEnd}
      onSelected={() => {
        // Tap the marker to remove it
        removeWaypoint(waypoint.id);
      }}
    >
      {/* MapLibre requires a single, fixed-size child view */}
      <View style={[styles.marker, { backgroundColor: color }]} collapsable={false}>
        <Text style={styles.label}>{getLabel(index)}</Text>
      </View>
    </MapLibreGL.PointAnnotation>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
  label: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
