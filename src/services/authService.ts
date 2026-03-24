import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface AuthResult {
	user: User | null;
	session: Session | null;
	error: string | null;
}

/** Sign in with email + password. Session is auto-persisted via SecureStore. */
export async function signIn(
	email: string,
	password: string,
): Promise<AuthResult> {
	const { data, error } = await supabase.auth.signInWithPassword({
		email,
		password,
	});
	return {
		user: data.user,
		session: data.session,
		error: error?.message ?? null,
	};
}

/** Register a new user with email + password. */
export async function signUp(
	email: string,
	password: string,
): Promise<AuthResult> {
	const { data, error } = await supabase.auth.signUp({ email, password });
	return {
		user: data.user,
		session: data.session,
		error: error?.message ?? null,
	};
}

/** Sign out and clear the persisted session. */
export async function signOut(): Promise<void> {
	await supabase.auth.signOut();
}

/** Restore session from SecureStore (call once on app start). */
export async function getSession(): Promise<Session | null> {
	const { data } = await supabase.auth.getSession();
	return data.session;
}

/** Subscribe to auth state changes — returns the unsubscribe function. */
export function onAuthStateChange(
	callback: (session: Session | null) => void,
): () => void {
	const { data } = supabase.auth.onAuthStateChange((_event, session) => {
		callback(session);
	});
	return () => data.subscription.unsubscribe();
}
