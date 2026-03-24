export type UnitSystem = 'metric' | 'imperial';

const KM_TO_MI = 0.621371;
const M_TO_FT = 3.28084;

export function formatDist(km: number, unitSystem: UnitSystem): string {
	if (unitSystem === 'imperial') {
		const mi = km * KM_TO_MI;
		return `${mi.toFixed(1)} mi`;
	}
	return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`;
}

export function formatEle(m: number, unitSystem: UnitSystem): string {
	if (unitSystem === 'imperial') {
		return `${Math.round(m * M_TO_FT)} ft`;
	}
	return `${Math.round(m)} m`;
}
