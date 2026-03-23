import BottomSheet, {
	BottomSheetScrollView,
	BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import MapLibreGL, { type MapViewRef } from '@maplibre/maplibre-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { ArrowLeft } from 'lucide-react-native';
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
	updateRoute,
} from '../services/db';
import { exportGpx } from '../services/gpxExport';
import { parseGpx } from '../services/gpxParser';
import { deleteRouteInCloud, pushRoute } from '../services/syncService';
import { useAuthStore } from '../store/authStore';
import { useRouteStore } from '../store/routeStore';
import AccountModal from './AccountModal';
import ElevationProfile from './ElevationProfile';
import RouteActionBar from './RouteActionBar';
import UnsavedChangesModal from './UnsavedChangesModal';

// Fixed color palette: neutrals + light/dark pairs for each hue
const COLOR_PALETTE: { label: string; value: string }[] = [
	{ label: 'Black', value: '#000000' },
	{ label: 'Grey', value: '#808080' },
	{ label: 'White', value: '#ffffff' },
	{ label: 'Red', value: '#ef4444' },
	{ label: 'Dark Red', value: '#991b1b' },
	{ label: 'Orange', value: '#f97316' },
	{ label: 'Dark Orange', value: '#c2410c' },
	{ label: 'Yellow', value: '#fbbf24' },
	{ label: 'Dark Yellow', value: '#92400e' },
	{ label: 'Green', value: '#22c55e' },
	{ label: 'Dark Green', value: '#15803d' },
	{ label: 'Blue', value: '#3b82f6' },
	{ label: 'Dark Blue', value: '#1d4ed8' },
	{ label: 'Purple', value: '#a855f7' },
	{ label: 'Dark Purple', value: '#7e22ce' },
];

interface Props {
	mapViewRef: React.RefObject<MapViewRef>;
}

export default function ControlsPanel({ mapViewRef }: Props) {
	const snapPoints = useMemo(() => ['18%', '65%'], []);
	const bottomSheetRef = useRef<BottomSheet>(null);
	const { width } = useWindowDimensions();

	const editingMode = useRouteStore((s) => s.editingMode);
	const waypoints = useRouteStore((s) => s.waypoints);
	const route = useRouteStore((s) => s.route);
	const routeStats = useRouteStore((s) => s.routeStats);
	const isSnapping = useRouteStore((s) => s.isSnapping);
	const setIsSnapping = useRouteStore((s) => s.setIsSnapping);
	const loadWaypoints = useRouteStore((s) => s.loadWaypoints);
	const activeRouteId = useRouteStore((s) => s.activeRouteId);
	const routeColor = useRouteStore((s) => s.routeColor);
	const setRouteColor = useRouteStore((s) => s.setRouteColor);
	const editingRouteName = useRouteStore((s) => s.editingRouteName);
	const setEditingRouteName = useRouteStore((s) => s.setEditingRouteName);
	const clearAll = useRouteStore((s) => s.clearAll);
	const setEditingMode = useRouteStore((s) => s.setEditingMode);
	const loadRouteForEditing = useRouteStore((s) => s.loadRouteForEditing);

	const isCreating = editingMode === 'creating';
	const isEditing = editingMode === 'editing';

	const authUser = useAuthStore((s) => s.user);

	const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
	const [offlineProgress, setOfflineProgress] = useState<number | null>(null);
	const [isExporting, setIsExporting] = useState(false);
	const [isImporting, setIsImporting] = useState(false);
	const [showAccount, setShowAccount] = useState(false);
	const [leaveGuardVisible, setLeaveGuardVisible] = useState(false);

	// Initialise DB and load saved routes on mount
	useEffect(() => {
		initDb();
		setSavedRoutes(listRoutes());
	}, []);

	// Refresh list whenever we return to view mode
	useEffect(() => {
		if (editingMode === 'view') setSavedRoutes(listRoutes());
	}, [editingMode]);

	const refreshRoutes = useCallback(() => {
		setSavedRoutes(listRoutes());
	}, []);

	// Expand sheet when entering creating/editing mode
	useEffect(() => {
		if (isCreating || isEditing) {
			bottomSheetRef.current?.snapToIndex(1);
		} else {
			bottomSheetRef.current?.snapToIndex(0);
		}
	}, [isCreating, isEditing]);

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

	// ── Edit mode: save ─────────────────────────────────────────────────────────
	const handleEditSave = useCallback(() => {
		if (!activeRouteId || !route) return;
		try {
			updateRoute(
				activeRouteId,
				editingRouteName.trim() || 'Unnamed Route',
				routeColor,
				waypoints,
				route,
				routeStats,
			);
		} catch (err: unknown) {
			Alert.alert(
				'Save failed',
				err instanceof Error ? err.message : String(err),
			);
			return;
		}
		pushRoute(activeRouteId).catch(() => {});
		clearAll();
		setEditingMode('view');
	}, [
		activeRouteId,
		editingRouteName,
		routeColor,
		waypoints,
		route,
		routeStats,
		clearAll,
		setEditingMode,
	]);

	// ── Edit mode: delete ───────────────────────────────────────────────────────
	const handleEditDelete = useCallback(() => {
		if (!activeRouteId) return;
		Alert.alert('Delete route', 'This route will be permanently deleted.', [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Delete',
				style: 'destructive',
				onPress: () => {
					const remoteId = deleteRoute(activeRouteId);
					if (remoteId) deleteRouteInCloud(remoteId).catch(() => {});
					clearAll();
					setEditingMode('view');
				},
			},
		]);
	}, [activeRouteId, clearAll, setEditingMode]);

	// ── Edit mode: back (leave guard) ───────────────────────────────────────────
	const handleEditBack = useCallback(() => {
		setLeaveGuardVisible(true);
	}, []);

	const handleLeaveGuardContinue = useCallback(() => {
		setLeaveGuardVisible(false);
		clearAll();
		setEditingMode('view');
	}, [clearAll, setEditingMode]);

	const handleLeaveGuardSaveAndContinue = useCallback(() => {
		if (activeRouteId && route) {
			try {
				updateRoute(
					activeRouteId,
					editingRouteName.trim() || 'Unnamed Route',
					routeColor,
					waypoints,
					route,
					routeStats,
				);
				pushRoute(activeRouteId).catch(() => {});
			} catch {
				// save failed silently — still navigate away
			}
		}
		setLeaveGuardVisible(false);
		clearAll();
		setEditingMode('view');
	}, [
		activeRouteId,
		editingRouteName,
		routeColor,
		waypoints,
		route,
		routeStats,
		clearAll,
		setEditingMode,
	]);

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
				{/* ── View mode: saved routes list ───────────────────────────── */}
				{editingMode === 'view' && (
					<>
						{savedRoutes.length > 0 && (
							<View style={styles.savedSection}>
								<Text style={styles.sectionTitle}>Saved Routes</Text>
								{savedRoutes.map((r) => (
									<TouchableOpacity
										key={r.id}
										style={styles.savedRow}
										onPress={() => loadRouteForEditing(r.id)}
										activeOpacity={0.7}
									>
										<View
											style={[styles.colorDot, { backgroundColor: r.color }]}
										/>
										<View style={styles.savedInfo}>
											<Text style={styles.savedName}>{r.name}</Text>
											{r.stats && (
												<Text style={styles.savedMeta}>
													{r.stats.distanceKm.toFixed(2)} km ·{' '}
													{r.stats.gainM.toFixed(0)} m gain
												</Text>
											)}
										</View>
									</TouchableOpacity>
								))}
							</View>
						)}

						{savedRoutes.length === 0 && (
							<Text style={styles.hint}>
								No saved routes yet. Tap + to add one.
							</Text>
						)}
					</>
				)}

				{/* ── Creating mode: elevation profile + stats ──────────────── */}
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

				{/* ── Editing mode: full route info panel ───────────────────── */}
				{isEditing && (
					<View style={styles.editPanel}>
						{/* Back button */}
						<TouchableOpacity
							style={styles.backButton}
							onPress={handleEditBack}
						>
							<ArrowLeft size={18} color="#374151" />
							<Text style={styles.backLabel}>Back</Text>
						</TouchableOpacity>

						{/* Title input */}
						<BottomSheetTextInput
							style={styles.titleInput}
							value={editingRouteName}
							onChangeText={setEditingRouteName}
							placeholder="Route name"
							placeholderTextColor="#9ca3af"
							returnKeyType="done"
						/>

						{/* Color picker */}
						<Text style={styles.sectionTitle}>Line colour</Text>
						<View style={styles.colorPalette}>
							{COLOR_PALETTE.map((c) => (
								<TouchableOpacity
									key={c.value}
									style={[
										styles.colorSwatch,
										{ backgroundColor: c.value },
										c.value === '#ffffff' && styles.colorSwatchWhite,
										routeColor === c.value && styles.colorSwatchSelected,
									]}
									onPress={() => setRouteColor(c.value)}
									accessibilityLabel={c.label}
								/>
							))}
						</View>

						{/* Elevation profile */}
						{hasRoute && <ElevationProfile width={width} />}

						{/* Action buttons */}
						<View style={styles.editActions}>
							<ActionButton
								label={isExporting ? 'Exporting…' : 'Export GPX'}
								onPress={handleExport}
								disabled={isExporting || !hasRoute}
							/>
						</View>
						<View style={styles.editActions}>
							<ActionButton label="Save" onPress={handleEditSave} />
							<ActionButton
								label="Delete"
								onPress={handleEditDelete}
								destructive
							/>
						</View>
					</View>
				)}

				{/* ── Controls: visible in view + creating modes only ───────── */}
				{!isEditing && (
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
								{authUser
									? `☁ ${authUser.email}`
									: '☁ Sign in to back up routes'}
							</Text>
						</TouchableOpacity>
					</View>
				)}
			</BottomSheetScrollView>

			<AccountModal
				visible={showAccount}
				onClose={() => setShowAccount(false)}
				onSyncComplete={refreshRoutes}
			/>

			<UnsavedChangesModal
				visible={leaveGuardVisible}
				onCancel={() => setLeaveGuardVisible(false)}
				onContinue={handleLeaveGuardContinue}
				onSaveAndContinue={handleLeaveGuardSaveAndContinue}
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
		marginBottom: 4,
	},
	savedRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 10,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: '#e5e7eb',
		gap: 10,
	},
	colorDot: {
		width: 12,
		height: 12,
		borderRadius: 6,
		borderWidth: 1,
		borderColor: 'rgba(0,0,0,0.15)',
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
	statsRow: {
		paddingHorizontal: 16,
		paddingTop: 8,
	},
	statLabel: {
		fontSize: 14,
		fontWeight: '600',
		color: '#374151',
	},
	// Edit panel
	editPanel: {
		paddingHorizontal: 16,
		paddingTop: 8,
		gap: 12,
	},
	backButton: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
		alignSelf: 'flex-start',
		paddingVertical: 6,
		paddingHorizontal: 10,
		borderRadius: 8,
		backgroundColor: '#f3f4f6',
	},
	backLabel: {
		fontSize: 14,
		fontWeight: '600',
		color: '#374151',
	},
	titleInput: {
		borderWidth: 1,
		borderColor: '#d1d5db',
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 15,
		color: '#111827',
		backgroundColor: '#fff',
	},
	colorPalette: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
	},
	colorSwatch: {
		width: 32,
		height: 32,
		borderRadius: 16,
		borderWidth: 2,
		borderColor: 'transparent',
	},
	colorSwatchWhite: {
		borderColor: '#d1d5db',
	},
	colorSwatchSelected: {
		borderColor: '#374151',
	},
	editActions: {
		flexDirection: 'row',
		gap: 10,
	},
	// Controls section (view + creating modes)
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
