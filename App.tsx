import MapLibreGL from '@maplibre/maplibre-react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RouteMap from './src/components/RouteMap';

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

export default function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<GestureHandlerRootView style={styles.root}>
				<SafeAreaProvider>
					<StatusBar style="dark" />
					<RouteMap />
				</SafeAreaProvider>
			</GestureHandlerRootView>
		</QueryClientProvider>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
});
