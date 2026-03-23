import { Check, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { saveRoute } from '../services/db';
import { useRouteStore } from '../store/routeStore';
import NameRouteModal from './NameRouteModal';

interface Props {
	onRouteSaved: () => void;
}

export default function RouteActionBar({ onRouteSaved }: Props) {
	const waypoints = useRouteStore((s) => s.waypoints);
	const route = useRouteStore((s) => s.route);
	const routeStats = useRouteStore((s) => s.routeStats);
	const clearAll = useRouteStore((s) => s.clearAll);
	const setEditingMode = useRouteStore((s) => s.setEditingMode);

	const [namingVisible, setNamingVisible] = useState(false);

	const canSave = waypoints.length >= 2 && route !== null;

	const handleSavePress = useCallback(() => {
		if (!canSave) return;
		setNamingVisible(true);
	}, [canSave]);

	const handleNameConfirm = useCallback(
		(name: string) => {
			if (!route) return;
			try {
				saveRoute(name, waypoints, route, routeStats);
			} catch (err: unknown) {
				Alert.alert(
					'Save failed',
					err instanceof Error ? err.message : String(err),
				);
				return;
			}
			setNamingVisible(false);
			clearAll();
			setEditingMode('view');
			onRouteSaved();
		},
		[route, waypoints, routeStats, clearAll, setEditingMode, onRouteSaved],
	);

	const handleCancel = useCallback(() => {
		if (waypoints.length === 0) {
			clearAll();
			setEditingMode('view');
			return;
		}
		Alert.alert('Discard route?', 'All waypoints will be removed.', [
			{ text: 'Keep editing', style: 'cancel' },
			{
				text: 'Discard',
				style: 'destructive',
				onPress: () => {
					clearAll();
					setEditingMode('view');
				},
			},
		]);
	}, [waypoints.length, clearAll, setEditingMode]);

	return (
		<>
			<View style={styles.bar}>
				<TouchableOpacity
					style={styles.cancelButton}
					onPress={handleCancel}
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
				onSave={handleNameConfirm}
				onCancel={() => setNamingVisible(false)}
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
