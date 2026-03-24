import { create } from 'zustand';
import { getSetting, setSetting } from '../services/db';
import { pushSetting } from '../services/syncService';
import type { UnitSystem } from '../utils/units';

interface SettingsState {
	unitSystem: UnitSystem;
}

interface SettingsActions {
	setUnitSystem: (value: UnitSystem) => void;
	/** Load persisted settings from SQLite. Call once on app init. */
	loadSettings: () => void;
}

export const useSettingsStore = create<SettingsState & SettingsActions>(
	(set) => ({
		unitSystem: 'metric',

		loadSettings: () => {
			const stored = getSetting('unit_system');
			if (stored === 'imperial') set({ unitSystem: 'imperial' });
		},

		setUnitSystem: (value) => {
			set({ unitSystem: value });
			setSetting('unit_system', value);
			pushSetting('unit_system', value).catch(() => {});
		},
	}),
);
