import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `ms` milliseconds
 * of inactivity. Used to throttle route fetches during waypoint drags.
 */
export function useDebounce<T>(value: T, ms: number): T {
	const [debounced, setDebounced] = useState<T>(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(timer);
	}, [value, ms]);
	return debounced;
}
