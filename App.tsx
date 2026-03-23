import MapLibreGL from '@maplibre/maplibre-react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RouteMap from './src/components/RouteMap';
import { getSession, onAuthStateChange } from './src/services/authService';
import { useAuthStore } from './src/store/authStore';

// MapLibre forked from Mapbox SDK — must explicitly clear the token
// so the native layer doesn't block tile requests waiting for Mapbox auth.
MapLibreGL.setAccessToken(null);

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: 1,
			staleTime: 5 * 60 * 1000,
		},
	},
});

function AuthBootstrap() {
	const setSession = useAuthStore((s) => s.setSession);
	const setLoading = useAuthStore((s) => s.setLoading);

	useEffect(() => {
		// Restore persisted session on cold start
		getSession().then((session) => {
			setSession(session);
			setLoading(false);
		});

		// Keep store in sync with Supabase auth events
		const unsubscribe = onAuthStateChange((session) => {
			setSession(session);
		});
		return unsubscribe;
	}, [setSession, setLoading]);

	return null;
}

export default function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<GestureHandlerRootView style={styles.root}>
				<SafeAreaProvider>
					<StatusBar style="dark" />
					<AuthBootstrap />
					<RouteMap />
				</SafeAreaProvider>
			</GestureHandlerRootView>
		</QueryClientProvider>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
});
