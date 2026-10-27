import { useEffect, useSyncExternalStore } from 'react';
import type { CanvasImage } from './canvas';
import { isProjectCoverCandidate } from './canvas-project-cover';

const STORAGE_KEY = 'lc-v56-project-cover-used';
const CHANGE_EVENT = 'lc-v56-project-cover-used-change';
let usedInSession = false;

function hasUsedProjectCover(): boolean {
  if (usedInSession) return true;
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; }
  catch { return false; }
}

function rememberProjectCoverUse() {
  if (usedInSession) return;
  usedInSession = true;
  try { localStorage.setItem(STORAGE_KEY, 'true'); }
  catch { /* Keep the current session consistent when storage is unavailable. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue === 'true') {
      usedInSession = true;
      onChange();
    }
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

// Record the committed result, including a cover set in an already-open demo.
// This discovery state stays outside the canvas undo/redo history.
export function useRememberProjectCoverUse(images: readonly CanvasImage[]) {
  const hasManualCover = images.some(image => image.projectCover && isProjectCoverCandidate(image));
  useEffect(() => { if (hasManualCover) rememberProjectCoverUse(); }, [hasManualCover]);
}

export function useShowProjectCoverNew(): boolean {
  return !useSyncExternalStore(subscribe, hasUsedProjectCover, () => false);
}
