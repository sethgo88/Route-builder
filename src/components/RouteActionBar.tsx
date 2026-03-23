import { Check, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { saveRoute } from '../services/db';
import { pushRoute } from '../services/syncService';
import { useRouteStore } from '../store/routeStore';
import NameRouteModal from './NameRouteModal';
import UnsavedChangesModal from './UnsavedChangesModal';

interface Props {
	onRouteSaved: () => void;
}

function makeDefaultTitle(): string {
	const now = new Date();
	const dd = String(now.getDate()).padStart(2, '0');
	const mm = String(now.getMonth() + 1).padStart(2, '0');
	const yy = String(now.getFullYear()).slice(-2);
	const hh = String(now.getHours()).padStart(2, '0');
	const min = String(now.getMinutes()).padStart(2, '0');
	return `Route ${dd}-${mm}-${yy} ${hh}:${min}`;
}

export default function RouteActionBar({ onRouteSaved }: Props) {
	const waypoints = useRouteStore((s) => s.waypoints);
	const route = useRouteStore((s) => s.route);
	const routeStats = useRouteStore((s) => s.routeStats);
	const routeColor = useRouteStore((s) => s.routeColor);
	const clearAll = useRouteStore((s) => s.clearAll);
	const setEditingMode = useRouteStore((s) => s.setEditingMode);

	const [namingVisible, setNamingVisible] = useState(false);
	const [leaveGuardVisible, setLeaveGuardVisible] = useState(false);

	const canSave = waypoints.length >= 2 && route !== null;
	const hasUnsaved = waypoints.length > 0;

	const defaultTitle = useMemo(
		() => (namingVisible ? makeDefaultTitle() : ''),
		[namingVisible],
	);

	const handleSavePress = useCallback(() => {
		if (!canSave) return;
		setNamingVisible(true);
	}, [canSave]);

	const handleNameConfirm = useCallback(
		(name: string) => {
			if (!route) return;
			let localId: number;
			try {
				localId = saveRoute(name, routeColor, waypoints, route, routeStats);
			} catch (err: unknown) {
				Alert.alert(
					'Save failed',
					err instanceof Error ? err.message : String(err),
				);
				return;
			}
			pushRoute(localId).catch(() => {});
			setNamingVisible(false);
			clearAll();
			setEditingMode('view');
			onRouteSaved();
		},
		[
			route,
			routeColor,
			waypoints,
			routeStats,
			clearAll,
			setEditingMode,
			onRouteSaved,
		],
	);

	const handleCancelPress = useCallback(() => {
		if (!hasUnsaved) {
			clearAll();
			setEditingMode('view');
			return;
		}
		setLeaveGuardVisible(true);
	}, [hasUnsaved, clearAll, setEditingMode]);

	const handleLeaveGuardContinue = useCallback(() => {
		setLeaveGuardVisible(false);
		clearAll();
		setEditingMode('view');
	}, [clearAll, setEditingMode]);

	const handleLeaveGuardSaveAndContinue = useCallback(() => {
		if (!route) {
			setLeaveGuardVisible(false);
			clearAll();
			setEditingMode('view');
			return;
		}
		const title = makeDefaultTitle();
		let localId: number | null = null;
		try {
			localId = saveRoute(title, routeColor, waypoints, route, routeStats);
		} catch {
			// save failed silently — still navigate away
		}
		if (localId !== null) pushRoute(localId).catch(() => {});
		setLeaveGuardVisible(false);
		clearAll();
		setEditingMode('view');
		onRouteSaved();
	}, [
		route,
		routeColor,
		waypoints,
		routeStats,
		clearAll,
		setEditingMode,
		onRouteSaved,
	]);

	return (
		<>
			<View style={styles.bar}>
				<TouchableOpacity
					style={styles.cancelButton}
					onPress={handleCancelPress}
					activeOpacity={0.8}
				>
					<X size={18} color="#374151" />
					<Text style={styles.cancelLabel}>Cancel</Text>
				</TouchableOpacity>

				<View style={styles.hint}>
					<Text style={styles.hintText}>
						{waypoints.length === 0
							? 'Long-press map to add waypoints'
							: waypoints.length === 1
								? 'Add one more waypoint'
								: route
									? 'Route ready to save'
									: 'Computing route…'}
					</Text>
				</View>

				<TouchableOpacity
					style={[styles.saveButton, !canSave && styles.saveDisabled]}
					onPress={handleSavePress}
					disabled={!canSave}
					activeOpacity={0.8}
				>
					<Check size={18} color={canSave ? '#fff' : '#9ca3af'} />
					<Text
						style={[styles.saveLabel, !canSave && styles.saveLabelDisabled]}
					>
						Save
					</Text>
				</TouchableOpacity>
			</View>

			<NameRouteModal
				visible={namingVisible}
				defaultName={defaultTitle}
				onSave={handleNameConfirm}
				onCancel={() => setNamingVisible(false)}
			/>

			<UnsavedChangesModal
				visible={leaveGuardVisible}
				onCancel={() => setLeaveGuardVisible(false)}
				onContinue={handleLeaveGuardContinue}
				onSaveAndContinue={handleLeaveGuardSaveAndContinue}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: '#fff',
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderTopWidth: 1,
		borderTopColor: '#e5e7eb',
		gap: 8,
	},
	cancelButton: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
		paddingVertical: 8,
		paddingHorizontal: 10,
		borderRadius: 8,
		backgroundColor: '#f3f4f6',
	},
	cancelLabel: {
		fontSize: 14,
		fontWeight: '600',
		color: '#374151',
	},
	hint: {
		flex: 1,
		alignItems: 'center',
	},
	hintText: {
		fontSize: 12,
		color: '#6b7280',
		textAlign: 'center',
	},
	saveButton: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
		paddingVertical: 8,
		paddingHorizontal: 10,
		borderRadius: 8,
		backgroundColor: '#2563eb',
	},
	saveDisabled: {
		backgroundColor: '#f3f4f6',
	},
	saveLabel: {
		fontSize: 14,
		fontWeight: '700',
		color: '#fff',
	},
	saveLabelDisabled: {
		color: '#9ca3af',
	},
});
