import { useEffect, useState } from 'react';
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
import { signIn, signOut, signUp } from '../services/authService';
import { countUnsyncedRoutes } from '../services/db';
import {
	pullMissingRoutes,
	pullSettings,
	syncAllPending,
} from '../services/syncService';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import type { UnitSystem } from '../utils/units';

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
	const setUnitSystem = useSettingsStore((s) => s.setUnitSystem);

	const [mode, setMode] = useState<'signin' | 'register'>('signin');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [isBusy, setIsBusy] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);
	const [unsyncedCount, setUnsyncedCount] = useState(0);

	// Refresh unsynced count whenever the sheet opens while signed in
	useEffect(() => {
		if (visible && user) {
			setUnsyncedCount(countUnsyncedRoutes());
		}
	}, [visible, user]);

	const switchMode = (next: 'signin' | 'register') => {
		setMode(next);
		setEmail('');
		setPassword('');
		setConfirmPassword('');
	};

	const handleClose = () => {
		switchMode('signin');
		onClose();
	};

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
			// Pull remote data in the background
			pullMissingRoutes()
				.then(() => onSyncComplete?.())
				.catch(() => {}); // silent
			pullSettings((key, value) => {
				if (
					key === 'unit_system' &&
					(value === 'metric' || value === 'imperial')
				) {
					setUnitSystem(value as UnitSystem);
				}
			}).catch(() => {}); // silent
			onClose();
		} finally {
			setIsBusy(false);
		}
	};

	const handleRegister = async () => {
		if (!email.trim() || !password || !confirmPassword) {
			Alert.alert('Missing fields', 'Please fill in all fields.');
			return;
		}
		if (password !== confirmPassword) {
			Alert.alert('Password mismatch', 'Passwords do not match.');
			return;
		}
		setIsBusy(true);
		try {
			const result = await signUp(email.trim(), password);
			if (result.error) {
				Alert.alert('Registration failed', result.error);
				return;
			}
			onClose();
		} finally {
			setIsBusy(false);
		}
	};

	const handleSyncNow = async () => {
		setIsSyncing(true);
		try {
			await syncAllPending();
			setUnsyncedCount(countUnsyncedRoutes());
		} finally {
			setIsSyncing(false);
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
			onRequestClose={handleClose}
		>
			<KeyboardAvoidingView
				style={styles.overlay}
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			>
				<View style={styles.sheet}>
					<Text style={styles.title}>
						{user
							? 'Account'
							: mode === 'signin'
								? 'Sign In'
								: 'Create Account'}
					</Text>

					{user ? (
						// ── Signed-in state ──────────────────────────────────────
						<>
							<Text style={styles.emailLabel}>Signed in as</Text>
							<Text style={styles.email}>{user.email}</Text>

							<View style={styles.syncRow}>
								<Text style={styles.syncStatus}>
									{unsyncedCount === 0
										? 'All routes backed up'
										: `${unsyncedCount} route${unsyncedCount === 1 ? '' : 's'} not yet synced`}
								</Text>
								{unsyncedCount > 0 && (
									<TouchableOpacity
										style={styles.syncButton}
										onPress={handleSyncNow}
										disabled={isSyncing}
									>
										{isSyncing ? (
											<ActivityIndicator color="#2563eb" size="small" />
										) : (
											<Text style={styles.syncButtonText}>Sync now</Text>
										)}
									</TouchableOpacity>
								)}
							</View>

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
								{mode === 'signin'
									? 'Sign in to back up your routes to the cloud and sync across devices.'
									: 'Create an account to back up and sync your routes.'}
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
							{mode === 'register' && (
								<TextInput
									style={styles.input}
									placeholder="Confirm Password"
									placeholderTextColor="#9ca3af"
									secureTextEntry
									value={confirmPassword}
									onChangeText={setConfirmPassword}
									editable={!isBusy}
								/>
							)}
							<TouchableOpacity
								style={styles.button}
								onPress={mode === 'signin' ? handleSignIn : handleRegister}
								disabled={isBusy}
							>
								{isBusy ? (
									<ActivityIndicator color="#fff" />
								) : (
									<Text style={styles.buttonText}>
										{mode === 'signin' ? 'Sign in' : 'Create Account'}
									</Text>
								)}
							</TouchableOpacity>
							<TouchableOpacity
								style={styles.toggleButton}
								onPress={() =>
									switchMode(mode === 'signin' ? 'register' : 'signin')
								}
								disabled={isBusy}
							>
								<Text style={styles.toggleText}>
									{mode === 'signin'
										? "Don't have an account? Create one"
										: 'Already have an account? Sign in'}
								</Text>
							</TouchableOpacity>
						</>
					)}

					<TouchableOpacity
						style={styles.cancelButton}
						onPress={handleClose}
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
	toggleButton: {
		alignItems: 'center',
		paddingVertical: 4,
	},
	toggleText: {
		fontSize: 13,
		color: '#2563eb',
	},
	syncRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: 8,
		paddingHorizontal: 12,
		backgroundColor: '#f9fafb',
		borderRadius: 8,
	},
	syncStatus: {
		fontSize: 13,
		color: '#374151',
		flex: 1,
	},
	syncButton: {
		marginLeft: 12,
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 6,
		borderWidth: 1,
		borderColor: '#2563eb',
		minWidth: 80,
		alignItems: 'center',
	},
	syncButtonText: {
		fontSize: 13,
		color: '#2563eb',
		fontWeight: '600',
	},
});
