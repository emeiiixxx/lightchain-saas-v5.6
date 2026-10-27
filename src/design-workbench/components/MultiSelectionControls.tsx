import { DownloadFormatMenu } from './DownloadFormatMenu';
import type { DownloadFormat } from '../download-image';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocale } from '../LocaleContext';
import type { Notify } from '../notification';
import { selectionBounds, type Alignment, type Bounds } from '../canvas-selection';
import { downloadSelection } from '../download-selection';
import { CanvasArrangeMenu } from './CanvasArrangeMenu';
import { canvasToolbarPosition } from '../canvas-toolbar';
import type { CanvasImage, useCanvas } from '../useCanvas';
import { Button, Divider, Icon } from './ui';

type Board = ReturnType<typeof useCanvas>;
type Frame = Bounds & { rotation?: number };
type Drag = { items: CanvasImage[]; bounds: Bounds; x: number; y: number; handle: string; angle: number; zoom: number; cx: number; cy: number };
const alignments: [Alignment, string][] = [['left', '左对齐'], ['center', '水平居中'], ['right', '右对齐'], ['top', '顶部对齐'], ['middle', '垂直居中'], ['bottom', '底部对齐']];

export function MultiSelectionControls({ board, onNotify }: { board: Board; onNotify: Notify }) {
  const { t, locale } = useLocale();
  const items = board.images.filter(item => board.selectedIds.includes(item.id));
  const bounds = selectionBounds(items);
  const [transformFrame, setTransformFrame] = useState<Frame | null>(null);
  const frame: Frame = transformFrame ?? bounds;
  const drag = useRef<Drag | null>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [toolbarSize, setToolbarSize] = useState({ width: 280, height: 42 });
  const [alignOpen, setAlignOpen] = useState(false);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const downloadBusy = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useLayoutEffect(() => {
    const node = toolbar.current; if (!node) return;
    const observer = new ResizeObserver(() => setToolbarSize({ width: node.offsetWidth, height: node.offsetHeight })); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!toolbar.current?.contains(event.target as Node)) { setAlignOpen(false); setArrangeOpen(false); setDownloadOpen(false); } };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || (!alignOpen && !arrangeOpen)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const menuId = arrangeOpen ? 'multi-selection-arrange' : 'multi-selection-align';
      setAlignOpen(false); setArrangeOpen(false);
      toolbar.current?.querySelector<HTMLButtonElement>(`[aria-controls="${menuId}"]`)?.focus();
    };
    window.addEventListener('pointerdown', close); window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', escape, true); };
  }, [alignOpen, arrangeOpen]);
  const start = (event: ReactPointerEvent<HTMLButtonElement>, handle: string) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    if (handle === 'rotate') event.currentTarget.dataset.rotating = 'true';
    const rect = board.canvasRef.current!.getBoundingClientRect();
    const cx = rect.left + (bounds.x + bounds.width / 2) * board.camera.zoom + board.camera.x;
    const cy = rect.top + (bounds.y + bounds.height / 2) * board.camera.zoom + board.camera.y;
    drag.current = { items: items.map(item => ({ ...item })), bounds, x: event.clientX, y: event.clientY, handle, angle: Math.atan2(event.clientY - cy, event.clientX - cx), zoom: board.camera.zoom, cx, cy };
    board.beginEdit(); setAlignOpen(false); setArrangeOpen(false); setDownloadOpen(false);
  };
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current; if (!current) return;
    const { bounds: box, handle, items: originals } = current;
    if (handle === 'rotate') {
      let degrees = (Math.atan2(event.clientY - current.cy, event.clientX - current.cx) - current.angle) * 180 / Math.PI;
      if (event.shiftKey) degrees = Math.round(degrees / 15) * 15;
      const angle = degrees * Math.PI / 180, cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      board.updateImages(originals.map(item => {
        const dx = item.x + item.width / 2 - cx, dy = item.y + item.height / 2 - cy;
        return { id: item.id, x: cx + dx * Math.cos(angle) - dy * Math.sin(angle) - item.width / 2, y: cy + dx * Math.sin(angle) + dy * Math.cos(angle) - item.height / 2, rotation: (item.rotation ?? 0) + degrees };
      }));
      setTransformFrame({ ...box, rotation: degrees }); return;
    }
    const dx = (event.clientX - current.x) / current.zoom, dy = (event.clientY - current.y) / current.zoom;
    const minScale = Math.max(...originals.map(item => Math.max(8 / item.width, 8 / item.height)));
    let sx = Math.max(minScale, (box.width + (handle.includes('r') ? dx : handle.includes('l') ? -dx : 0)) / box.width);
    let sy = Math.max(minScale, (box.height + (handle.includes('b') ? dy : handle.includes('t') ? -dy : 0)) / box.height);
    if (handle.length === 2 || event.shiftKey || originals.some(item => item.rotation)) {
      const scale = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy; sx = scale; sy = scale;
    }
    const width = box.width * sx, height = box.height * sy;
    const x = handle.includes('l') ? box.x + box.width - width : handle.includes('r') ? box.x : box.x + (box.width - width) / 2;
    const y = handle.includes('t') ? box.y + box.height - height : handle.includes('b') ? box.y : box.y + (box.height - height) / 2;
    board.updateImages(originals.map(item => ({ id: item.id, x: x + (item.x - box.x) * sx, y: y + (item.y - box.y) * sy, width: item.width * sx, height: item.height * sy })));
    setTransformFrame({ x, y, width, height });
  };
  const end = (event: ReactPointerEvent<HTMLButtonElement>) => { drag.current = null; setTransformFrame(null); delete event.currentTarget.dataset.rotating; };
  const grouped = !!items[0]?.groupId && items.every(item => item.groupId === items[0].groupId);
  const download = async (format: DownloadFormat) => {
    if (downloadBusy.current) return;
    downloadBusy.current = true; setDownloading(true);
    try { await downloadSelection(items, format); }
    catch (error) { onNotify(error instanceof Error && error.message === '当前浏览器不支持此格式导出，请选择其他格式' ? error.message : '下载失败，请重试。', 'error'); }
    finally { downloadBusy.current = false; if (alive.current) setDownloading(false); }
  };
  return <>
    <div className="element-selection" style={{ left: frame.x * board.camera.zoom + board.camera.x, top: frame.y * board.camera.zoom + board.camera.y, width: frame.width * board.camera.zoom, height: frame.height * board.camera.zoom, transform: `rotate(${frame.rotation ?? 0}deg)` }}>
      {['tl', 't', 'tr', 'l', 'r', 'bl', 'b', 'br', 'rotate'].map(handle => <button key={handle} type="button" data-canvas-ui className={`selection-handle handle-${handle}`} aria-label={t(handle === 'rotate' ? '旋转选中图片' : '调整选中图片尺寸')} onPointerDown={event => start(event, handle)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>{handle === 'rotate' && <Icon name="canvas-imgIcon0201" size={16} />}</button>)}
    </div>
    <div ref={toolbar} className="element-toolbar multi-selection-toolbar wb-surface" data-canvas-ui role="toolbar" aria-label={t('多选工具栏')} style={canvasToolbarPosition(bounds, board.camera, board.size, toolbarSize)}>
      {!grouped && <><div className="element-menu-anchor" data-workbench-menu>
        <Button aria-haspopup="menu" aria-expanded={arrangeOpen} aria-controls="multi-selection-arrange" onClick={() => { setAlignOpen(false); setDownloadOpen(false); setArrangeOpen(value => !value); }} onKeyDown={event => {
          if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
          event.preventDefault(); const last = event.key === 'ArrowUp';
          setAlignOpen(false); setDownloadOpen(false); setArrangeOpen(true);
          requestAnimationFrame(() => { const buttons = toolbar.current?.querySelectorAll<HTMLButtonElement>('#multi-selection-arrange button'); buttons?.[last ? buttons.length - 1 : 0]?.focus(); });
        }}><Icon name="canvas-arrange" size={16} />{locale === 'en' ? 'Arrange' : locale === 'ja' ? '整列' : '整理'}</Button>
        {arrangeOpen && <CanvasArrangeMenu id="multi-selection-arrange" className="multi-selection-arrange" label={locale === 'en' ? 'Arrange selection' : locale === 'ja' ? '選択範囲を整列' : '整理选中图片'} onSelect={layout => {
          board.arrange(layout, 'selection'); setArrangeOpen(false);
          board.canvasRef.current?.focus({ preventScroll: true });
        }} />}
      </div><Divider vertical /></>}
      <Button onClick={() => { setAlignOpen(false); setArrangeOpen(false); setDownloadOpen(false); board.groupSelection(grouped); }}>{t(grouped ? '解散组' : '创建组')}</Button>
      {!grouped && <><div className="element-menu-anchor">
        <Button aria-haspopup="menu" aria-expanded={alignOpen} aria-controls="multi-selection-align" onClick={() => { setArrangeOpen(false); setDownloadOpen(false); setAlignOpen(!alignOpen); }}><Icon name="selection-align-left" size={16} />{t('对齐')}</Button>
        {alignOpen && <div id="multi-selection-align" className="element-design-menu multi-selection-align" role="menu" aria-label={t('对齐')} onKeyDown={event => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault(); const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
          const index = buttons.indexOf(event.target as HTMLButtonElement);
          buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        }}>{alignments.map(([value, label]) => <Button key={value} role="menuitem" onClick={() => { board.alignSelection(value); setAlignOpen(false); }}><Icon name={`selection-align-${value}`} size={16} /><span>{t(label)}</span></Button>)}</div>}
      </div></>}
      <Divider vertical /><DownloadFormatMenu withLabel={false} open={downloadOpen} disabled={downloading} onToggle={() => { setAlignOpen(false); setArrangeOpen(false); setDownloadOpen(value => !value); }} onClose={() => setDownloadOpen(false)} onSelect={format => void download(format)} />
    </div>
  </>;
}
