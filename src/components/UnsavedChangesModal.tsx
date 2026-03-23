import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
	visible: boolean;
	/** Close modal, stay in editing/creating mode */
	onCancel: () => void;
	/** Discard changes and navigate away */
	onContinue: () => void;
	/** Save with default title silently, then navigate away */
	onSaveAndContinue: () => void;
}

export default function UnsavedChangesModal({
	visible,
	onCancel,
	onContinue,
	onSaveAndContinue,
}: Props) {
	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			onRequestClose={onCancel}
		>
			<View style={styles.overlay}>
				<View style={styles.dialog}>
					<Text style={styles.title}>Unsaved changes</Text>
					<Text style={styles.body}>
						There is unsaved data. Do you want to continue?
					</Text>
					<TouchableOpacity style={styles.saveBtn} onPress={onSaveAndContinue}>
						<Text style={styles.saveBtnText}>Save and continue</Text>
					</TouchableOpacity>
					<TouchableOpacity style={styles.continueBtn} onPress={onContinue}>
						<Text style={styles.continueBtnText}>Continue without saving</Text>
					</TouchableOpacity>
					<TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
						<Text style={styles.cancelBtnText}>Cancel</Text>
					</TouchableOpacity>
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
		gap: 10,
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
		marginBottom: 2,
	},
	body: {
		fontSize: 14,
		color: '#6b7280',
		textAlign: 'center',
		marginBottom: 4,
	},
	saveBtn: {
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: '#2563eb',
		alignItems: 'center',
	},
	saveBtnText: {
		fontSize: 15,
		fontWeight: '700',
		color: '#fff',
	},
	continueBtn: {
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: '#fee2e2',
		alignItems: 'center',
	},
	continueBtnText: {
		fontSize: 15,
		fontWeight: '600',
		color: '#dc2626',
	},
	cancelBtn: {
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: '#f3f4f6',
		alignItems: 'center',
	},
	cancelBtnText: {
		fontSize: 15,
		fontWeight: '600',
		color: '#374151',
	},
});
