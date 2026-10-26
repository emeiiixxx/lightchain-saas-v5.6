import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { messages, type Locale } from '../i18n';
import { downloadFormats, type DownloadFormat } from '../download-image';
import { usePresence } from '../usePresence';
import { Button, Icon } from './ui';
import '../download-format-menu.css';

// Adapted from the v5.4 DownloadFormatMenu: keep the popup in the top layer
// so canvas transforms and the toolbar's overflow cannot clip it.
export function DownloadFormatMenu({ locale, disabled, onSelect, icon, menuGroup }: {
  locale: Locale;
  disabled?: boolean;
  onSelect: (format: DownloadFormat) => void;
  icon?: ReactNode;
  menuGroup?: string;
}) {
  const t = messages[locale];
  const [open, setOpen] = useState(false);
  const shown = usePresence(open ? true : null);
  const anchor = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) anchor.current?.querySelector('button')?.focus();
  }, []);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!menuGroup) return;
    const otherMenu = (event: Event) => {
      const detail = (event as CustomEvent<{ group: string; id: string }>).detail;
      if (detail.group === menuGroup && detail.id !== id) close();
    };
    document.addEventListener('lc-toolbar-menu-open', otherMenu);
    return () => document.removeEventListener('lc-toolbar-menu-open', otherMenu);
  }, [menuGroup, id, close]);
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
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open, close]);
  useLayoutEffect(() => {
    if (!shown.value || !panel.current) return;
    const element = panel.current;
    element.showPopover();
    let frame = 0;
    const position = () => {
      const control = anchor.current;
      if (!control?.isConnected || control.closest('[hidden], [inert]')) { close(); return; }
      const rect = control.getBoundingClientRect();
      const below = rect.bottom + 8;
      const left = `${Math.max(8, Math.min(rect.left, innerWidth - element.offsetWidth - 8))}px`;
      const top = `${Math.max(8, below + element.offsetHeight <= innerHeight - 8 ? below : rect.top - element.offsetHeight - 8)}px`;
      if (element.style.left !== left) element.style.left = left;
      if (element.style.top !== top) element.style.top = top;
      frame = requestAnimationFrame(position);
    };
    position();
    return () => { cancelAnimationFrame(frame); if (element.matches(':popover-open')) element.hidePopover(); };
  }, [shown.value, close]);

  function focusOption(last = false) {
    requestAnimationFrame(() => {
      const items = panel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      items?.[last ? items.length - 1 : 0]?.focus();
    });
  }
  function expand() {
    if (menuGroup) document.dispatchEvent(new CustomEvent('lc-toolbar-menu-open', { detail: { group: menuGroup, id } }));
    setOpen(true);
  }

  return <div ref={anchor} className="download-format-control" data-overlay>
    <Button className="canvas-icon-button" aria-label={t.download} title={t.download} disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-controls={id}
      onClick={event => { if (open) close(); else { expand(); if (event.detail === 0) focusOption(); } }}
      onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); expand(); focusOption(event.key === 'ArrowUp');
      }}>{icon ?? <Icon name="downloadIcon" size={20} />}</Button>
    {shown.value && <div ref={panel} id={id} popover="manual" role="menu" aria-label={t.download} className="download-format-menu" data-overlay data-phase={shown.phase} inert={shown.phase === 'exit'}
      onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }}>
      {downloadFormats.map(format => <Button role="menuitem" key={format} onClick={() => { close(true); onSelect(format); }}>{format}</Button>)}
    </div>}
  </div>;
}
