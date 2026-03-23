import { useState } from 'react';
import {
	Modal,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native';

interface Props {
	visible: boolean;
	onSave: (name: string) => void;
	onCancel: () => void;
}

export default function NameRouteModal({ visible, onSave, onCancel }: Props) {
	const [name, setName] = useState('');

	function handleSave() {
		const trimmed = name.trim();
		if (!trimmed) return;
		onSave(trimmed);
		setName('');
	}

	function handleCancel() {
		setName('');
		onCancel();
	}

	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			onRequestClose={handleCancel}
		>
			<View style={styles.overlay}>
				<View style={styles.dialog}>
					<Text style={styles.title}>Name this route</Text>
					<TextInput
						style={styles.input}
						value={name}
						onChangeText={setName}
						placeholder="e.g. Morning Trail Loop"
						placeholderTextColor="#9ca3af"
						autoFocus
						returnKeyType="done"
						onSubmitEditing={handleSave}
					/>
					<View style={styles.row}>
						<TouchableOpacity
							style={[styles.btn, styles.cancelBtn]}
							onPress={handleCancel}
						>
							<Text style={styles.cancelText}>Cancel</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={[
								styles.btn,
								styles.saveBtn,
								!name.trim() && styles.disabled,
							]}
							onPress={handleSave}
							disabled={!name.trim()}
						>
							<Text style={styles.saveText}>Save</Text>
						</TouchableOpacity>
					</View>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	overlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.45)',
		alignItems: 'center',
		justifyContent: 'center',
	},
	dialog: {
		width: '82%',
		backgroundColor: '#fff',
		borderRadius: 14,
		padding: 20,
		gap: 14,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 12,
		elevation: 10,
	},
	title: {
		fontSize: 17,
		fontWeight: '700',
		color: '#111827',
		textAlign: 'center',
	},
	input: {
		borderWidth: 1,
		borderColor: '#d1d5db',
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 15,
		color: '#111827',
	},
	row: {
		flexDirection: 'row',
		gap: 10,
	},
	btn: {
		flex: 1,
		paddingVertical: 11,
		borderRadius: 8,
		alignItems: 'center',
	},
	cancelBtn: {
		backgroundColor: '#f3f4f6',
	},
	saveBtn: {
		backgroundColor: '#2563eb',
	},
	disabled: {
		opacity: 0.4,
	},
	cancelText: {
		fontSize: 15,
		fontWeight: '600',
		color: '#374151',
	},
	saveText: {
		fontSize: 15,
		fontWeight: '700',
		color: '#fff',
	},
});
