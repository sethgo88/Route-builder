import * as SQLite from 'expo-sqlite';
import type { Feature, LineString } from 'geojson';
import type { RouteStats, Waypoint } from '../store/routeStore';

export interface SavedRoute {
	id: number;
	name: string;
	color: string;
	waypoints: Waypoint[];
	geometry: Feature<LineString>;
	stats: RouteStats | null;
	createdAt: string;
}

/** Internal shape used by the sync service — includes cloud-sync fields. */
export interface RouteForSync {
	localId: number;
	remoteId: string | null;
	name: string;
	waypoints: Waypoint[];
	geometry: Feature<LineString>;
	stats: RouteStats | null;
	createdAt: string;
	deletedAt: string | null;
}

let _db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
	if (!_db) {
		_db = SQLite.openDatabaseSync('routes.db');
	}
	return _db;
}

export function initDb(): void {
	const db = getDb();

	// Original table (kept for backwards compat — new installs get all columns)
	db.execSync(
		`CREATE TABLE IF NOT EXISTS routes (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			name       TEXT    NOT NULL,
			waypoints  TEXT    NOT NULL,
			geometry   TEXT    NOT NULL,
			stats      TEXT,
			created_at TEXT    NOT NULL
		);`,
	);

	// Idempotent column additions for existing installs
	for (const sql of [
		'ALTER TABLE routes ADD COLUMN remote_id  TEXT',
		'ALTER TABLE routes ADD COLUMN deleted_at TEXT',
		'ALTER TABLE routes ADD COLUMN updated_at TEXT',
		"ALTER TABLE routes ADD COLUMN color TEXT NOT NULL DEFAULT '#3b82f6'",
	]) {
		try {
			db.execSync(sql);
		} catch {
			// Column already exists — safe to ignore
		}
	}
}

export function saveRoute(
	name: string,
	color: string,
	waypoints: Waypoint[],
	geometry: Feature<LineString>,
	stats: RouteStats | null,
): number {
	const db = getDb();
	const now = new Date().toISOString();
	const result = db.runSync(
		'INSERT INTO routes (name, color, waypoints, geometry, stats, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
		name,
		color,
		JSON.stringify(waypoints),
		JSON.stringify(geometry),
		stats ? JSON.stringify(stats) : null,
		now,
		now,
	);
	return result.lastInsertRowId;
}

export function updateRoute(
	id: number,
	name: string,
	color: string,
	waypoints: Waypoint[],
	geometry: Feature<LineString>,
	stats: RouteStats | null,
): void {
	const db = getDb();
	db.runSync(
		'UPDATE routes SET name = ?, color = ?, waypoints = ?, geometry = ?, stats = ?, updated_at = ? WHERE id = ?',
		name,
		color,
		JSON.stringify(waypoints),
		JSON.stringify(geometry),
		stats ? JSON.stringify(stats) : null,
		new Date().toISOString(),
		id,
	);
}

export function listRoutes(): SavedRoute[] {
	const db = getDb();
	const rows = db.getAllSync<{
		id: number;
		name: string;
		color: string;
		waypoints: string;
		geometry: string;
		stats: string | null;
		created_at: string;
	}>('SELECT * FROM routes WHERE deleted_at IS NULL ORDER BY created_at DESC');

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		color: row.color ?? '#3b82f6',
		waypoints: JSON.parse(row.waypoints) as Waypoint[],
		geometry: JSON.parse(row.geometry) as Feature<LineString>,
		stats: row.stats ? (JSON.parse(row.stats) as RouteStats) : null,
		createdAt: row.created_at,
	}));
}

export function getRoute(id: number): SavedRoute | null {
	const db = getDb();
	const row = db.getFirstSync<{
		id: number;
		name: string;
		color: string;
		waypoints: string;
		geometry: string;
		stats: string | null;
		created_at: string;
	}>('SELECT * FROM routes WHERE id = ? AND deleted_at IS NULL', id);
	if (!row) return null;
	return {
		id: row.id,
		name: row.name,
		color: row.color ?? '#3b82f6',
		waypoints: JSON.parse(row.waypoints) as Waypoint[],
		geometry: JSON.parse(row.geometry) as Feature<LineString>,
		stats: row.stats ? (JSON.parse(row.stats) as RouteStats) : null,
		createdAt: row.created_at,
	};
}

/**
 * Soft-delete: sets `deleted_at` so the route is hidden locally.
 * Returns the `remote_id` (if any) so the caller can propagate to Supabase.
 */
export function deleteRoute(id: number): string | null {
	const db = getDb();
	const row = db.getFirstSync<{ remote_id: string | null }>(
		'SELECT remote_id FROM routes WHERE id = ?',
		id,
	);
	db.runSync(
		'UPDATE routes SET deleted_at = ?, updated_at = ? WHERE id = ?',
		new Date().toISOString(),
		new Date().toISOString(),
		id,
	);
	return row?.remote_id ?? null;
}

// ── Sync helpers (used by syncService only) ─────────────────────────────────

/** Return full row data needed for an upsert to Supabase. */
export function getRouteForSync(localId: number): RouteForSync | null {
	const db = getDb();
	const row = db.getFirstSync<{
		id: number;
		remote_id: string | null;
		name: string;
		waypoints: string;
		geometry: string;
		stats: string | null;
		created_at: string;
		deleted_at: string | null;
	}>('SELECT * FROM routes WHERE id = ?', localId);
	if (!row) return null;
	return {
		localId: row.id,
		remoteId: row.remote_id,
		name: row.name,
		waypoints: JSON.parse(row.waypoints) as Waypoint[],
		geometry: JSON.parse(row.geometry) as Feature<LineString>,
		stats: row.stats ? (JSON.parse(row.stats) as RouteStats) : null,
		createdAt: row.created_at,
		deletedAt: row.deleted_at,
	};
}

/** Store the UUID assigned by Supabase after a successful upsert. */
export function markRouteSynced(localId: number, remoteId: string): void {
	const db = getDb();
	db.runSync('UPDATE routes SET remote_id = ? WHERE id = ?', remoteId, localId);
}

/** All remote_ids that already exist locally (for dedup during pull). */
export function listLocalRemoteIds(): string[] {
	const db = getDb();
	const rows = db.getAllSync<{ remote_id: string }>(
		'SELECT remote_id FROM routes WHERE remote_id IS NOT NULL',
	);
	return rows.map((r) => r.remote_id);
}

/**
 * Insert a route downloaded from Supabase.
 * Skips insert if that remote_id is already present.
 */
export function insertRemoteRoute(route: {
	remoteId: string;
	name: string;
	waypoints: Waypoint[];
	geometry: Feature<LineString>;
	stats: RouteStats | null;
	createdAt: string;
}): void {
	const db = getDb();
	const existing = db.getFirstSync<{ id: number }>(
		'SELECT id FROM routes WHERE remote_id = ?',
		route.remoteId,
	);
	if (existing) return; // already synced

	const now = new Date().toISOString();
	db.runSync(
		`INSERT INTO routes
			(name, waypoints, geometry, stats, created_at, updated_at, remote_id)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
		route.name,
		JSON.stringify(route.waypoints),
		JSON.stringify(route.geometry),
		route.stats ? JSON.stringify(route.stats) : null,
		route.createdAt,
		now,
		route.remoteId,
	);
}
