import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { Viewport } from './canvas';

/** Resolve at paste time so panning/zooming never leaves a stale world point. */
export function useCanvasPastePoint(canvas: RefObject<HTMLElement | null>, view: RefObject<Viewport>) {
  const pointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const move = (event: PointerEvent) => { pointer.current = { x: event.clientX, y: event.clientY }; };
    const clear = () => { pointer.current = null; };
    window.addEventListener('pointermove', move, true); window.addEventListener('blur', clear);
    document.addEventListener('pointerleave', clear);
    return () => { window.removeEventListener('pointermove', move, true); window.removeEventListener('blur', clear); document.removeEventListener('pointerleave', clear); };
  }, []);
  return useCallback(() => {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) return undefined;
    const p = pointer.current;
    const inside = p && p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
    const x = inside ? p.x - rect.left : rect.width / 2, y = inside ? p.y - rect.top : rect.height / 2;
    return { x: (x - view.current.x) / view.current.zoom, y: (y - view.current.y) / view.current.zoom };
  }, [canvas, view]);
}
