import { useEffect, useState } from 'react';
import { MOTION_DURATION } from './motion';

// Retain closing content until the shared exit curve finishes. Reopening cancels
// the pending removal, so rapid menu/dialog interactions remain reversible.
export function usePresence<T>(value: T | null) {
  const [retained, setRetained] = useState<T | null>(value);
  useEffect(() => {
    if (value !== null) { setRetained(value); return; }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setRetained(null), reduced ? 0 : MOTION_DURATION);
    return () => window.clearTimeout(timer);
  }, [value]);
  return { value: value ?? retained, phase: value === null ? 'exit' as const : 'enter' as const };
}
