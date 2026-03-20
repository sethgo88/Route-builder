import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { fetchRoute } from '../services/routing';
import { useRouteStore } from '../store/routeStore';

const DEBOUNCE_MS = 400;

/**
 * Watches the waypoints array and automatically computes a route via
 * GraphHopper whenever there are 2 or more waypoints. Debounced so that
 * dragging a waypoint doesn't fire a request on every pixel moved.
 */
export function useRouting(): void {
  const waypoints = useRouteStore((s) => s.waypoints);
  const isSnapping = useRouteStore((s) => s.isSnapping);
  const setRoute = useRouteStore((s) => s.setRoute);
  const setElevationData = useRouteStore((s) => s.setElevationData);
  const setRouteStats = useRouteStore((s) => s.setRouteStats);
  const setIsLoading = useRouteStore((s) => s.setIsLoading);

  // Keep a stable ref so the timeout callback always reads latest values
  const stateRef = useRef({ waypoints, isSnapping });
  stateRef.current = { waypoints, isSnapping };

  useEffect(() => {
    if (waypoints.length < 2) {
      setRoute(null);
      setElevationData([]);
      setRouteStats(null);
      return;
    }

    const timer = setTimeout(async () => {
      const { waypoints: wps, isSnapping: snap } = stateRef.current;
      setIsLoading(true);
      try {
        const result = await fetchRoute(wps, snap);
        setRoute(result.route);
        setElevationData(result.elevationData);
        setRouteStats(result.stats);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Routing failed';
        Alert.alert('Routing Error', message);
      } finally {
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  // Re-run when waypoints or snapping mode changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints, isSnapping]);
}
