import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from '../usePresence';

type Target = { anchor: HTMLElement; label: string; container: HTMLElement };
const shouldShowTooltip = (anchor: HTMLElement) => {
  // innerText excludes labels hidden by responsive styles, keeping icon-only
  // buttons discoverable while visible button labels do not repeat in tooltips.
  if (anchor.matches('button') && anchor.innerText.trim()) return false;
  return !anchor.hasAttribute('data-tooltip-truncated-only')
    || anchor.scrollHeight > anchor.clientHeight + 1 || anchor.scrollWidth > anchor.clientWidth + 1;
};
// Delegated events cover native disabled buttons without adding layout wrappers.
export function TooltipHost() {
  const id = useId();
  const [target, setTarget] = useState<Target | null>(null);
  const shown = usePresence(target);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let keyboardNavigation = false;
    let hoveredToolbar: HTMLElement | null = null;
    const anchorOf = (node: EventTarget | null) => node instanceof Element ? node.closest<HTMLElement>('[data-tooltip]') : null;
    const withinToolbar = (toolbar: HTMLElement, e: PointerEvent) => {
      const rect = toolbar.getBoundingClientRect();
      return e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    };
    const show = (anchor: HTMLElement | null, fromPointer = false) => {
      if (!anchor || anchor.closest('[inert]')) return;
      if (!shouldShowTooltip(anchor)) { hoveredToolbar = null; setTarget(null); return; }
      const label = anchor.dataset.tooltip;
      if (label) {
        hoveredToolbar = fromPointer ? anchor.closest('.element-toolbar') : null;
        setTarget(current => current?.anchor === anchor && current.label === label ? current : { anchor, label, container: anchor.closest('dialog') ?? document.body });
      }
    };
    const hide = () => { hoveredToolbar = null; setTarget(null); };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.buttons) return;
      const anchor = anchorOf(e.target);
      if (anchor) show(anchor, true);
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
    const move = (e: PointerEvent) => { if (hoveredToolbar && !withinToolbar(hoveredToolbar, e)) hide(); };
    const focus = (e: FocusEvent) => { const anchor = anchorOf(e.target); if (keyboardNavigation && anchor?.matches(':focus-visible')) show(anchor); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Tab' || e.key.startsWith('Arrow')) keyboardNavigation = true; if (e.key === 'Escape') hide(); };
    const pointerDown = () => { keyboardNavigation = false; hide(); };
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
    const { anchor } = shown.value;
    const tip = ref.current;
    // Top layer avoids clipping by canvas transforms, toolbar overflow and dialogs.
    if (!tip.matches(':popover-open')) tip.showPopover();
    let frame = 0;
    const position = () => {
      if (!anchor.isConnected || !shouldShowTooltip(anchor) || anchor.closest('[inert]') || (anchor.closest('dialog') && !anchor.closest('dialog')!.open)) { setTarget(null); return; }
      const a = anchor.getBoundingClientRect();
      const w = window.innerWidth, h = window.innerHeight;
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
  if (!shown.value) return null;
  return createPortal(<div ref={ref} id={id} role="tooltip" popover="manual" className="lc-tooltip" data-side="top" data-phase={shown.phase} data-node-id="406:2959">
    <div className="lc-tooltip-bubble">{shown.value.label}</div>
    <span className="lc-tooltip-arrow" aria-hidden="true" />
  </div>, shown.value.container);
}
