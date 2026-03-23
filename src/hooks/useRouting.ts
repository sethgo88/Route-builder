import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { fetchRoute } from '../services/routing';
import { useRouteStore } from '../store/routeStore';
import { useDebounce } from './useDebounce';

const DEBOUNCE_MS = 400;

/**
 * Watches the waypoints array and automatically computes a route via
 * Stadia Valhalla whenever there are 2 or more waypoints. TanStack Query
 * handles caching — identical waypoints produce no extra API call.
 */
export function useRouting(): void {
	const waypoints = useRouteStore((s) => s.waypoints);
	const isSnapping = useRouteStore((s) => s.isSnapping);
	const setRoute = useRouteStore((s) => s.setRoute);
	const setElevationData = useRouteStore((s) => s.setElevationData);
	const setRouteStats = useRouteStore((s) => s.setRouteStats);
	const setIsLoading = useRouteStore((s) => s.setIsLoading);
	const setPendingDragSegments = useRouteStore((s) => s.setPendingDragSegments);

	// Debounce both inputs so drag events don't fire a request on every pixel
	const debouncedWaypoints = useDebounce(waypoints, DEBOUNCE_MS);
	const debouncedSnapping = useDebounce(isSnapping, DEBOUNCE_MS);

	const { data, isFetching, error } = useQuery({
		queryKey: [
			'route',
			debouncedWaypoints.map((wp) => wp.coordinate),
			debouncedSnapping,
		],
		queryFn: () =>
			fetchRoute(
				debouncedWaypoints.map((wp) => wp.coordinate),
				debouncedSnapping,
			),
		enabled: debouncedWaypoints.length >= 2,
		staleTime: 5 * 60 * 1000,
	});

	// Sync query results into the Zustand store (multiple components read from it)
	useEffect(() => {
		if (data) {
			setRoute(data.route);
			setElevationData(data.elevationData);
			setRouteStats(data.stats);
		}
	}, [data, setRoute, setElevationData, setRouteStats]);

	// Clear route when fewer than 2 waypoints
	useEffect(() => {
		if (debouncedWaypoints.length < 2) {
			setRoute(null);
			setElevationData([]);
			setRouteStats(null);
		}
	}, [debouncedWaypoints.length, setRoute, setElevationData, setRouteStats]);

	// Keep the store's isLoading in sync with query fetch state.
	// Also clear pending (unsnapped) drag segments once the query settles —
	// this covers cache hits where `data` doesn't change and setRoute is never called.
	useEffect(() => {
		setIsLoading(isFetching);
		if (!isFetching) setPendingDragSegments([]);
	}, [isFetching, setIsLoading, setPendingDragSegments]);

	// Surface routing errors to the user
	useEffect(() => {
		if (error) {
			const message = error instanceof Error ? error.message : 'Routing failed';
			Alert.alert('Routing Error', message);
		}
	}, [error]);
}
