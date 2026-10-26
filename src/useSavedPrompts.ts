import { useEffect, useRef, useState } from 'react';
import { notify } from './components/Toast';
import type { PromptEntry } from './prompt-types';
import { loadPrompts, persistPrompts, promptStorageError, readLegacyPrompts, type PromptStoreResult } from './prompt-storage';

export function useSavedPrompts() {
  const [entries, setEntries] = useState<PromptEntry[]>(() => {
    try { return readLegacyPrompts(); } catch { return []; }
  });
  const writing = useRef(false);
  const loaded = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const revision = useRef(0);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const requestedRevision = ++revision.current;
      try {
        const saved = await loadPrompts();
        if (active && !writing.current && revision.current === requestedRevision) {
          setEntries(saved); loaded.current = true;
        }
      } catch (error) { if (active) notify(promptStorageError(error), 'error'); }
    };
    void refresh();
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel('lc-v56-flow-prompt-library');
      channel.current.onmessage = () => void refresh();
    }
    return () => { active = false; channel.current?.close(); channel.current = null; };
  }, []);
  const store = async (next: PromptEntry[]): Promise<PromptStoreResult> => {
    if (writing.current) return { ok: false, message: '正在保存，请稍候' };
    // A pending initial load must never allow an empty render to replace existing records.
    if (!loaded.current) {
      try { setEntries(await loadPrompts()); loaded.current = true; }
      catch (error) { return { ok: false, message: promptStorageError(error) }; }
      return { ok: false, message: '提示词正在载入，内容已保留，请再次保存' };
    }
    writing.current = true;
    ++revision.current;
    try {
      await persistPrompts(next);
      setEntries(next);
      channel.current?.postMessage('updated');
      return { ok: true };
    } catch (error) { return { ok: false, message: promptStorageError(error) }; }
    finally { writing.current = false; }
  };
  return { entries, store };
}
