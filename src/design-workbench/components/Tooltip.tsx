import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from '../usePresence';
import type { Bounds } from '../canvas-selection';
import { pointerTooltipPosition } from '../../tooltip-position';

type CanvasTooltip = { anchor: HTMLCanvasElement; label: string; bounds: Bounds; pointer: { x: number; y: number } };
type Target = { anchor: HTMLElement; label: string; container: HTMLElement; bounds?: Bounds; followPointer: boolean; fixedPointer?: { x: number; y: number } };
const canvasTooltipEvent = 'lc-canvas-tooltip';
// Canvas-painted labels share this host without adding pointer-blocking overlays.
export function showCanvasTooltip(detail: CanvasTooltip | null) {
  document.dispatchEvent(new CustomEvent(canvasTooltipEvent, { detail }));
}
const shouldShowTooltip = (anchor: HTMLElement) => {
  // innerText excludes labels hidden by responsive styles, keeping icon-only
  // buttons discoverable while visible button labels do not repeat in tooltips.
  if (anchor.matches('button') && anchor.innerText.trim() && anchor.dataset.tooltipPosition !== 'pointer-stationary') return false;
  return !anchor.hasAttribute('data-tooltip-truncated-only')
    || anchor.scrollHeight > anchor.clientHeight + 1 || anchor.scrollWidth > anchor.clientWidth + 1;
};
// Delegated events cover native disabled buttons without adding layout wrappers.
export function TooltipHost() {
  const id = useId();
  const [target, setTarget] = useState<Target | null>(null);
  const shown = usePresence(target);
  const ref = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    let keyboardNavigation = false;
    let hoveredToolbar: HTMLElement | null = null;
    let stationaryTimer: number | undefined;
    let stationaryHover: { anchor: HTMLElement; x: number; y: number } | null = null;
    const clearStationary = () => {
      window.clearTimeout(stationaryTimer);
      stationaryTimer = undefined;
      stationaryHover = null;
    };
    const anchorOf = (node: EventTarget | null) => node instanceof Element ? node.closest<HTMLElement>('[data-tooltip]') : null;
    const withinToolbar = (toolbar: HTMLElement, e: PointerEvent) => {
      const rect = toolbar.getBoundingClientRect();
      return e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    };
    const show = (anchor: HTMLElement | null, event?: PointerEvent) => {
      if (!anchor || anchor.closest('[inert]')) return;
      if (!shouldShowTooltip(anchor)) { clearStationary(); hoveredToolbar = null; setTarget(null); return; }
      const label = anchor.dataset.tooltip;
      if (label && event && anchor.dataset.tooltipPosition === 'pointer-stationary') {
        const point = { x: event.clientX, y: event.clientY };
        if (stationaryHover?.anchor === anchor && stationaryHover.x === point.x && stationaryHover.y === point.y) return;
        clearStationary();
        stationaryHover = { anchor, ...point };
        hoveredToolbar = null;
        setTarget(null);
        stationaryTimer = window.setTimeout(() => {
          stationaryTimer = undefined;
          if (!anchor.isConnected || !anchor.matches(':hover') || anchor.closest('[inert]') || anchor.dataset.tooltip !== label) return;
          setTarget({ anchor, label, container: anchor.closest('dialog') ?? document.body, followPointer: true, fixedPointer: point });
        }, 500);
        return;
      }
      clearStationary();
      if (label) {
        hoveredToolbar = event ? anchor.closest('.element-toolbar') : null;
        const followPointer = Boolean(event && anchor.dataset.tooltipPosition === 'pointer');
        if (event) pointer.current = { x: event.clientX, y: event.clientY };
        setTarget(current => current?.anchor === anchor && current.label === label && current.followPointer === followPointer
          ? current : { anchor, label, container: anchor.closest('dialog') ?? document.body, followPointer });
      }
    };
    const hide = () => { clearStationary(); hoveredToolbar = null; setTarget(null); };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.buttons) return;
      const anchor = anchorOf(e.target);
      if (anchor) show(anchor, e);
      else if (hoveredToolbar && e.target instanceof Element && e.target.closest('.element-toolbar') === hoveredToolbar && e.target.closest('button')) hide();
    };
    const out = (e: PointerEvent) => {
      const from = anchorOf(e.target);
      const to = anchorOf(e.relatedTarget);
      if (!from || from === to) return;
      // Keep one tooltip mounted while the pointer crosses the toolbar's button gaps.
      const toolbar = from.closest<HTMLElement>('.element-toolbar');
      if (toolbar && withinToolbar(toolbar, e)) return;
      hide();
    };
    const move = (e: PointerEvent) => {
      const anchor = anchorOf(e.target);
      if (e.pointerType !== 'touch' && !e.buttons && anchor?.dataset.tooltipPosition === 'pointer-stationary') {
        show(anchor, e);
        return;
      }
      if (stationaryHover) hide();
      if (e.pointerType !== 'touch' && !e.buttons) pointer.current = { x: e.clientX, y: e.clientY };
      if (hoveredToolbar && !withinToolbar(hoveredToolbar, e)) hide();
    };
    const focus = (e: FocusEvent) => { const anchor = anchorOf(e.target); if (keyboardNavigation && anchor?.matches(':focus-visible')) show(anchor); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Tab' || e.key.startsWith('Arrow')) keyboardNavigation = true; if (e.key === 'Escape') hide(); };
    const pointerDown = () => { keyboardNavigation = false; hide(); };
    const canvasTooltip = (event: Event) => {
      const detail = (event as CustomEvent<CanvasTooltip | null>).detail;
      if (!detail) { setTarget(current => current?.bounds ? null : current); return; }
      clearStationary();
      hoveredToolbar = null;
      pointer.current = detail.pointer;
      setTarget(current => current?.anchor === detail.anchor && current.label === detail.label && current.bounds === detail.bounds && current.followPointer
        ? current : { anchor: detail.anchor, label: detail.label, bounds: detail.bounds, container: document.body, followPointer: true });
    };
    document.addEventListener(canvasTooltipEvent, canvasTooltip);
    document.addEventListener('pointerover', over, true);
    document.addEventListener('pointerout', out, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('focusin', focus, true);
    document.addEventListener('focusout', hide, true);
    document.addEventListener('keydown', key, true);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('wheel', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      clearStationary();
      document.removeEventListener(canvasTooltipEvent, canvasTooltip);
      document.removeEventListener('pointerover', over, true);
      document.removeEventListener('pointerout', out, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('focusin', focus, true);
      document.removeEventListener('focusout', hide, true);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('scroll', hide, true);
      document.removeEventListener('wheel', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);
  useEffect(() => {
    if (!target) return;
    const { anchor } = target;
    const previous = anchor.getAttribute('aria-describedby');
    anchor.setAttribute('aria-describedby', [previous, id].filter(Boolean).join(' '));
    return () => { if (previous) anchor.setAttribute('aria-describedby', previous); else anchor.removeAttribute('aria-describedby'); };
  }, [target, id]);
  useLayoutEffect(() => {
    if (!shown.value || !ref.current) return;
    const { anchor, bounds, followPointer, fixedPointer } = shown.value;
    const tip = ref.current;
    // Top layer avoids clipping by canvas transforms, toolbar overflow and dialogs.
    if (!tip.matches(':popover-open')) tip.showPopover();
    let frame = 0;
    const position = () => {
      if (!anchor.isConnected || !shouldShowTooltip(anchor) || anchor.closest('[inert]') || (anchor.closest('dialog') && !anchor.closest('dialog')!.open)) { setTarget(null); return; }
      const anchorRect = anchor.getBoundingClientRect();
      const a = bounds ? new DOMRect(anchorRect.left + bounds.x, anchorRect.top + bounds.y, bounds.width, bounds.height) : anchorRect;
      const w = window.innerWidth, h = window.innerHeight;
      if (followPointer) {
        if (tip.dataset.side !== 'pointer') tip.dataset.side = 'pointer';
        const { left, top } = pointerTooltipPosition(fixedPointer ?? pointer.current, tip.offsetWidth, tip.offsetHeight, w, h);
        const nextLeft = `${left}px`, nextTop = `${top}px`;
        if (tip.style.left !== nextLeft) tip.style.left = nextLeft;
        if (tip.style.top !== nextTop) tip.style.top = nextTop;
        if (target) frame = requestAnimationFrame(position);
        return;
      }
      const side = anchor.closest('.canvas-side-toolbar, .left-tools') && w - a.right > tip.offsetWidth + 16 ? 'right' : a.top >= tip.offsetHeight + 12 ? 'top' : 'bottom';
      if (tip.dataset.side !== side) tip.dataset.side = side;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      const x = side === 'right' ? a.right + 4 : a.left + a.width / 2 - tw / 2;
      const y = side === 'top' ? a.top - th - 4 : side === 'bottom' ? a.bottom + 4 : a.top + a.height / 2 - th / 2;
      const left = Math.max(8, Math.min(x, w - tw - 8));
      const top = Math.max(8, Math.min(y, h - th - 8));
      // A stationary pointer must not cause style invalidation on every frame.
      const nextLeft = `${left}px`, nextTop = `${top}px`;
      const arrowX = `${Math.max(10, Math.min(tw - 10, a.left + a.width / 2 - left))}px`;
      if (tip.style.left !== nextLeft) tip.style.left = nextLeft;
      if (tip.style.top !== nextTop) tip.style.top = nextTop;
      if (tip.style.getPropertyValue('--tooltip-arrow-x') !== arrowX) tip.style.setProperty('--tooltip-arrow-x', arrowX);
      if (target) frame = requestAnimationFrame(position);
    };
    position();
    return () => cancelAnimationFrame(frame);
  }, [shown.value, target]);
  // Task thumbnails dismiss immediately on movement; canvas labels retain their existing follow behavior.
  if (!shown.value || (shown.value.fixedPointer && !target)) return null;
  return createPortal(<div ref={ref} id={id} role="tooltip" popover="manual" className="lc-tooltip" data-side="top" data-phase={shown.phase} data-node-id="406:2959">
    <div className="lc-tooltip-bubble">{shown.value.label}</div>
    <span className="lc-tooltip-arrow" aria-hidden="true" />
  </div>, shown.value.container);
}
