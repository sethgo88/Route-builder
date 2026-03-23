/**
 * Cloud sync — local-first, fire-and-forget.
 *
 * Writes always go to SQLite first. Supabase calls happen in the background;
 * failures are logged in dev but never surface to the user.
 */
import type { Feature, LineString } from 'geojson';
import type { RouteStats, Waypoint } from '../store/routeStore';
import {
	getRouteForSync,
	insertRemoteRoute,
	listLocalRemoteIds,
	markRouteSynced,
} from './db';
import { supabase, type SupabaseRoute } from './supabase';

/** Push a single local route to Supabase (upsert). Silent on failure. */
export async function pushRoute(localId: number): Promise<void> {
	try {
		const row = getRouteForSync(localId);
		if (!row) return;

		const { data: userData } = await supabase.auth.getUser();
		if (!userData.user) return; // not signed in — skip silently

		const payload = {
			...(row.remoteId ? { id: row.remoteId } : {}),
			user_id: userData.user.id,
			name: row.name,
			waypoints: row.waypoints,
			geometry: row.geometry,
			stats: row.stats,
			created_at: row.createdAt,
			deleted_at: row.deletedAt ?? null,
		};

		const { data, error } = await supabase
			.from('routes')
			.upsert(payload, { onConflict: 'id' })
			.select('id')
			.single();

		if (error) {
			if (__DEV__) console.warn('[sync] pushRoute failed:', error.message);
			return;
		}

		if (data?.id && data.id !== row.remoteId) {
			markRouteSynced(localId, data.id as string);
		}
	} catch (err) {
		if (__DEV__) console.warn('[sync] pushRoute exception:', err);
	}
}

/** Soft-delete a route in Supabase. Silent on failure. */
export async function deleteRouteInCloud(remoteId: string): Promise<void> {
	try {
		const { error } = await supabase
			.from('routes')
			.update({ deleted_at: new Date().toISOString() })
			.eq('id', remoteId);

		if (error && __DEV__) {
			console.warn('[sync] deleteRouteInCloud failed:', error.message);
		}
	} catch (err) {
		if (__DEV__) console.warn('[sync] deleteRouteInCloud exception:', err);
	}
}

/**
 * Download routes from Supabase that are missing locally and insert them.
 * Called once after a successful sign-in.
 */
export async function pullMissingRoutes(): Promise<void> {
	try {
		const { data: userData } = await supabase.auth.getUser();
		if (!userData.user) return;

		// Fetch all non-deleted remote routes for this user
		const { data: remoteRoutes, error } = await supabase
			.from('routes')
			.select('*')
			.is('deleted_at', null)
			.returns<SupabaseRoute[]>();

		if (error) {
			if (__DEV__) console.warn('[sync] pullMissingRoutes failed:', error.message);
			return;
		}
		if (!remoteRoutes?.length) return;

		const localRemoteIds = new Set(listLocalRemoteIds());

		for (const remote of remoteRoutes) {
			if (localRemoteIds.has(remote.id)) continue; // already have it

			insertRemoteRoute({
				remoteId: remote.id,
				name: remote.name,
				waypoints: remote.waypoints as Waypoint[],
				geometry: remote.geometry as Feature<LineString>,
				stats: remote.stats as RouteStats | null,
				createdAt: remote.created_at,
			});
		}
	} catch (err) {
		if (__DEV__) console.warn('[sync] pullMissingRoutes exception:', err);
	}
}
