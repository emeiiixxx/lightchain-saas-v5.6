import { useId, useLayoutEffect, useRef } from 'react';
import { useLocale } from '../LocaleContext';
import { usePresence } from '../usePresence';
import { downloadFormats, type DownloadFormat } from '../download-image';
import { Button, Icon } from './ui';

export function DownloadFormatOptions({ onSelect }: { onSelect: (format: DownloadFormat) => void }) {
  return <>{downloadFormats.map(format => <Button role="menuitem" key={format} onClick={() => onSelect(format)}>{format}</Button>)}</>;
}

export function DownloadFormatMenu({ open, disabled, onToggle, onClose, onSelect, withLabel = true }: {
  withLabel?: boolean;
  open: boolean; disabled?: boolean; onToggle: () => void; onClose: () => void; onSelect: (format: DownloadFormat) => void;
}) {
  const { t } = useLocale();
  const anchor = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const shown = usePresence(open ? true : null);
  useLayoutEffect(() => {
    if (!shown.value || !panel.current) return;
    const element = panel.current; element.showPopover();
    let frame = 0;
    const position = () => {
      const rect = anchor.current?.getBoundingClientRect(); if (!rect) return;
      const below = rect.bottom + 8;
      const left = `${Math.max(8, Math.min(rect.left, innerWidth - element.offsetWidth - 8))}px`;
      const top = `${Math.max(8, below + element.offsetHeight <= innerHeight - 8 ? below : rect.top - element.offsetHeight - 8)}px`;
      if (element.style.left !== left) element.style.left = left;
      if (element.style.top !== top) element.style.top = top;
      frame = requestAnimationFrame(position);
    };
    position();
    return () => { cancelAnimationFrame(frame); if (element.matches(':popover-open')) element.hidePopover(); };
  }, [shown.value]);
  return <div ref={anchor} className="element-menu-anchor task-download-control" data-workbench-menu>
    <Button size="s" className={withLabel ? undefined : "workbench-tool element-menu-trigger"} aria-label={t('下载')} title={withLabel ? undefined : t('下载')} disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={onToggle} onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault(); const last = event.key === 'ArrowUp'; if (!open) onToggle();
      requestAnimationFrame(() => { const items = panel.current?.querySelectorAll('button'); items?.[last ? items.length - 1 : 0]?.focus(); });
    }}><Icon name="element-download" size={withLabel ? 16 : 20} />{withLabel && t('下载')}</Button>
    {shown.value && <div ref={panel} id={id} popover="manual" role="menu" aria-label={t('下载')} className="element-design-menu download-format-menu" data-workbench-menu data-phase={shown.phase} inert={shown.phase === 'exit'} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); anchor.current?.querySelector('button')?.focus(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const items = Array.from(event.currentTarget.querySelectorAll('button'));
      const index = items.indexOf(event.target as HTMLButtonElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }}><DownloadFormatOptions onSelect={format => { onClose(); anchor.current?.querySelector('button')?.focus(); onSelect(format); }} /></div>}
  </div>;
}
