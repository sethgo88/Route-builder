import { Plus } from 'lucide-react-native';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useRouteStore } from '../store/routeStore';

export default function AddRouteButton() {
	const setEditingMode = useRouteStore((s) => s.setEditingMode);

	return (
		<TouchableOpacity
			style={styles.button}
			onPress={() => setEditingMode('creating')}
			activeOpacity={0.85}
		>
			<Plus size={20} color="#fff" />
			<Text style={styles.label}>Add Route</Text>
		</TouchableOpacity>
	);
}

const styles = StyleSheet.create({
	button: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		backgroundColor: '#2563eb',
		borderRadius: 12,
		paddingVertical: 14,
		marginHorizontal: 16,
		marginTop: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.15,
		shadowRadius: 4,
		elevation: 4,
	},
	label: {
		color: '#fff',
		fontSize: 15,
		fontWeight: '700',
	},
});
