import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	FlatList,
	Modal,
	Pressable,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native';
import { deleteRoute } from '../services/db';
import { useRouteStore } from '../store/routeStore';
import { useRoutes } from '../hooks/useRoutes';

interface Props {
	open: boolean;
	onClose: () => void;
}

function formatDate(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}

function formatDistance(km: number): string {
	return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`;
}

export default function RouteListModal({ open, onClose }: Props) {
	const queryClient = useQueryClient();
	const loadRouteForViewing = useRouteStore((s) => s.loadRouteForViewing);
	const { data: routes, isLoading } = useRoutes();

	const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [pressedId, setPressedId] = useState<number | null>(null);

	const handleSelect = useCallback(
		(id: number) => {
			loadRouteForViewing(id);
			onClose();
		},
		[loadRouteForViewing, onClose],
	);

	const confirmDelete = useCallback(
		(id: number, name: string) => {
			Alert.alert('Delete route', `Delete "${name}"? This cannot be undone.`, [
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: () => {
						deleteRoute(id);
						queryClient.invalidateQueries({ queryKey: ['savedRoutes'] });
					},
				},
			]);
		},
		[queryClient],
	);

	return (
		<Modal
			visible={open}
			animationType="slide"
			presentationStyle="pageSheet"
			onRequestClose={onClose}
		>
			<View style={styles.container}>
				<View style={styles.header}>
					<Text style={styles.title}>Saved Routes</Text>
					<TouchableOpacity style={styles.closeButton} onPress={onClose}>
						<X size={20} color="#374151" />
					</TouchableOpacity>
				</View>

				{isLoading ? (
					<View style={styles.centered}>
						<ActivityIndicator size="large" color="#3b82f6" />
					</View>
				) : !routes || routes.length === 0 ? (
					<View style={styles.centered}>
						<Text style={styles.emptyText}>No saved routes yet.</Text>
						<Text style={styles.emptySubText}>
							Tap Add Route to start.
						</Text>
					</View>
				) : (
					<FlatList
						data={routes}
						keyExtractor={(item) => String(item.id)}
						contentContainerStyle={styles.list}
						renderItem={({ item }) => (
							<Pressable
								style={[
									styles.item,
									pressedId === item.id && styles.itemPressed,
								]}
								onPress={() => handleSelect(item.id)}
								onLongPress={() => {
									setPressedId(item.id);
									confirmDelete(item.id, item.name);
									setPressedId(null);
								}}
								delayLongPress={500}
							>
								<View style={styles.itemMain}>
									<Text style={styles.itemName} numberOfLines={1}>
										{item.name}
									</Text>
									<Text style={styles.itemDate}>{formatDate(item.createdAt)}</Text>
								</View>
								{item.stats && (
									<View style={styles.itemStats}>
										<Text style={styles.statText}>
											{formatDistance(item.stats.distanceKm)}
										</Text>
										<Text style={styles.statDivider}>·</Text>
										<Text style={styles.statText}>
											↑ {Math.round(item.stats.gainM)} m
										</Text>
									</View>
								)}
							</Pressable>
						)}
						ItemSeparatorComponent={() => <View style={styles.separator} />}
					/>
				)}
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#f9fafb',
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
		paddingTop: 20,
		paddingBottom: 12,
		backgroundColor: '#fff',
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: '#e5e7eb',
	},
	title: {
		fontSize: 18,
		fontWeight: '600',
		color: '#111827',
	},
	closeButton: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: '#f3f4f6',
		alignItems: 'center',
		justifyContent: 'center',
	},
	centered: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: 32,
	},
	emptyText: {
		fontSize: 16,
		fontWeight: '600',
		color: '#374151',
		marginBottom: 4,
	},
	emptySubText: {
		fontSize: 14,
		color: '#6b7280',
		textAlign: 'center',
	},
	list: {
		padding: 12,
	},
	item: {
		backgroundColor: '#fff',
		borderRadius: 10,
		padding: 14,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.06,
		shadowRadius: 2,
		elevation: 2,
	},
	itemPressed: {
		opacity: 0.75,
	},
	itemMain: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 4,
	},
	itemName: {
		fontSize: 15,
		fontWeight: '600',
		color: '#111827',
		flex: 1,
		marginRight: 8,
	},
	itemDate: {
		fontSize: 12,
		color: '#9ca3af',
	},
	itemStats: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
	},
	statText: {
		fontSize: 13,
		color: '#6b7280',
	},
	statDivider: {
		fontSize: 13,
		color: '#d1d5db',
	},
	separator: {
		height: 8,
	},
});
