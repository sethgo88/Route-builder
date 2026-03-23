import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

interface AuthState {
	user: User | null;
	session: Session | null;
	/** True while the initial session restore is in flight */
	isLoading: boolean;
}

interface AuthActions {
	setSession: (session: Session | null) => void;
	setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
	user: null,
	session: null,
	isLoading: true,

	setSession: (session) => set({ session, user: session?.user ?? null }),
	setLoading: (isLoading) => set({ isLoading }),
}));
