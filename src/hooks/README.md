# hooks/useRouting.ts

A single custom hook that bridges the Zustand store and the GraphHopper routing service. It is the only place in the app where waypoint changes cause API calls to happen.

---

## Responsibility

`useRouting` watches the store's `waypoints` array and `isSnapping` flag. Whenever either changes and there are 2 or more waypoints, it fires a (debounced) call to `fetchRoute` and writes the result back into the store.

```ts
export function useRouting(): void
```

It returns nothing — it is a pure side-effect hook, called once at the top of `RouteMap`.

---

## Debouncing

```ts
const DEBOUNCE_MS = 400;

const timer = setTimeout(async () => { ... }, DEBOUNCE_MS);
return () => clearTimeout(timer);
```

When a user drags a waypoint, `moveWaypoint` fires on every `onDrag` event — potentially dozens of times per second. Without debouncing, every pixel of movement would trigger a GraphHopper API call. The 400 ms debounce means only the *final* position after the user stops dragging results in a network request.

The cleanup function (`return () => clearTimeout(timer)`) is how React's `useEffect` cancels in-flight timers. If `waypoints` changes again before 400 ms elapses (the user is still dragging), the previous timer is cancelled and a fresh one starts.

---

## The `stateRef` pattern

```ts
const stateRef = useRef({ waypoints, isSnapping });
stateRef.current = { waypoints, isSnapping };
```

This solves a classic React closure problem. The `setTimeout` callback captures the values of `waypoints` and `isSnapping` at the time the effect ran — if those values change before the timer fires, the callback would call the API with stale data.

By storing the current values in a `ref` and updating the ref on every render, the timer callback always reads `stateRef.current` and therefore always has the latest values, regardless of when it fires.

---

## Why not trigger routing inside the store?

Zustand stores run outside React's rendering lifecycle. Putting `setTimeout` and `fetch` calls inside store action creators is possible but has several downsides:

- The debounce timer has no natural cleanup mechanism (no `useEffect` return value to cancel it)
- You lose access to React's stale-closure protection patterns (refs, the `useEffect` dependency array)
- Testing becomes harder because you can't mock `useEffect` when it doesn't exist

A custom hook keeps async side-effects in React's world, where they belong.

---

## Clearing the route

```ts
if (waypoints.length < 2) {
  setRoute(null);
  setElevationData([]);
  setRouteStats(null);
  return;
}
```

When the user removes waypoints down to fewer than 2, there is no route to display. The hook clears route data immediately — no debounce needed here because the user took an explicit action (tap to remove) rather than a continuous gesture (drag).

---

## Error handling

Errors from `fetchRoute` are caught and shown as a native `Alert`. The `finally` block always calls `setIsLoading(false)` so the spinner never gets stuck, even if the API call throws.
