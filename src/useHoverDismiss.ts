import { useCallback, useEffect, useRef } from 'react';

// Reuse v5.4's pointer-intent delay separately from the 200ms exit animation.
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
