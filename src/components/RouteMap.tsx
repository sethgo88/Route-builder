import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import type { Feature, MultiLineString, Point } from 'geojson';
import { useRouteStore, type Coordinate } from '../store/routeStore';
import { useRouting } from '../hooks/useRouting';
import WaypointMarker from './WaypointMarker';
import MidpointMarker from './MidpointMarker';
import RoutePolyline from './RoutePolyline';
import ControlsPanel from './ControlsPanel';
import * as Location from 'expo-location';
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_STYLES } from '../constants/map';
import type { MapStyleId } from '../constants/map';
import { computeSegmentMidpoints } from '../utils/routeMidpoint';

export default function RouteMap() {
  // Drive routing side-effects
  useRouting();

  // Request location permissions on mount (Android runtime requirement)
  useEffect(() => {
    Location.requestForegroundPermissionsAsync();
  }, []);

  const waypoints = useRouteStore((s) => s.waypoints);
  const route = useRouteStore((s) => s.route);
  const isLoading = useRouteStore((s) => s.isLoading);
  const addWaypoint = useRouteStore((s) => s.addWaypoint);
  const focusCoordinate = useRouteStore((s) => s.focusCoordinate);
  const setFocusCoordinate = useRouteStore((s) => s.setFocusCoordinate);

  const mapViewRef = useRef<MapLibreGL.MapView>(null);
  const cameraRef = useRef<MapLibreGL.Camera>(null);
  const hasCenteredOnUser = useRef(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  const [activeStyleId, setActiveStyleId] = useState<MapStyleId>('outdoors');
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);

  const [dragPreview, setDragPreview] = useState<{
    coord: Coordinate;
    neighbors: Coordinate[];
  } | null>(null);

  const activeStyle = MAP_STYLES.find((s) => s.id === activeStyleId) ?? MAP_STYLES[0];

  const segmentMidpoints = useMemo(
    () =>
      route
        ? computeSegmentMidpoints(
            route.geometry.coordinates,
            waypoints.map((wp) => wp.coordinate),
          )
        : [],
    [route, waypoints],
  );

  const dragPreviewShape = useMemo((): Feature<MultiLineString> | null => {
    if (!dragPreview) return null;
    const { coord, neighbors } = dragPreview;
    return {
      type: 'Feature',
      geometry: {
        type: 'MultiLineString',
        coordinates: neighbors.map((n) => [
          [coord.longitude, coord.latitude],
          [n.longitude, n.latitude],
        ]),
      },
      properties: {},
    };
  }, [dragPreview]);

  const clearDragPreview = useCallback(() => setDragPreview(null), []);

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

  const handleUserLocationUpdate = useCallback((location: MapLibreGL.Location) => {
    const coord: [number, number] = [location.coords.longitude, location.coords.latitude];
    setUserLocation(coord);
    if (!hasCenteredOnUser.current) {
      hasCenteredOnUser.current = true;
      cameraRef.current?.setCamera({
        centerCoordinate: coord,
        zoomLevel: DEFAULT_ZOOM,
        animationDuration: 800,
        animationMode: 'flyTo',
      });
    }
  }, []);

  const handleLocateMe = useCallback(() => {
    if (!userLocation) return;
    cameraRef.current?.setCamera({
      centerCoordinate: userLocation,
      zoomLevel: DEFAULT_ZOOM,
      animationDuration: 600,
      animationMode: 'flyTo',
    });
  }, [userLocation]);

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
        mapStyle={activeStyle.style}
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

        <MapLibreGL.UserLocation visible onUpdate={handleUserLocationUpdate} />

        <RoutePolyline />

        {dragPreviewShape && (
          <MapLibreGL.ShapeSource id="drag-preview" shape={dragPreviewShape}>
            <MapLibreGL.LineLayer
              id="drag-preview-line"
              style={{ lineColor: '#94a3b8', lineWidth: 2, lineDasharray: [4, 3] }}
            />
          </MapLibreGL.ShapeSource>
        )}

        {waypoints.map((wp, index) => (
          <WaypointMarker
            key={wp.id}
            waypoint={wp}
            index={index}
            total={waypoints.length}
            onDragMove={(coord) => {
              const neighbors: Coordinate[] = [];
              if (index > 0) neighbors.push(waypoints[index - 1].coordinate);
              if (index < waypoints.length - 1) neighbors.push(waypoints[index + 1].coordinate);
              setDragPreview({ coord, neighbors });
            }}
            onDragFinish={clearDragPreview}
          />
        ))}

        {segmentMidpoints.map((midCoord, index) => {
          const wp = waypoints[index];
          const next = waypoints[index + 1];
          return (
            <MidpointMarker
              key={`mid-${wp.id}-${next.id}`}
              id={`mid-${wp.id}-${next.id}`}
              coordinate={midCoord}
              afterIndex={index}
              onDragMove={(coord) =>
                setDragPreview({
                  coord,
                  neighbors: [wp.coordinate, next.coordinate],
                })
              }
              onDragFinish={clearDragPreview}
            />
          );
        })}
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
        <TouchableOpacity
          style={[styles.layerButton, !userLocation && styles.layerButtonDisabled]}
          onPress={handleLocateMe}
        >
          <Text style={styles.layerButtonIcon}>◎</Text>
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
  layerButtonDisabled: {
    opacity: 0.4,
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
