import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useLocale } from '../LocaleContext';
import { usePresence } from '../usePresence';
import { useHoverDismiss } from '../useHoverDismiss';
import { type DownloadFormat } from '../download-image';
import { DownloadFormatOptions } from './DownloadFormatMenu';
import { Button, Icon, IconButton } from './ui';

function DeleteIcon() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flex: 'none' }}>
    <path d="M11.6406 1.25C12.432 1.25 13.122 1.78852 13.3142 2.55615C13.4895 3.25729 14.1198 3.7498 14.8425 3.75H16.875C17.2202 3.75 17.5 4.02982 17.5 4.375C17.5 4.72018 17.2202 5 16.875 5H16.6772C16.3364 5.91037 16.1367 6.86844 16.0925 7.84058L15.9363 11.2781L15.7056 15.7385C15.6449 17.0737 14.5446 18.125 13.208 18.125H6.79199C5.45543 18.125 4.35513 17.0737 4.29443 15.7385L4.06372 11.2781L3.90747 7.84058C3.86325 6.86844 3.66365 5.91037 3.32275 5H3.125C2.77982 5 2.5 4.72018 2.5 4.375C2.5 4.02982 2.77982 3.75 3.125 3.75H5.15747C5.88016 3.7498 6.51051 3.25729 6.68579 2.55615C6.87802 1.78852 7.56798 1.25 8.35938 1.25H11.6406ZM4.64722 5C4.93978 5.90023 5.11194 6.83646 5.15503 7.78442L5.31128 11.2219L5.54321 15.6812C5.57356 16.3487 6.12371 16.875 6.79199 16.875H13.208C13.8763 16.875 14.4264 16.3487 14.4568 15.6812L14.6887 11.2219L14.845 7.78442C14.8881 6.83646 15.0602 5.90023 15.3528 5H4.64722ZM8.125 8.125C8.47018 8.125 8.75 8.40482 8.75 8.75V12.5C8.75 12.8452 8.47018 13.125 8.125 13.125C7.77982 13.125 7.5 12.8452 7.5 12.5V8.75C7.5 8.40482 7.77982 8.125 8.125 8.125ZM11.875 8.125C12.2202 8.125 12.5 8.40482 12.5 8.75V12.5C12.5 12.8452 12.2202 13.125 11.875 13.125C11.5298 13.125 11.25 12.8452 11.25 12.5V8.75C11.25 8.40482 11.5298 8.125 11.875 8.125ZM8.35938 2.5C8.14134 2.5 7.95083 2.64858 7.89795 2.86011C7.81672 3.18492 7.68006 3.484 7.50122 3.75H12.4988C12.3199 3.484 12.1833 3.18492 12.1021 2.86011C12.0492 2.64858 11.8587 2.5 11.6406 2.5H8.35938Z" fill="currentColor" />
  </svg>;
}

export function TaskRecordMoreMenu({ detail = false, canDownload = false, canRegenerate = true, showRegenerate = true, onDownload, onRegenerate, onDelete }: {
  detail?: boolean; canDownload?: boolean; canRegenerate?: boolean; showRegenerate?: boolean;
  onDownload?: (format: DownloadFormat) => void; onRegenerate?: () => void; onDelete: () => void;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const shown = usePresence(open ? true : null);
  const shownDownload = usePresence(open && downloadOpen ? true : null);
  const downloadHover = useHoverDismiss(open && downloadOpen, () => setDownloadOpen(false));
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const submenu = useRef<HTMLDivElement>(null);
  const id = useId();
  const downloadId = `${id}-formats`;
  const downloadTrigger = () => panel.current?.querySelector<HTMLButtonElement>('[data-task-download]');
  useEffect(() => { if (!open) setDownloadOpen(false); }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !anchor.current?.contains(event.target) && !panel.current?.contains(event.target) && !submenu.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', outside);
    return () => window.removeEventListener('pointerdown', outside);
  }, [open]);
  useLayoutEffect(() => {
    if (!shown.value || !panel.current) return;
    const element = panel.current;
    element.showPopover();
    let frame = 0;
    const position = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const left = `${Math.max(8, Math.min(rect.right - element.offsetWidth, innerWidth - element.offsetWidth - 8))}px`;
      const below = rect.bottom + 8;
      const top = `${Math.max(8, below + element.offsetHeight <= innerHeight - 8 ? below : rect.top - element.offsetHeight - 8)}px`;
      if (element.style.left !== left) element.style.left = left;
      if (element.style.top !== top) element.style.top = top;
      frame = requestAnimationFrame(position);
    };
    position();
    return () => { cancelAnimationFrame(frame); if (element.matches(':popover-open')) element.hidePopover(); };
  }, [shown.value]);
  useLayoutEffect(() => {
    if (!shownDownload.value || !submenu.current) return;
    const element = submenu.current;
    element.showPopover();
    let frame = 0;
    const position = () => {
      const parent = panel.current?.getBoundingClientRect();
      const row = downloadTrigger()?.getBoundingClientRect();
      if (!parent || !row) return;
      const right = parent.right - 4;
      const flip = right + element.offsetWidth > innerWidth - 8;
      const left = `${Math.max(8, flip ? parent.left - element.offsetWidth + 4 : right)}px`;
      const top = `${Math.max(8, Math.min(row.top - 8, innerHeight - element.offsetHeight - 8))}px`;
      if (element.style.left !== left) element.style.left = left;
      if (element.style.top !== top) element.style.top = top;
      frame = requestAnimationFrame(position);
    };
    position();
    return () => { cancelAnimationFrame(frame); if (element.matches(':popover-open')) element.hidePopover(); };
  }, [shownDownload.value]);
  const choose = (action: () => void) => { downloadHover.cancel(); setDownloadOpen(false); setOpen(false); action(); };
  const openDownload = (focus = false) => {
    if (!canDownload) return;
    downloadHover.cancel(); setDownloadOpen(true);
    if (focus) requestAnimationFrame(() => submenu.current?.querySelector('button')?.focus());
  };
  return <div ref={anchor} className={`task-record-more-anchor ${detail ? 'task-record-more-anchor--detail' : ''}`} data-task-record-more>
    <IconButton variant="ghost" size={detail ? 'm' : 's'} icon={detail ? 'task-record-more-detail' : 'task-record-more-list'} aria-label={t('更多')} aria-haspopup="menu" aria-controls={id} aria-expanded={open} onClick={() => setOpen(value => !value)} onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => { const items = panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'); items?.[event.key === 'ArrowUp' ? items.length - 1 : 0]?.focus(); });
    }} />
    {shown.value && <div ref={panel} id={id} popover="manual" role="menu" aria-label={t('更多')} className="element-design-menu task-record-more-menu" data-phase={shown.phase} inert={shown.phase === 'exit'} onPointerEnter={detail ? undefined : downloadHover.cancel} onPointerLeave={event => {
      if (!detail && (!(event.relatedTarget instanceof Node) || !submenu.current?.contains(event.relatedTarget))) downloadHover.schedule();
    }} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); anchor.current?.querySelector('button')?.focus(); return; }
      if (event.key === 'ArrowRight' && event.target === downloadTrigger()) { event.preventDefault(); event.stopPropagation(); openDownload(true); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)'));
      const index = items.indexOf(event.target as HTMLButtonElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }}>
      {!detail && <>
        <Button role="menuitem" data-task-download disabled={!canDownload} aria-haspopup="menu" aria-expanded={open && downloadOpen} aria-controls={downloadId} onPointerEnter={() => openDownload()} onClick={() => openDownload(true)}><Icon name="task-record-download" size={20} /><span>{t('下载该组结果图')}</span><Icon name="menu-41-2700-imgStyleLinearNameChevronRight" size={16} /></Button>
        {showRegenerate && <Button role="menuitem" disabled={!canRegenerate} onPointerEnter={() => setDownloadOpen(false)} onFocus={() => setDownloadOpen(false)} onClick={() => onRegenerate && choose(onRegenerate)}><Icon name="task-record-regenerate" size={20} /><span>{t('再次生成')}</span></Button>}
      </>}
      <Button role="menuitem" onPointerEnter={detail ? undefined : () => setDownloadOpen(false)} onFocus={detail ? undefined : () => setDownloadOpen(false)} onClick={() => choose(onDelete)}><DeleteIcon /><span>{t(detail ? '删除' : '删除此条记录')}</span></Button>
    </div>}
    {shownDownload.value && <div ref={submenu} id={downloadId} popover="manual" role="menu" aria-label={t('下载该组结果图')} className="element-design-menu task-record-format-menu" data-phase={shownDownload.phase} inert={shownDownload.phase === 'exit'} onPointerEnter={downloadHover.cancel} onPointerLeave={event => {
      if (!(event.relatedTarget instanceof Node) || (!panel.current?.contains(event.relatedTarget) && !event.currentTarget.contains(event.relatedTarget))) downloadHover.schedule();
    }} onKeyDown={event => {
      if (event.key === 'Escape' || event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); setDownloadOpen(false); downloadTrigger()?.focus(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(':scope > button'));
      const index = items.indexOf(event.target as HTMLButtonElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }}><DownloadFormatOptions onSelect={format => onDownload && choose(() => onDownload(format))} /></div>}
  </div>;
}
