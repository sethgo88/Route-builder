import MapLibreGL from '@maplibre/maplibre-react-native';
import { useRouteStore } from '../store/routeStore';

/**
 * Renders the computed route as a blue line on the map.
 * Must be a direct child of MapLibreGL.MapView.
 */
export default function RoutePolyline() {
	const route = useRouteStore((s) => s.route);

	if (!route) return null;

	return (
		<MapLibreGL.ShapeSource id="routeSource" shape={route}>
			{/* Subtle shadow / casing underneath the main line */}
			<MapLibreGL.LineLayer
				id="routeCasing"
				style={{
					lineColor: '#1d4ed8',
					lineWidth: 7,
					lineCap: 'round',
					lineJoin: 'round',
					lineOpacity: 0.3,
				}}
				layerIndex={10}
			/>
			{/* Main route line */}
			<MapLibreGL.LineLayer
				id="routeLine"
				style={{
					lineColor: '#3b82f6',
					lineWidth: 4,
					lineCap: 'round',
					lineJoin: 'round',
				}}
				layerIndex={11}
			/>
		</MapLibreGL.ShapeSource>
	);
}
