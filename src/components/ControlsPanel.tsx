import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import MapLibreGL, { type MapViewRef } from '@maplibre/maplibre-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import type React from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	StyleSheet,
	Switch,
	Text,
	TouchableOpacity,
	useWindowDimensions,
	View,
} from 'react-native';
import {
	OFFLINE_MAX_ZOOM,
	OFFLINE_MIN_ZOOM,
	OFFLINE_TILE_URL,
} from '../constants/map';
import { exportGpx } from '../services/gpxExport';
import { parseGpx } from '../services/gpxParser';
import { useRouteStore } from '../store/routeStore';
import ElevationProfile from './ElevationProfile';

interface Props {
	mapViewRef: React.RefObject<MapViewRef>;
}

export default function ControlsPanel({ mapViewRef }: Props) {
	const snapPoints = useMemo(() => ['18%', '55%'], []);
	const bottomSheetRef = useRef<BottomSheet>(null);
	const { width } = useWindowDimensions();

	const waypoints = useRouteStore((s) => s.waypoints);
	const route = useRouteStore((s) => s.route);
	const routeStats = useRouteStore((s) => s.routeStats);
	const isSnapping = useRouteStore((s) => s.isSnapping);
	const setIsSnapping = useRouteStore((s) => s.setIsSnapping);
	const loadWaypoints = useRouteStore((s) => s.loadWaypoints);

	const [offlineProgress, setOfflineProgress] = useState<number | null>(null);
	const [isExporting, setIsExporting] = useState(false);
	const [isImporting, setIsImporting] = useState(false);

	// ── GPX Export ─────────────────────────────────────────────────────────────
	const handleExport = useCallback(async () => {
		if (!route || waypoints.length === 0) {
			Alert.alert(
				'Nothing to export',
				'Add waypoints and compute a route first.',
			);
			return;
		}
		setIsExporting(true);
		try {
			await exportGpx(waypoints, route.geometry.coordinates);
		} catch (err: unknown) {
			Alert.alert(
				'Export failed',
				err instanceof Error ? err.message : String(err),
			);
		} finally {
			setIsExporting(false);
		}
	}, [route, waypoints]);

	// ── GPX Import ─────────────────────────────────────────────────────────────
	const handleImport = useCallback(async () => {
		setIsImporting(true);
		try {
			const result = await DocumentPicker.getDocumentAsync({
				type: ['application/gpx+xml', 'text/xml', 'application/xml', '*/*'],
				copyToCacheDirectory: true,
			});

			if (result.canceled || !result.assets?.[0]) return;

			const fileUri = result.assets[0].uri;
			const content = await FileSystem.readAsStringAsync(fileUri);
			const parsed = parseGpx(content);

			if (parsed.waypoints.length === 0) {
				Alert.alert(
					'No waypoints found',
					'The GPX file contained no usable waypoints or track points.',
				);
				return;
			}

			loadWaypoints(parsed.waypoints);
			Alert.alert(
				'GPX Imported',
				`Loaded ${parsed.waypoints.length} waypoints. Route will be computed automatically.`,
			);
		} catch (err: unknown) {
			Alert.alert(
				'Import failed',
				err instanceof Error ? err.message : String(err),
			);
		} finally {
			setIsImporting(false);
		}
	}, [loadWaypoints]);

	// ── Offline Download ────────────────────────────────────────────────────────
	const handleDownloadRegion = useCallback(async () => {
		try {
			const bounds = await mapViewRef.current?.getVisibleBounds();
			if (!bounds) {
				Alert.alert('Cannot get map bounds', 'Try zooming in first.');
				return;
			}

			// getVisibleBounds returns [[neLng, neLat], [swLng, swLat]]
			const [[neLng, neLat], [swLng, swLat]] = bounds as [
				[number, number],
				[number, number],
			];

			const packName = `region-${Math.random().toString(36).slice(2)}`;
			setOfflineProgress(0);

			await MapLibreGL.offlineManager.createPack(
				{
					name: packName,
					styleURL: OFFLINE_TILE_URL,
					minZoom: OFFLINE_MIN_ZOOM,
					maxZoom: OFFLINE_MAX_ZOOM,
					bounds: [
						[swLng, swLat],
						[neLng, neLat],
					],
				},
				(_region, status) => {
					setOfflineProgress(status.percentage ?? 0);
					if (status.percentage >= 100) {
						setOfflineProgress(null);
						Alert.alert(
							'Download complete',
							'This region is now available offline.',
						);
					}
				},
				(_region, error) => {
					setOfflineProgress(null);
					Alert.alert('Download failed', error?.message ?? 'Unknown error');
				},
			);
		} catch (err: unknown) {
			setOfflineProgress(null);
			Alert.alert(
				'Download failed',
				err instanceof Error ? err.message : String(err),
			);
		}
	}, [mapViewRef]);

	const hasRoute = route !== null;
	const hasWaypoints = waypoints.length > 0;

	return (
		<BottomSheet
			ref={bottomSheetRef}
			snapPoints={snapPoints}
			index={0}
			backgroundStyle={styles.sheet}
			handleIndicatorStyle={styles.handle}
		>
			<BottomSheetScrollView contentContainerStyle={styles.content}>
				{/* Hint when no waypoints */}
				{!hasWaypoints && (
					<Text style={styles.hint}>Long-press the map to add waypoints</Text>
				)}

				{/* Elevation profile */}
				{hasRoute && <ElevationProfile width={width} />}

				{/* Route stats summary (compact, shown even when sheet is collapsed) */}
				{routeStats && !hasRoute && (
					<View style={styles.statsRow}>
						<Text style={styles.statLabel}>
							{routeStats.distanceKm.toFixed(2)} km
						</Text>
					</View>
				)}

				{/* Controls */}
				<View style={styles.controls}>
					{/* Snap to trails toggle */}
					<View style={styles.row}>
						<Text style={styles.controlLabel}>Snap to trails</Text>
						<Switch
							value={isSnapping}
							onValueChange={setIsSnapping}
							trackColor={{ true: '#3b82f6' }}
						/>
					</View>

					<View style={styles.buttonRow}>
						<ActionButton
							label={isImporting ? 'Importing…' : 'Import GPX'}
							onPress={handleImport}
							disabled={isImporting}
						/>
						<ActionButton
							label={isExporting ? 'Exporting…' : 'Export GPX'}
							onPress={handleExport}
							disabled={isExporting || !hasRoute}
						/>
					</View>

					{/* Offline download */}
					<TouchableOpacity
						style={[
							styles.downloadButton,
							offlineProgress !== null && styles.downloadActive,
						]}
						onPress={handleDownloadRegion}
						disabled={offlineProgress !== null}
					>
						{offlineProgress !== null ? (
							<View style={styles.progressRow}>
								<ActivityIndicator size="small" color="#fff" />
								<Text style={styles.downloadText}>
									{Math.round(offlineProgress)}%
								</Text>
							</View>
						) : (
							<Text style={styles.downloadText}>⬇ Download Visible Area</Text>
						)}
					</TouchableOpacity>
				</View>
			</BottomSheetScrollView>
		</BottomSheet>
	);
}

interface ActionButtonProps {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	destructive?: boolean;
}

function ActionButton({
	label,
	onPress,
	disabled,
	destructive,
}: ActionButtonProps) {
	return (
		<TouchableOpacity
			style={[
				styles.actionButton,
				disabled && styles.actionButtonDisabled,
				destructive && !disabled && styles.actionButtonDestructive,
			]}
			onPress={onPress}
			disabled={disabled}
		>
			<Text
				style={[
					styles.actionButtonText,
					destructive && !disabled && styles.actionButtonTextDestructive,
				]}
			>
				{label}
			</Text>
		</TouchableOpacity>
	);
}

const styles = StyleSheet.create({
	sheet: {
		backgroundColor: '#fff',
		borderTopLeftRadius: 16,
		borderTopRightRadius: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: -3 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 8,
	},
	handle: {
		backgroundColor: '#d1d5db',
		width: 40,
	},
	content: {
		paddingBottom: 24,
	},
	hint: {
		textAlign: 'center',
		color: '#9ca3af',
		fontSize: 13,
		paddingVertical: 12,
	},
	statsRow: {
		paddingHorizontal: 16,
		paddingTop: 8,
	},
	statLabel: {
		fontSize: 14,
		fontWeight: '600',
		color: '#374151',
	},
	controls: {
		paddingHorizontal: 16,
		paddingTop: 8,
		gap: 10,
	},
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: 4,
	},
	controlLabel: {
		fontSize: 14,
		color: '#374151',
		fontWeight: '500',
	},
	buttonRow: {
		flexDirection: 'row',
		gap: 10,
	},
	actionButton: {
		flex: 1,
		paddingVertical: 10,
		borderRadius: 8,
		backgroundColor: '#f3f4f6',
		alignItems: 'center',
	},
	actionButtonDisabled: {
		opacity: 0.4,
	},
	actionButtonDestructive: {
		backgroundColor: '#fee2e2',
	},
	actionButtonText: {
		fontSize: 13,
		fontWeight: '600',
		color: '#374151',
	},
	actionButtonTextDestructive: {
		color: '#dc2626',
	},
	downloadButton: {
		backgroundColor: '#2563eb',
		borderRadius: 8,
		paddingVertical: 12,
		alignItems: 'center',
		marginTop: 4,
	},
	downloadActive: {
		backgroundColor: '#93c5fd',
	},
	downloadText: {
		color: '#fff',
		fontWeight: '600',
		fontSize: 14,
	},
	progressRow: {
		flexDirection: 'row',
		gap: 8,
		alignItems: 'center',
	},
});
