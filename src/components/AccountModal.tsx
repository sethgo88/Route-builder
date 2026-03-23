import { useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	KeyboardAvoidingView,
	Modal,
	Platform,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native';
import { signIn, signOut } from '../services/authService';
import { pullMissingRoutes } from '../services/syncService';
import { useAuthStore } from '../store/authStore';

interface Props {
	visible: boolean;
	onClose: () => void;
	/** Called after a successful sign-in so the route list can refresh */
	onSyncComplete?: () => void;
}

export default function AccountModal({
	visible,
	onClose,
	onSyncComplete,
}: Props) {
	const user = useAuthStore((s) => s.user);

	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [isBusy, setIsBusy] = useState(false);

	const handleSignIn = async () => {
		if (!email.trim() || !password) {
			Alert.alert('Missing fields', 'Please enter your email and password.');
			return;
		}
		setIsBusy(true);
		try {
			const result = await signIn(email.trim(), password);
			if (result.error) {
				Alert.alert('Sign-in failed', result.error);
				return;
			}
			// Pull any missing remote routes in the background
			pullMissingRoutes()
				.then(() => onSyncComplete?.())
				.catch(() => {}); // silent
			onClose();
		} finally {
			setIsBusy(false);
		}
	};

	const handleSignOut = async () => {
		setIsBusy(true);
		try {
			await signOut();
			onClose();
		} finally {
			setIsBusy(false);
		}
	};

	return (
		<Modal
			visible={visible}
			animationType="slide"
			transparent
			onRequestClose={onClose}
		>
			<KeyboardAvoidingView
				style={styles.overlay}
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			>
				<View style={styles.sheet}>
					<Text style={styles.title}>Account</Text>

					{user ? (
						// ── Signed-in state ──────────────────────────────────────
						<>
							<Text style={styles.emailLabel}>Signed in as</Text>
							<Text style={styles.email}>{user.email}</Text>
							<Text style={styles.hint}>
								Routes are backed up automatically when you save them.
							</Text>
							<TouchableOpacity
								style={[styles.button, styles.destructive]}
								onPress={handleSignOut}
								disabled={isBusy}
							>
								{isBusy ? (
									<ActivityIndicator color="#fff" />
								) : (
									<Text style={styles.buttonText}>Sign out</Text>
								)}
							</TouchableOpacity>
						</>
					) : (
						// ── Signed-out state ─────────────────────────────────────
						<>
							<Text style={styles.hint}>
								Sign in to back up your routes to the cloud and sync across
								devices.
							</Text>
							<TextInput
								style={styles.input}
								placeholder="Email"
								placeholderTextColor="#9ca3af"
								autoCapitalize="none"
								keyboardType="email-address"
								value={email}
								onChangeText={setEmail}
								editable={!isBusy}
							/>
							<TextInput
								style={styles.input}
								placeholder="Password"
								placeholderTextColor="#9ca3af"
								secureTextEntry
								value={password}
								onChangeText={setPassword}
								editable={!isBusy}
							/>
							<TouchableOpacity
								style={styles.button}
								onPress={handleSignIn}
								disabled={isBusy}
							>
								{isBusy ? (
									<ActivityIndicator color="#fff" />
								) : (
									<Text style={styles.buttonText}>Sign in</Text>
								)}
							</TouchableOpacity>
						</>
					)}

					<TouchableOpacity
						style={styles.cancelButton}
						onPress={onClose}
						disabled={isBusy}
					>
						<Text style={styles.cancelText}>Cancel</Text>
					</TouchableOpacity>
				</View>
			</KeyboardAvoidingView>
		</Modal>
	);
}

const styles = StyleSheet.create({
	overlay: {
		flex: 1,
		justifyContent: 'flex-end',
		backgroundColor: 'rgba(0,0,0,0.4)',
	},
	sheet: {
		backgroundColor: '#fff',
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		padding: 24,
		gap: 12,
	},
	title: {
		fontSize: 18,
		fontWeight: '700',
		color: '#111827',
		marginBottom: 4,
	},
	emailLabel: {
		fontSize: 12,
		color: '#6b7280',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
	},
	email: {
		fontSize: 15,
		fontWeight: '600',
		color: '#111827',
	},
	hint: {
		fontSize: 13,
		color: '#6b7280',
		lineHeight: 18,
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
	button: {
		backgroundColor: '#2563eb',
		borderRadius: 8,
		paddingVertical: 12,
		alignItems: 'center',
		marginTop: 4,
	},
	destructive: {
		backgroundColor: '#dc2626',
	},
	buttonText: {
		color: '#fff',
		fontWeight: '600',
		fontSize: 15,
	},
	cancelButton: {
		alignItems: 'center',
		paddingVertical: 8,
	},
	cancelText: {
		fontSize: 14,
		color: '#6b7280',
	},
});
