import { useCallback, useEffect, useRef } from 'react';

// Keep a menu alive while crossing its border or the bridge to a child menu.
// This is pointer intent delay, not the 200ms visual exit duration.
export function useHoverDismiss(open: boolean, onClose: () => void) {
  const latest = useRef({ open, onClose });
  latest.current = { open, onClose };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const schedule = useCallback(() => {
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      if (latest.current.open) latest.current.onClose();
    }, 120);
  }, [cancel]);
  useEffect(() => { if (!open) cancel(); return cancel; }, [open, cancel]);
  return { cancel, schedule };
}
