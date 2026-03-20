import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import type { Feature, Point } from 'geojson';
import { useRouteStore } from '../store/routeStore';
import { useRouting } from '../hooks/useRouting';
import WaypointMarker from './WaypointMarker';
import RoutePolyline from './RoutePolyline';
import ControlsPanel from './ControlsPanel';
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_STYLE_URL } from '../constants/map';

// Disable Mapbox token requirement — we use OpenFreeMap tiles
MapLibreGL.setAccessToken(null);

export default function RouteMap() {
  // Drive routing side-effects
  useRouting();

  const waypoints = useRouteStore((s) => s.waypoints);
  const isLoading = useRouteStore((s) => s.isLoading);
  const addWaypoint = useRouteStore((s) => s.addWaypoint);
  const focusCoordinate = useRouteStore((s) => s.focusCoordinate);
  const setFocusCoordinate = useRouteStore((s) => s.setFocusCoordinate);

  const mapViewRef = useRef<MapLibreGL.MapView>(null);
  const cameraRef = useRef<MapLibreGL.Camera>(null);

  // Fly to coordinate when set from the elevation profile
  useEffect(() => {
    if (!focusCoordinate) return;
    cameraRef.current?.setCamera({
      centerCoordinate: focusCoordinate,
      zoomLevel: 14,
      animationDuration: 600,
      animationMode: 'flyTo',
    });
    setFocusCoordinate(null);
  }, [focusCoordinate, setFocusCoordinate]);

  const handleLongPress = useCallback(
    (feature: Feature<Point>) => {
      const [longitude, latitude] = feature.geometry.coordinates;
      addWaypoint({ longitude, latitude });
    },
    [addWaypoint],
  );

  return (
    <View style={styles.container}>
      <MapLibreGL.MapView
        ref={mapViewRef}
        style={styles.map}
        styleURL={MAP_STYLE_URL}
        onLongPress={handleLongPress}
        logoEnabled={false}
        attributionEnabled
        attributionPosition={{ bottom: 8, right: 8 }}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          zoomLevel={DEFAULT_ZOOM}
          centerCoordinate={DEFAULT_CENTER}
          animationMode="none"
        />

        <RoutePolyline />

        {waypoints.map((wp, index) => (
          <WaypointMarker key={wp.id} waypoint={wp} index={index} />
        ))}
      </MapLibreGL.MapView>

      {isLoading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color="#3b82f6" />
        </View>
      )}

      <ControlsPanel mapViewRef={mapViewRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: StyleSheet.absoluteFillObject,
  loadingOverlay: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    padding: 8,
  },
});
