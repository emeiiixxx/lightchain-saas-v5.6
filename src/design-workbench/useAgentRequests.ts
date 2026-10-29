import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DemoOutput } from './demo-generation';

export type AgentRequest = {
  id: string;
  text: string;
  title: string;
  images: string[];
  /** Canvas instances captured with the submitted references, never live selection. */
  sourceIds?: string[];
  settings: DemoOutput;
  conversationId: string;
};
export type AgentRequestState = 'thinking' | 'reconnecting' | 'failed';
type PendingRequest = { request: AgentRequest; timer?: ReturnType<typeof setTimeout>; attempt: number };

// Local request acknowledgement, separate from the accepted canvas image task.
// Retrying retains the request ID; cancellation invalidates its pending timer.
const THINKING_DELAY = 2000;
const RECONNECT_DELAY = 3000;
export function useAgentRequests(accept: (request: AgentRequest, current: () => boolean) => boolean | Promise<boolean>) {
  const [states, setStates] = useState<Record<string, AgentRequestState>>({});
  const pending = useRef(new Map<string, PendingRequest>());
  const acceptRef = useRef(accept);
  useLayoutEffect(() => { acceptRef.current = accept; }, [accept]);
  const remove = useCallback((id: string) => {
    const entry = pending.current.get(id);
    if (entry?.timer) clearTimeout(entry.timer);
    pending.current.delete(id);
    setStates(previous => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }, []);
  const attempt = useCallback(function run(id: string) {
    const entry = pending.current.get(id);
    if (!entry) return;
    const attempt = ++entry.attempt;
    if (entry.timer) clearTimeout(entry.timer);
    const reconnect = () => {
      setStates(previous => ({ ...previous, [id]: 'reconnecting' }));
      entry.timer = setTimeout(() => run(id), RECONNECT_DELAY);
    };
    if (!navigator.onLine) { reconnect(); return; }
    setStates(previous => ({ ...previous, [id]: 'thinking' }));
    entry.timer = setTimeout(async () => {
      const current = () => pending.current.get(id) === entry && entry.attempt === attempt;
      if (!current()) return;
      entry.timer = undefined;
      if (!navigator.onLine) { reconnect(); return; }
      try {
        const accepted = await acceptRef.current(entry.request, current);
        if (!current()) return;
        if (accepted) { remove(id); return; }
      } catch { /* Retain the request and its references for explicit retry. */ }
      if (!current()) return;
      setStates(previous => ({ ...previous, [id]: 'failed' }));
    }, THINKING_DELAY);
  }, [remove]);
  const submit = useCallback((request: AgentRequest) => {
    if (pending.current.has(request.id)) return;
    pending.current.set(request.id, { request, attempt: 0 });
    attempt(request.id);
  }, [attempt]);
  useEffect(() => {
    const offline = () => {
      for (const id of pending.current.keys()) attempt(id);
    };
    const online = () => {
      for (const [id, entry] of pending.current) {
        // A reconnect timer identifies network recovery, not a failed request.
        if (entry.timer) attempt(id);
      }
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      for (const entry of pending.current.values()) if (entry.timer) clearTimeout(entry.timer);
      pending.current.clear();
    };
  }, [attempt]);
  return { states, submit, retry: attempt, stop: remove };
}
