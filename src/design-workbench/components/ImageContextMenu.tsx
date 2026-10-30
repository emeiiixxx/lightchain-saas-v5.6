import { DownloadFormatOptions } from './DownloadFormatMenu';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useCanvas } from '../useCanvas';
import { usePresence } from '../usePresence';
import { useLocale } from '../LocaleContext';
import { Icon } from './ui';

type Board = ReturnType<typeof useCanvas>;
const coverNewUsedKey = 'lc-v56-design-project-cover-used';
export function ImageContextMenu({ board, onUpload }: { board: Board; onUpload: (point?: { x: number; y: number }) => void }) {
  const { t, locale } = useLocale();
  const [coverUsed, setCoverUsed] = useState(() => {
    try { return localStorage.getItem(coverNewUsedKey) === '1'; }
    catch { return false; }
  });
  useEffect(() => {
    const syncCoverUse = (event: StorageEvent) => { if (event.key === coverNewUsedKey && event.newValue === '1') setCoverUsed(true); };
    window.addEventListener('storage', syncCoverUse);
    return () => window.removeEventListener('storage', syncCoverUse);
  }, []);
  const shown = usePresence(board.contextMenu);
  const [submenu, setSubmenu] = useState<'download' | 'order' | null>(null);
  const sub = usePresence(submenu);
  const root = useRef<HTMLDivElement>(null);
  const subPanel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [subPosition, setSubPosition] = useState({ x: 0, y: 0, left: false });
  const close = () => board.setContextMenu(null);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const modifier = mac ? '⌘' : 'Ctrl';
  useLayoutEffect(() => {
    const menu = root.current, anchor = shown.value;
    if (!menu || !anchor) return;
    const place = () => {
      const x = Math.max(8, Math.min(anchor.x, window.innerWidth - menu.offsetWidth - 8));
      const y = Math.max(8, Math.min(anchor.y, window.innerHeight - menu.offsetHeight - 8));
      setPosition(current => current.x === x && current.y === y ? current : { x, y });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(menu);
    return () => observer.disconnect();
  }, [shown.value, locale]);
  useLayoutEffect(() => {
    const menu = root.current, panel = subPanel.current;
    const button = menu?.querySelector<HTMLButtonElement>(`[data-sub="${sub.value}"]`);
    if (!menu || !panel || !button) return;
    const place = () => {
      const edge = menu.getBoundingClientRect(), anchor = button.getBoundingClientRect();
      const width = panel.offsetWidth, height = panel.offsetHeight, overlap = 4;
      const rightSpace = window.innerWidth - edge.right;
      const left = edge.right + width - overlap > window.innerWidth - 8 && edge.left > rightSpace;
      const x = Math.max(8, Math.min(left ? edge.left - width + overlap : edge.right - overlap, window.innerWidth - width - 8));
      const y = Math.max(8, Math.min(anchor.top - 8, window.innerHeight - height - 8));
      setSubPosition(current => current.x === x && current.y === y && current.left === left ? current : { x, y, left });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(menu); observer.observe(panel);
    return () => observer.disconnect();
  }, [sub.value, locale, position]);
  useEffect(() => {
    setSubmenu(null);
    if (!board.contextMenu) return;
    // Receive keyboard events without highlighting the first item on pointer open.
    root.current?.focus({ preventScroll: true });
    const dismiss = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) board.setContextMenu(null); };
    const resize = () => board.setContextMenu(null);
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', resize); };
  }, [board.contextMenu]);
  const perform = (action: () => void) => { action(); close(); board.canvasRef.current?.focus({ preventScroll: true }); };
  const openSub = (kind: 'download' | 'order') => setSubmenu(kind);
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return;
    if (shown.value?.id && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.code === 'KeyD' || e.key.toLowerCase() === 'd')) {
      e.preventDefault(); perform(board.duplicate); return;
    }
    if (shown.value?.id && (e.metaKey || e.ctrlKey) && ['c', 'v'].includes(e.key.toLowerCase())) {
      e.preventDefault(); const key = e.key.toLowerCase(); perform(key === 'c' ? board.copySelected : board.paste); return;
    }
    if (shown.value?.id && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); perform(board.removeSelected); return; }
    if (e.key === 'Escape') { e.preventDefault(); perform(() => {}); return; }
    if (e.key === 'Tab') { close(); return; }
    const target = e.target as HTMLElement;
    const menu = target.closest('[role="menu"]'); if (!menu) return;
    if (e.key === 'ArrowLeft' && menu !== root.current) { e.preventDefault(); setSubmenu(null); root.current?.querySelector<HTMLButtonElement>(`[data-sub="${submenu}"]`)?.focus(); return; }
    if (e.key === 'ArrowRight' && target.dataset.sub) { e.preventDefault(); openSub(target.dataset.sub as 'download' | 'order'); requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('.image-context-submenu button')?.focus()); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault(); const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>('button')).filter(b => b.closest('[role="menu"]') === menu && !b.disabled);
      const index = buttons.indexOf(target as HTMLButtonElement);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : index < 0 ? (e.key === 'ArrowDown' ? 0 : buttons.length - 1) : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  };
  if (!shown.value) return null;
  if (shown.value.id === null) return <div ref={root} className="image-context-menu" role="menu" tabIndex={-1} aria-label={t('上传图片')} data-canvas-ui data-workbench-menu data-phase={shown.phase} inert={shown.phase === 'exit'} style={{ left: position.x, top: position.y }} onKeyDown={keys} onContextMenu={event => event.preventDefault()}>
    <button type="button" role="menuitem" onClick={() => { const point = shown.value?.worldPoint; close(); onUpload(point); }}><Icon name="canvas-imgIconSystem5" size={20} /><span>{t('上传图片')}</span></button>
  </div>;
  const subTrigger = (kind: 'download' | 'order', label: string, icon: string) => <button type="button" role="menuitem" data-sub={kind} aria-haspopup="menu" aria-expanded={submenu === kind} onPointerEnter={() => openSub(kind)} onClick={() => openSub(kind)}><Icon name={icon} size={20} /><span>{t(label)}</span><Icon name="context-img" size={16} /></button>;
  const item = (label: string, icon: string, action: () => void, shortcut?: string) => <button type="button" role="menuitem" onPointerEnter={() => setSubmenu(null)} onFocus={() => setSubmenu(null)} onClick={() => perform(action)}><Icon name={icon} size={20} /><span>{t(label)}</span>{shortcut && <kbd>{shortcut}</kbd>}</button>;
  const validImage = board.images.some(image => image.id === shown.value?.id && !image.generating && !image.generationFailed);
  const canSetCover = validImage && !board.images.find(image => image.id === shown.value?.id)?.shape;
  const isManualCover = board.images.some(image => image.id === shown.value?.id && image.cover);
  const updateProjectCover = () => {
    const imageId = shown.value?.id;
    if (!imageId) return;
    perform(() => {
      if (isManualCover) { board.resetCover(imageId); return; }
      if (!board.setCover(imageId)) return;
      setCoverUsed(true);
      try { localStorage.setItem(coverNewUsedKey, '1'); } catch { /* Keep the in-session state. */ }
    });
  };
  const index = board.images.findIndex(image => image.id === board.selected);
  return <div ref={root} className="image-context-menu" role="menu" tabIndex={-1} aria-label={t('图片右键菜单')} data-canvas-ui data-workbench-menu data-phase={shown.phase} inert={shown.phase === 'exit'} style={{ left: position.x, top: position.y }} onKeyDown={keys} onContextMenu={e => e.preventDefault()}>
    {validImage && subTrigger('download', '下载', 'context-imgLeftIcon')}
    <div className="element-menu-divider" role="separator" />
    {subTrigger('order', '图层顺序', 'context-imgLeftIcon1')}
    {validImage && item('复制', 'context-imgLeftIcon2', board.copySelected, `${modifier} + C`)}
    {validImage && item('复制并粘贴', 'context-imgLeftIcon3', board.duplicate, `${modifier} + D`)}
    {canSetCover && <button type="button" role="menuitem" onPointerEnter={() => setSubmenu(null)} onFocus={() => setSubmenu(null)} onClick={updateProjectCover}><Icon name="context-project-cover" size={20} /><span>{t(isManualCover ? '恢复默认封面' : '设为项目封面')}</span>{!coverUsed && !isManualCover && <span className="image-context-new-badge">NEW</span>}</button>}
    <div className="element-menu-divider" role="separator" />
    {item('删除', 'context-imgLeftIcon5', board.removeSelected, '←/del')}
    {sub.value && <div ref={subPanel} className={`image-context-menu image-context-submenu ${sub.value === 'download' ? 'element-design-menu download-format-menu' : ''} ${subPosition.left ? 'opens-left' : ''}`} role="menu" aria-label={t(sub.value === 'download' ? '下载格式' : '图层顺序')} data-phase={sub.phase} inert={sub.phase === 'exit'} style={{ left: Math.max(8, subPosition.x), top: subPosition.y }}>
      {sub.value === 'download' ? <DownloadFormatOptions onSelect={format => perform(() => { void board.downloadImage(format); })} /> : ([['front', '移到顶层'], ['up', '上移一层'], ['down', '下移一层'], ['back', '移到底层']] as const).map(([direction, label]) => <button type="button" role="menuitem" key={direction} disabled={direction === 'front' || direction === 'up' ? index === board.images.length - 1 : index <= 0} onClick={() => perform(() => board.reorder(direction))}>{t(label)}</button>)}
    </div>}
  </div>;
}
