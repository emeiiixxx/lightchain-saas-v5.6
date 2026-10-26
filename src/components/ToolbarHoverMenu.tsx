import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useHoverDismiss } from '../useHoverDismiss';
import { usePresence } from '../usePresence';
import { Button } from './ui';
import '../toolbar-hover-menu.css';

type Props = {
  label: string;
  icon: ReactNode;
  chevron: ReactNode;
  group: string;
  nodeId: string;
  items: { label: string; icon: ReactNode; onSelect: () => void }[];
};

// Beta MenuTrigger + DropdownMenuContent. The popover escapes canvas transforms
// and toolbar overflow; v5.4's hover delay bridges the trigger and menu.
export function ToolbarHoverMenu({ label, icon, chevron, group, nodeId, items }: Props) {
  const [open, setOpen] = useState(false);
  const shown = usePresence(open ? true : null);
  const anchor = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) anchor.current?.querySelector('button')?.focus();
  }, []);
  const hover = useHoverDismiss(open, close);
  const contains = (target: EventTarget | null) => target instanceof Node && (anchor.current?.contains(target) || panel.current?.contains(target));

  useEffect(() => {
    const otherMenu = (event: Event) => {
      const detail = (event as CustomEvent<{ group: string; id: string }>).detail;
      if (detail.group === group && detail.id !== id) close();
    };
    document.addEventListener('lc-toolbar-menu-open', otherMenu);
    return () => document.removeEventListener('lc-toolbar-menu-open', otherMenu);
  }, [group, id, close]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent | FocusEvent) => {
      const target = event.target as Node | null;
      if (!anchor.current?.contains(target) && !panel.current?.contains(target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); close(true);
    };
    const blur = () => close();
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', blur);
    };
  }, [open, close]);
  useLayoutEffect(() => {
    if (!shown.value || !panel.current) return;
    const popup = panel.current;
    popup.showPopover();
    let frame = 0;
    const position = () => {
      const control = anchor.current;
      if (!control?.isConnected || control.closest('[hidden], [inert]')) { close(); return; }
      const rect = control.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) { close(); return; }
      const below = rect.bottom + 8;
      const side = below + popup.offsetHeight <= innerHeight - 8 ? 'bottom' : 'top';
      popup.dataset.side = side;
      popup.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - popup.offsetWidth - 8))}px`;
      popup.style.top = `${Math.max(8, side === 'bottom' ? below : rect.top - popup.offsetHeight - 8)}px`;
      frame = requestAnimationFrame(position);
    };
    position();
    return () => { cancelAnimationFrame(frame); if (popup.matches(':popover-open')) popup.hidePopover(); };
  }, [shown.value, close]);

  function expand(focus?: 'first' | 'last') {
    hover.cancel();
    document.dispatchEvent(new CustomEvent('lc-toolbar-menu-open', { detail: { group, id } }));
    setOpen(true);
    if (focus) requestAnimationFrame(() => {
      const options = panel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      options?.[focus === 'last' ? options.length - 1 : 0]?.focus();
    });
  }

  return <div ref={anchor} className="toolbar-hover-control" data-overlay>
    <Button className="toolbar-hover-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={id}
      onPointerEnter={event => { if (event.pointerType !== 'touch') expand(); }}
      onPointerLeave={event => { if (!contains(event.relatedTarget)) hover.schedule(); }}
      onClick={event => expand(event.detail === 0 ? 'first' : undefined)}
      onKeyDown={event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault(); event.stopPropagation(); expand(event.key === 'ArrowUp' ? 'last' : 'first');
      }}>
      {icon}<span>{label}</span>{chevron}
    </Button>
    {shown.value && <div ref={panel} id={id} popover="manual" role="menu" aria-label={label} className="toolbar-hover-menu" data-node-id={nodeId} data-overlay data-phase={shown.phase} inert={shown.phase === 'exit'}
      onPointerEnter={hover.cancel}
      onPointerLeave={event => { if (!contains(event.relatedTarget)) hover.schedule(); }}
      onKeyDown={event => {
        if (event.key === 'Tab') { close(true); return; }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
        const index = options.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options[next]?.focus();
      }}>
      {items.map(item => <Button key={item.label} role="menuitem" tabIndex={-1} onClick={() => { close(true); item.onSelect(); }}>{item.icon}<span>{item.label}</span></Button>)}
    </div>}
  </div>;
}
