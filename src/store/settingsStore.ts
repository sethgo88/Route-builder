import { create } from 'zustand';
import { getSetting, setSetting } from '../services/db';
import { pushSetting } from '../services/syncService';
import type { UnitSystem } from '../utils/units';

interface SettingsState {
	unitSystem: UnitSystem;
	/** Walking speed sent to Valhalla (km/h). Default 4.0 aligns with Naismith's Rule. */
	walkingSpeed: number;
}

interface SettingsActions {
	setUnitSystem: (value: UnitSystem) => void;
	setWalkingSpeed: (value: number) => void;
	/** Load persisted settings from SQLite. Call once on app init. */
	loadSettings: () => void;
}

export const useSettingsStore = create<SettingsState & SettingsActions>(
	(set) => ({
		unitSystem: 'metric',
		walkingSpeed: 4.0,

		loadSettings: () => {
			const stored = getSetting('unit_system');
			if (stored === 'imperial') set({ unitSystem: 'imperial' });
			const storedSpeed = getSetting('walking_speed');
			if (storedSpeed !== null) {
				const parsed = Number(storedSpeed);
				if (!Number.isNaN(parsed)) set({ walkingSpeed: parsed });
			}
		},

		setUnitSystem: (value) => {
			set({ unitSystem: value });
			setSetting('unit_system', value);
			pushSetting('unit_system', value).catch(() => {});
		},

		setWalkingSpeed: (value) => {
			set({ walkingSpeed: value });
			setSetting('walking_speed', String(value));
		},
	}),
);
