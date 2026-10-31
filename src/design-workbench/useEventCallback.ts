import { useCallback, useLayoutEffect, useRef } from 'react';

// Stable event props let memoized panels skip camera-only renders. The handler
// still reads the latest committed selection, task records and canvas state.
export function useEventCallback<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
  const current = useRef(callback);
  useLayoutEffect(() => { current.current = callback; });
  return useCallback((...args: Args) => current.current(...args), []);
}
