import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from '../usePresence';
import { pointerTooltipPosition } from '../tooltip-position';

type Target = { anchor: HTMLElement; label: string; container: HTMLElement; followPointer: boolean; fixedPointer?: { x: number; y: number } };
// Delegated events cover native disabled buttons without adding layout wrappers.
export function TooltipHost() {
  const id = useId();
  const [target, setTarget] = useState<Target | null>(null);
  const shown = usePresence(target);
  const ref = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    let stationaryTimer: number | undefined;
    let stationaryHover: { anchor: HTMLElement; x: number; y: number } | null = null;
    const clearStationary = () => {
      window.clearTimeout(stationaryTimer);
      stationaryTimer = undefined;
      stationaryHover = null;
    };
    const anchorOf = (node: EventTarget | null) => node instanceof Element ? node.closest<HTMLElement>('[data-tooltip]') : null;
    const show = (anchor: HTMLElement | null, event?: PointerEvent) => {
      if (!anchor || anchor.closest('[inert]')) return;
      const label = anchor.dataset.tooltip;
      if (label && event && anchor.dataset.tooltipPosition === 'pointer-stationary') {
        const point = { x: event.clientX, y: event.clientY };
        if (stationaryHover?.anchor === anchor && stationaryHover.x === point.x && stationaryHover.y === point.y) return;
        clearStationary();
        stationaryHover = { anchor, ...point };
        setTarget(null);
        stationaryTimer = window.setTimeout(() => {
          stationaryTimer = undefined;
          if (!anchor.isConnected || !anchor.matches(':hover') || anchor.closest('[inert]') || anchor.dataset.tooltip !== label) return;
          setTarget({ anchor, label, container: anchor.closest('dialog') ?? document.body, followPointer: true, fixedPointer: point });
        }, 500);
        return;
      }
      clearStationary();
      const followPointer = Boolean(event && anchor.dataset.tooltipPosition === 'pointer');
      if (event) pointer.current = { x: event.clientX, y: event.clientY };
      if (label) setTarget(current => current?.anchor === anchor && current.label === label && current.followPointer === followPointer
        ? current : { anchor, label, container: anchor.closest('dialog') ?? document.body, followPointer });
    };
    const hide = () => { clearStationary(); setTarget(null); };
    const over = (e: PointerEvent) => { if (e.pointerType !== 'touch' && !e.buttons) show(anchorOf(e.target), e); };
    const move = (e: PointerEvent) => {
      const anchor = anchorOf(e.target);
      if (e.pointerType !== 'touch' && !e.buttons && anchor?.dataset.tooltipPosition === 'pointer-stationary') {
        show(anchor, e);
        return;
      }
      if (stationaryHover) hide();
      if (e.pointerType !== 'touch' && !e.buttons) pointer.current = { x: e.clientX, y: e.clientY };
    };
    const out = (e: PointerEvent) => { if (anchorOf(e.target) !== anchorOf(e.relatedTarget)) hide(); };
    const focus = (e: FocusEvent) => { const anchor = anchorOf(e.target); if (document.documentElement.dataset.focusNavigation === 'keyboard' && anchor?.matches(':focus-visible')) show(anchor); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    document.addEventListener('pointerover', over, true);
    document.addEventListener('pointerout', out, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('focusin', focus, true);
    document.addEventListener('focusout', hide, true);
    document.addEventListener('keydown', key, true);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('wheel', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      clearStationary();
      document.removeEventListener('pointerover', over, true);
      document.removeEventListener('pointerout', out, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerdown', hide, true);
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
    const { anchor, followPointer, fixedPointer } = shown.value;
    const tip = ref.current;
    // Optional per-trigger width for multiline guidance; other tooltips still hug content.
    const width = Number(anchor.dataset.tooltipWidth);
    tip.style.width = Number.isFinite(width) && width > 0 ? `${width}px` : 'max-content';
    // Top layer avoids clipping by canvas transforms, toolbar overflow and dialogs.
    if (!tip.matches(':popover-open')) tip.showPopover();
    let frame = 0;
    const position = () => {
      if (!anchor.isConnected || anchor.closest('[inert]') || (anchor.closest('dialog') && !anchor.closest('dialog')!.open)) { setTarget(null); return; }
      const a = anchor.getBoundingClientRect();
      const w = window.innerWidth, h = window.innerHeight;
      if (followPointer) {
        tip.dataset.side = 'pointer';
        const { left, top } = pointerTooltipPosition(fixedPointer ?? pointer.current, tip.offsetWidth, tip.offsetHeight, w, h);
        tip.style.left = `${left}px`; tip.style.top = `${top}px`;
        if (target) frame = requestAnimationFrame(position);
        return;
      }
      const preferRight = anchor.dataset.tooltipSide === 'right' || anchor.closest('.canvas-side-toolbar');
      const side = preferRight && w - a.right > tip.offsetWidth + 16 ? 'right' : a.top >= tip.offsetHeight + 12 ? 'top' : 'bottom';
      tip.dataset.side = side;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      const x = side === 'right' ? a.right + 4 : a.left + a.width / 2 - tw / 2;
      const y = side === 'top' ? a.top - th - 4 : side === 'bottom' ? a.bottom + 4 : a.top + a.height / 2 - th / 2;
      const left = Math.max(8, Math.min(x, w - tw - 8));
      const top = Math.max(8, Math.min(y, h - th - 8));
      tip.style.left = `${left}px`; tip.style.top = `${top}px`;
      tip.style.setProperty('--tooltip-arrow-x', `${Math.max(10, Math.min(tw - 10, a.left + a.width / 2 - left))}px`);
      if (target) frame = requestAnimationFrame(position);
    };
    position();
    return () => cancelAnimationFrame(frame);
  }, [shown.value, target]);
  if (!shown.value || (shown.value.fixedPointer && !target)) return null;
  return createPortal(<div ref={ref} id={id} role="tooltip" popover="manual" className="lc-tooltip" data-side="top" data-phase={shown.phase} data-node-id="406:2959">
    <div className="lc-tooltip-bubble">{shown.value.label}</div>
    <img className="lc-tooltip-arrow" src="/assets/tooltip/arrow.svg" alt="" aria-hidden="true" width="8" height="4" />
  </div>, shown.value.container);
}
