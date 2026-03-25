import BottomSheet, {
	BottomSheetScrollView,
	BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import MapLibreGL, { type MapViewRef } from '@maplibre/maplibre-react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { ArrowLeft, Save } from 'lucide-react-native';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	StyleSheet,
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
	getRoute,
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
import { useSettingsStore } from '../store/settingsStore';
import { formatDist, formatEle } from '../utils/units';
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
	const queryClient = useQueryClient();
	const snapPoints = useMemo(() => ['24%', '65%'], []);
	const bottomSheetRef = useRef<BottomSheet>(null);
	const { width } = useWindowDimensions();

	const editingMode = useRouteStore((s) => s.editingMode);
	const waypoints = useRouteStore((s) => s.waypoints);
	const route = useRouteStore((s) => s.route);
	const routeStats = useRouteStore((s) => s.routeStats);
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

	const unitSystem = useSettingsStore((s) => s.unitSystem);
	const setUnitSystem = useSettingsStore((s) => s.setUnitSystem);
	const loadSettings = useSettingsStore((s) => s.loadSettings);

	const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
	const [offlineProgress, setOfflineProgress] = useState<number | null>(null);
	const [isExporting, setIsExporting] = useState(false);
	const [isImporting, setIsImporting] = useState(false);
	const [showAccount, setShowAccount] = useState(false);
	const [leaveGuardVisible, setLeaveGuardVisible] = useState(false);

	// Initialise DB and load saved routes + settings on mount
	useEffect(() => {
		initDb();
		loadSettings();
		setSavedRoutes(listRoutes());
	}, [loadSettings]);

	// Refresh list whenever we return to view mode
	useEffect(() => {
		if (editingMode === 'view') setSavedRoutes(listRoutes());
	}, [editingMode]);

	const refreshRoutes = useCallback(() => {
		setSavedRoutes(listRoutes());
	}, []);

	// Collapse sheet on every mode transition
	// biome-ignore lint/correctness/useExhaustiveDependencies: editingMode is an intentional trigger
	useEffect(() => {
		bottomSheetRef.current?.snapToIndex(0);
	}, [editingMode]);

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
		queryClient.invalidateQueries({ queryKey: ['savedRoutes'] });
		pushRoute(activeRouteId).catch(() => {});
		clearAll();
		setEditingMode('view');
	}, [
		queryClient,
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
		if (activeRouteId) {
			const saved = getRoute(activeRouteId);
			if (saved) {
				const hasChanges =
					editingRouteName !== saved.name ||
					routeColor !== saved.color ||
					JSON.stringify(waypoints) !== JSON.stringify(saved.waypoints);
				if (hasChanges) {
					setLeaveGuardVisible(true);
					return;
				}
			}
		}
		clearAll();
		setEditingMode('view');
	}, [
		activeRouteId,
		editingRouteName,
		routeColor,
		waypoints,
		clearAll,
		setEditingMode,
	]);

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
				queryClient.invalidateQueries({ queryKey: ['savedRoutes'] });
				pushRoute(activeRouteId).catch(() => {});
			} catch {
				// save failed silently — still navigate away
			}
		}
		setLeaveGuardVisible(false);
		clearAll();
		setEditingMode('view');
	}, [
		queryClient,
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

	return (
		<BottomSheet
			ref={bottomSheetRef}
			snapPoints={snapPoints}
			index={0}
			backgroundStyle={styles.sheet}
			handleIndicatorStyle={styles.handle}
			enableContentPanningGesture={false}
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
													{formatDist(r.stats.distanceKm, unitSystem)}
													{' \u00b7 '}
													{formatEle(r.stats.gainM, unitSystem)} gain
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

				{/* ── Creating mode: elevation profile ──────────────────────── */}
				{isCreating && <ElevationProfile width={width} />}

				{/* ── Editing mode: full route info panel ───────────────────── */}
				{isEditing && (
					<View style={styles.editPanel}>
						{/* Header row: back + title + save */}
						<View style={styles.editHeader}>
							<TouchableOpacity
								style={styles.backButton}
								onPress={handleEditBack}
							>
								<ArrowLeft size={18} color="#374151" />
							</TouchableOpacity>

							<BottomSheetTextInput
								style={styles.titleInput}
								value={editingRouteName}
								onChangeText={setEditingRouteName}
								placeholder="Route name"
								placeholderTextColor="#9ca3af"
								returnKeyType="done"
							/>

							<TouchableOpacity
								style={[
									styles.saveIconButton,
									!hasRoute && styles.saveIconDisabled,
								]}
								onPress={handleEditSave}
								disabled={!hasRoute}
							>
								<Save size={18} color={hasRoute ? '#fff' : '#9ca3af'} />
							</TouchableOpacity>
						</View>

						{/* Elevation profile — subtract editPanel's 16px horizontal padding on each side */}
						<ElevationProfile width={width - 32} />

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

						{/* Action buttons */}
						<View style={styles.editActions}>
							<ActionButton
								label={isExporting ? 'Exporting…' : 'Export GPX'}
								onPress={handleExport}
								disabled={isExporting || !hasRoute}
							/>
						</View>
						<View style={styles.editActions}>
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
						{/* Units toggle */}
						<View style={styles.row}>
							<Text style={styles.controlLabel}>Units</Text>
							<View style={styles.unitToggle}>
								<TouchableOpacity
									style={[
										styles.unitOption,
										unitSystem === 'metric' && styles.unitOptionActive,
									]}
									onPress={() => setUnitSystem('metric')}
								>
									<Text
										style={[
											styles.unitOptionText,
											unitSystem === 'metric' && styles.unitOptionTextActive,
										]}
									>
										km / m
									</Text>
								</TouchableOpacity>
								<TouchableOpacity
									style={[
										styles.unitOption,
										unitSystem === 'imperial' && styles.unitOptionActive,
									]}
									onPress={() => setUnitSystem('imperial')}
								>
									<Text
										style={[
											styles.unitOptionText,
											unitSystem === 'imperial' && styles.unitOptionTextActive,
										]}
									>
										mi / ft
									</Text>
								</TouchableOpacity>
							</View>
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
	// Edit panel
	editPanel: {
		paddingHorizontal: 16,
		paddingTop: 8,
		gap: 2,
	},
	editHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	backButton: {
		padding: 8,
		borderRadius: 8,
		backgroundColor: '#f3f4f6',
	},
	titleInput: {
		flex: 1,
		borderWidth: 1,
		borderColor: '#d1d5db',
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 3,
		fontSize: 15,
		color: '#111827',
		backgroundColor: '#fff',
	},
	saveIconButton: {
		padding: 8,
		borderRadius: 8,
		backgroundColor: '#2563eb',
	},
	saveIconDisabled: {
		backgroundColor: '#f3f4f6',
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
	unitToggle: {
		flexDirection: 'row',
		borderRadius: 8,
		borderWidth: 1,
		borderColor: '#d1d5db',
		overflow: 'hidden',
	},
	unitOption: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		backgroundColor: '#fff',
	},
	unitOptionActive: {
		backgroundColor: '#3b82f6',
	},
	unitOptionText: {
		fontSize: 13,
		fontWeight: '500',
		color: '#374151',
	},
	unitOptionTextActive: {
		color: '#fff',
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
