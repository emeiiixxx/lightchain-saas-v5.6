import { useEffect, useRef, useState } from 'react';
import type { Notify } from './notification';
import type { PromptEntry } from './components/PromptLibrary';
import { loadPrompts, persistPrompts, promptStorageError, readLegacyPrompts, type PromptStoreResult } from './prompt-storage';

export function useSavedPrompts(onNotify: Notify) {
  const [entries, setEntries] = useState<PromptEntry[]>(() => {
    try { return readLegacyPrompts(); } catch { return []; }
  });
  const writing = useRef(false);
  const loaded = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const notify = useRef(onNotify); notify.current = onNotify;
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try { const saved = await loadPrompts(); if (active && !writing.current) { setEntries(saved); loaded.current = true; } }
      catch (error) { if (active) notify.current(promptStorageError(error), 'error'); }
    };
    void refresh();
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel('lc-v56-design-prompts');
      channel.current.onmessage = () => void refresh();
    }
    return () => { active = false; channel.current?.close(); channel.current = null; };
  }, []);
  const store = async (next: PromptEntry[]): Promise<PromptStoreResult> => {
    if (writing.current) return { ok: false, message: '正在保存，请稍候' };
    // Never let an empty initial render overwrite saved entries while the database is loading.
    if (!loaded.current) {
      try { setEntries(await loadPrompts()); loaded.current = true; }
      catch (error) { return { ok: false, message: promptStorageError(error) }; }
      return { ok: false, message: '提示词储存失败，内容已保留，请重试' };
    }
    writing.current = true;
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
