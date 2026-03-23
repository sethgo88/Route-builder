import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { listRoutes } from '../services/db';

/**
 * Fetches all saved routes from the local SQLite database.
 * Automatically refetches when the app returns to the foreground.
 */
export function useRoutes() {
	const queryClient = useQueryClient();

	useEffect(() => {
		const sub = AppState.addEventListener('change', (state) => {
			if (state === 'active') {
				queryClient.invalidateQueries({ queryKey: ['savedRoutes'] });
			}
		});
		return () => sub.remove();
	}, [queryClient]);

	return useQuery({
		queryKey: ['savedRoutes'],
		queryFn: listRoutes,
	});
}
