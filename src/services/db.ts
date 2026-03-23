import * as SQLite from 'expo-sqlite';
import type { Feature, LineString } from 'geojson';
import type { RouteStats, Waypoint } from '../store/routeStore';

export interface SavedRoute {
	id: number;
	name: string;
	waypoints: Waypoint[];
	geometry: Feature<LineString>;
	stats: RouteStats | null;
	createdAt: string;
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
	db.execSync(
		`CREATE TABLE IF NOT EXISTS routes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			waypoints TEXT NOT NULL,
			geometry TEXT NOT NULL,
			stats TEXT,
			created_at TEXT NOT NULL
		);`,
	);
}

export function saveRoute(
	name: string,
	waypoints: Waypoint[],
	geometry: Feature<LineString>,
	stats: RouteStats | null,
): number {
	const db = getDb();
	const result = db.runSync(
		'INSERT INTO routes (name, waypoints, geometry, stats, created_at) VALUES (?, ?, ?, ?, ?)',
		name,
		JSON.stringify(waypoints),
		JSON.stringify(geometry),
		stats ? JSON.stringify(stats) : null,
		new Date().toISOString(),
	);
	return result.lastInsertRowId;
}

export function listRoutes(): SavedRoute[] {
	const db = getDb();
	const rows = db.getAllSync<{
		id: number;
		name: string;
		waypoints: string;
		geometry: string;
		stats: string | null;
		created_at: string;
	}>('SELECT * FROM routes ORDER BY created_at DESC');

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
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
		waypoints: string;
		geometry: string;
		stats: string | null;
		created_at: string;
	}>('SELECT * FROM routes WHERE id = ?', id);
	if (!row) return null;
	return {
		id: row.id,
		name: row.name,
		waypoints: JSON.parse(row.waypoints) as Waypoint[],
		geometry: JSON.parse(row.geometry) as Feature<LineString>,
		stats: row.stats ? (JSON.parse(row.stats) as RouteStats) : null,
		createdAt: row.created_at,
	};
}

export function deleteRoute(id: number): void {
	const db = getDb();
	db.runSync('DELETE FROM routes WHERE id = ?', id);
}
