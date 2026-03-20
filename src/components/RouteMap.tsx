import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import type { Feature, Point } from 'geojson';
import { useRouteStore } from '../store/routeStore';
import { useRouting } from '../hooks/useRouting';
import WaypointMarker from './WaypointMarker';
import RoutePolyline from './RoutePolyline';
import ControlsPanel from './ControlsPanel';
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_STYLES } from '../constants/map';
import type { MapStyleId } from '../constants/map';

// Disable Mapbox token requirement — we use Stadia Maps tiles
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

  const [activeStyleId, setActiveStyleId] = useState<MapStyleId>('outdoors');
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);

  const activeStyle = MAP_STYLES.find((s) => s.id === activeStyleId) ?? MAP_STYLES[0];

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
        styleURL={activeStyle.url}
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

      {/* Layer picker — top right */}
      <View style={styles.layerButtonContainer}>
        {layerMenuOpen && (
          <View style={styles.layerMenu}>
            {MAP_STYLES.map((style) => (
              <TouchableOpacity
                key={style.id}
                style={[
                  styles.layerMenuItem,
                  style.id === activeStyleId && styles.layerMenuItemActive,
                ]}
                onPress={() => {
                  setActiveStyleId(style.id);
                  setLayerMenuOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.layerMenuItemText,
                    style.id === activeStyleId && styles.layerMenuItemTextActive,
                  ]}
                >
                  {style.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <TouchableOpacity
          style={styles.layerButton}
          onPress={() => setLayerMenuOpen((v) => !v)}
        >
          <Text style={styles.layerButtonIcon}>⊞</Text>
        </TouchableOpacity>
      </View>

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
  layerButtonContainer: {
    position: 'absolute',
    top: 56,
    right: 12,
    alignItems: 'flex-end',
    gap: 6,
  },
  layerButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  layerButtonIcon: {
    fontSize: 20,
    color: '#374151',
  },
  layerMenu: {
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
  },
  layerMenuItem: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  layerMenuItemActive: {
    backgroundColor: '#eff6ff',
  },
  layerMenuItemText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  layerMenuItemTextActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
});
