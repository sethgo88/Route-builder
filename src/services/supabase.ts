import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (__DEV__) {
	console.log('[supabase] URL configured:', supabaseUrl.length > 0);
}

/**
 * SecureStore adapter for @supabase/supabase-js session persistence.
 * expo-secure-store values are limited to ~2 KB on some devices; the Supabase
 * session JSON is well under that limit.
 */
const secureStoreAdapter = {
	getItem: (key: string) => SecureStore.getItemAsync(key),
	setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
	removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
	auth: {
		storage: secureStoreAdapter,
		autoRefreshToken: true,
		persistSession: true,
		detectSessionInUrl: false,
	},
});

/** Row shape returned by the Supabase `routes` table. */
export interface SupabaseRoute {
	id: string; // UUID
	user_id: string;
	name: string;
	waypoints: unknown;
	geometry: unknown;
	stats: unknown | null;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
}
