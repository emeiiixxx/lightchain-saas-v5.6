import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { createQuickEditDraft, type QuickEditDraft } from './components/QuickEditComposer';
import { readDemoState, restoreDemoUrls, writeDemoState } from './demo-storage';
type Drafts = Record<string, QuickEditDraft>;

export function useInputMemory(activeKey: string | null) {
  const [drafts, setDrafts] = useState<Drafts>({});
  const current = useRef<Drafts>({});
  const dirty = useRef(false);
  const ready = useRef(false);
  const flush = useCallback(() => {
    if (ready.current && dirty.current && writeDemoState('input-memory', current.current)) dirty.current = false;
  }, []);
  useEffect(() => {
    let active = true;
    void restoreDemoUrls(readDemoState<Drafts>('input-memory', {})).then(saved => {
      if (!active) return;
      current.current = { ...saved, ...current.current }; setDrafts(current.current); ready.current = true; flush();
    }).catch(() => { if (active) { ready.current = true; flush(); } });
    const leave = () => flush();
    window.addEventListener('beforeunload', leave);
    window.addEventListener('pagehide', leave);
    window.addEventListener('online', leave);
    window.addEventListener('lc-v56-design:leave-project', leave);
    return () => { flush(); active = false; window.removeEventListener('beforeunload', leave); window.removeEventListener('pagehide', leave); window.removeEventListener('online', leave); window.removeEventListener('lc-v56-design:leave-project', leave); };
  }, [flush]);
  const previousKey = useRef(activeKey);
  useEffect(() => {
    if (previousKey.current && previousKey.current !== activeKey) flush();
    previousKey.current = activeKey;
  }, [activeKey, flush]);
  const update = useCallback((key: string, value: SetStateAction<QuickEditDraft>) => {
    const previous = current.current[key] ?? createQuickEditDraft();
    const next = typeof value === 'function' ? value(previous) : value;
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    current.current = { ...current.current, [key]: next }; dirty.current = true; setDrafts(current.current); flush();
  }, [flush]);
  return { drafts, update, flush };
}
