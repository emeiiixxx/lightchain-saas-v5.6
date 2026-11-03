import { useLayoutEffect, useMemo, useRef } from 'react';

// Fixed event keys, stable identities, latest committed implementations. A
// memoized scene can keep its JSX while handlers still see current dialogs/state.
export function useEventHandlers<T extends Record<string, (...args: any[]) => any>>(handlers: T): T {
  const current = useRef(handlers);
  useLayoutEffect(() => { current.current = handlers; });
  return useMemo(() => Object.fromEntries(Object.keys(handlers).map(key =>
    [key, (...args: unknown[]) => current.current[key](...args)])) as T, []);
}
