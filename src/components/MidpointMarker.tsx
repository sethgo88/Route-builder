import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import type { Feature, Point } from 'geojson';
import { useRouteStore, type Coordinate } from '../store/routeStore';

interface Props {
  id: string;
  coordinate: Coordinate;
  afterIndex: number;
  onDragMove?: (coord: Coordinate) => void;
  onDragFinish?: () => void;
}

export default function MidpointMarker({ id, coordinate, afterIndex, onDragMove, onDragFinish }: Props) {
  const insertWaypoint = useRouteStore((s) => s.insertWaypoint);

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
      insertWaypoint(afterIndex, { longitude, latitude });
      onDragFinish?.();
    },
    [afterIndex, insertWaypoint, onDragFinish],
  );

  return (
    <MapLibreGL.PointAnnotation
      id={id}
      coordinate={[coordinate.longitude, coordinate.latitude]}
      draggable
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
    >
      <View style={styles.marker} collapsable={false} />
    </MapLibreGL.PointAnnotation>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
});
