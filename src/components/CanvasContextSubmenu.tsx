import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useHoverDismiss } from '../useHoverDismiss';
import { usePresence } from '../usePresence';
import type { CanvasMenuGroup } from './CanvasContextMenu';

type Props = {
  group: CanvasMenuGroup;
  indicator: ReactNode;
  open: boolean;
  parentRef: RefObject<HTMLDivElement | null>;
  onOpen: () => void;
  onClose: () => void;
  onSelect: () => void;
};

export function CanvasContextSubmenu({ group, indicator, open, parentRef, onOpen, onClose, onSelect }: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef(false);
  const id = useId();
  const shown = usePresence(open ? true : null);
  const hover = useHoverDismiss(open, onClose);
  const contains = (target: EventTarget | null) => target instanceof Node && (trigger.current?.contains(target) || panel.current?.contains(target));

  function focusFirst() { panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }); }
  function expand(keyboard = false) {
    hover.cancel();
    if (keyboard && open) { focusFirst(); return; }
    focusOnOpen.current = keyboard;
    onOpen();
  }
  function close(restoreFocus = false) {
    hover.cancel();
    focusOnOpen.current = false;
    onClose();
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    const popup = panel.current;
    if (!shown.value || !popup) return;
    if (!popup.matches(':popover-open')) popup.showPopover();
    let frame = 0;
    const position = () => {
      const anchor = trigger.current, parent = parentRef.current;
      if (!anchor?.isConnected || !parent?.matches(':popover-open')) return;
      const row = anchor.getBoundingClientRect();
      const inset = 8, gap = 4;
      const rightSpace = innerWidth - inset - row.right - gap;
      const leftSpace = row.left - gap - inset;
      const side = rightSpace >= popup.offsetWidth || rightSpace >= leftSpace ? 'right' : 'left';
      const wantedLeft = side === 'right' ? row.right + gap : row.left - popup.offsetWidth - gap;
      const left = Math.max(inset, Math.min(wantedLeft, innerWidth - popup.offsetWidth - inset));
      const top = Math.max(inset, Math.min(row.top - 8, innerHeight - popup.offsetHeight - inset));
      const bridge = side === 'right' ? Math.max(0, left - row.right) : Math.max(0, row.left - left - popup.offsetWidth);
      popup.dataset.side = side;
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
      popup.style.setProperty('--submenu-bridge-width', `${bridge}px`);
      popup.style.setProperty('--submenu-bridge-top', `${row.top - top}px`);
      popup.style.setProperty('--submenu-bridge-height', `${row.height}px`);
      if (open) frame = requestAnimationFrame(position);
    };
    position();
    if (open && focusOnOpen.current) { focusFirst(); focusOnOpen.current = false; }
    return () => {
      cancelAnimationFrame(frame);
      if (popup.matches(':popover-open')) popup.hidePopover();
    };
  }, [shown.value, open, parentRef]);

  return <>
    <button ref={trigger} type="button" role="menuitem" className="lc-select-option canvas-context-subtrigger" data-submenu-trigger
      aria-haspopup="menu" aria-expanded={open} aria-controls={id}
      onPointerEnter={event => { if (event.pointerType !== 'touch') expand(); }}
      onPointerLeave={event => { if (!contains(event.relatedTarget)) hover.schedule(); }}
      onClick={event => expand(event.detail === 0)}
      onKeyDown={event => {
        if (!['ArrowRight', 'Enter', ' '].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); expand(true);
      }}>
      {group.icon}<span className="canvas-context-label">{group.label}</span>{indicator}
    </button>
    {shown.value && <div ref={panel} id={id} popover="manual" role="menu" aria-label={group.label} data-canvas-context-menu data-grouped-menu data-overlay data-node-id={group.nodeId}
      className="lc-select-popup canvas-context-menu canvas-context-submenu" data-phase={shown.phase} inert={shown.phase === 'exit'}
      onContextMenu={event => event.preventDefault()}
      onPointerEnter={hover.cancel}
      onPointerLeave={event => { if (!contains(event.relatedTarget)) hover.schedule(); }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape' || event.key === 'ArrowLeft') { event.preventDefault(); close(true); return; }
        if (event.key === 'Tab') { onSelect(); return; }
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); buttons[next]?.focus({ preventScroll: true }); }
      }}>
      <div className="canvas-context-submenu-content">
        {group.items.map(item => <button key={item.id} type="button" role="menuitem" className="lc-select-option" onClick={() => { hover.cancel(); onSelect(); item.onSelect(); }}>
          {item.icon}<span className="canvas-context-label">{item.label}</span>
        </button>)}
      </div>
    </div>}
  </>;
}
