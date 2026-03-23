import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import MapLibreGL, { type MapViewRef } from '@maplibre/maplibre-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
	deleteRoute,
	initDb,
	listRoutes,
	type SavedRoute,
} from '../services/db';
import { exportGpx } from '../services/gpxExport';
import { parseGpx } from '../services/gpxParser';
import { deleteRouteInCloud } from '../services/syncService';
import { useAuthStore } from '../store/authStore';
import { useRouteStore } from '../store/routeStore';
import AccountModal from './AccountModal';
import AddRouteButton from './AddRouteButton';
import ElevationProfile from './ElevationProfile';
import RouteActionBar from './RouteActionBar';

interface Props {
	mapViewRef: React.RefObject<MapViewRef>;
}

export default function ControlsPanel({ mapViewRef }: Props) {
	const snapPoints = useMemo(() => ['18%', '55%'], []);
	const bottomSheetRef = useRef<BottomSheet>(null);
	const { width } = useWindowDimensions();

	const editingMode = useRouteStore((s) => s.editingMode);
	const waypoints = useRouteStore((s) => s.waypoints);
	const route = useRouteStore((s) => s.route);
	const routeStats = useRouteStore((s) => s.routeStats);
	const isSnapping = useRouteStore((s) => s.isSnapping);
	const setIsSnapping = useRouteStore((s) => s.setIsSnapping);
	const loadWaypoints = useRouteStore((s) => s.loadWaypoints);

	const isCreating = editingMode === 'creating';

	const authUser = useAuthStore((s) => s.user);

	const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
	const [offlineProgress, setOfflineProgress] = useState<number | null>(null);
	const [isExporting, setIsExporting] = useState(false);
	const [isImporting, setIsImporting] = useState(false);
	const [showAccount, setShowAccount] = useState(false);

	// Initialise DB and load saved routes on mount
	useEffect(() => {
		initDb();
		setSavedRoutes(listRoutes());
	}, []);

	const refreshRoutes = useCallback(() => {
		setSavedRoutes(listRoutes());
	}, []);

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

	const handleDeleteRoute = useCallback((id: number) => {
		Alert.alert('Delete route', 'This route will be permanently deleted.', [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Delete',
				style: 'destructive',
				onPress: () => {
					const remoteId = deleteRoute(id);
					setSavedRoutes(listRoutes());
					if (remoteId) {
						// fire-and-forget cloud soft-delete
						deleteRouteInCloud(remoteId).catch(() => {});
					}
				},
			},
		]);
	}, []);

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
			{/* Creating mode: action bar replaces the handle area */}
			{isCreating && <RouteActionBar onRouteSaved={refreshRoutes} />}

			<BottomSheetScrollView contentContainerStyle={styles.content}>
				{/* View mode ── saved routes list + Add Route button */}
				{!isCreating && (
					<>
						{savedRoutes.length > 0 && (
							<View style={styles.savedSection}>
								<Text style={styles.sectionTitle}>Saved Routes</Text>
								{savedRoutes.map((r) => (
									<View key={r.id} style={styles.savedRow}>
										<View style={styles.savedInfo}>
											<Text style={styles.savedName}>{r.name}</Text>
											{r.stats && (
												<Text style={styles.savedMeta}>
													{r.stats.distanceKm.toFixed(2)} km ·{' '}
													{r.stats.gainM.toFixed(0)} m gain
												</Text>
											)}
										</View>
										<TouchableOpacity
											style={styles.deleteBtn}
											onPress={() => handleDeleteRoute(r.id)}
										>
											<Text style={styles.deleteBtnText}>Delete</Text>
										</TouchableOpacity>
									</View>
								))}
							</View>
						)}

						{savedRoutes.length === 0 && (
							<Text style={styles.hint}>No saved routes yet</Text>
						)}

						<AddRouteButton />
					</>
				)}

				{/* Creating mode ── elevation profile + stats */}
				{isCreating && (
					<>
						{!hasWaypoints && (
							<Text style={styles.hint}>
								Long-press the map to add waypoints
							</Text>
						)}
						{hasRoute && <ElevationProfile width={width} />}
						{routeStats && !hasRoute && (
							<View style={styles.statsRow}>
								<Text style={styles.statLabel}>
									{routeStats.distanceKm.toFixed(2)} km
								</Text>
							</View>
						)}
					</>
				)}

				{/* Controls — visible in both modes */}
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

					{/* Cloud account */}
					<TouchableOpacity
						style={styles.accountButton}
						onPress={() => setShowAccount(true)}
					>
						<Text style={styles.accountButtonText}>
							{authUser ? `☁ ${authUser.email}` : '☁ Sign in to back up routes'}
						</Text>
					</TouchableOpacity>
				</View>
			</BottomSheetScrollView>

			<AccountModal
				visible={showAccount}
				onClose={() => setShowAccount(false)}
				onSyncComplete={refreshRoutes}
			/>
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
	savedSection: {
		paddingHorizontal: 16,
		paddingTop: 8,
		gap: 6,
	},
	sectionTitle: {
		fontSize: 13,
		fontWeight: '700',
		color: '#6b7280',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
		marginBottom: 2,
	},
	savedRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 8,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: '#e5e7eb',
	},
	savedInfo: {
		flex: 1,
	},
	savedName: {
		fontSize: 14,
		fontWeight: '600',
		color: '#111827',
	},
	savedMeta: {
		fontSize: 12,
		color: '#6b7280',
		marginTop: 1,
	},
	deleteBtn: {
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 6,
		backgroundColor: '#fee2e2',
	},
	deleteBtnText: {
		fontSize: 12,
		fontWeight: '600',
		color: '#dc2626',
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
	accountButton: {
		paddingVertical: 10,
		borderRadius: 8,
		backgroundColor: '#f3f4f6',
		alignItems: 'center',
	},
	accountButtonText: {
		fontSize: 13,
		fontWeight: '500',
		color: '#374151',
	},
});
