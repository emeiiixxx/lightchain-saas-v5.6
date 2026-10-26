import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { CanvasImage, Viewport } from '../canvas';
import { assets } from '../assets';
import { guideDimensions, paintGuide, type DrawingGuide, type GuidePoint, type GuideStroke, type GuideTool } from '../drawing-guide';
import type { Locale } from '../i18n';
import { Button, Divider, Icon } from './ui';
import './draw-guide-editor.css';

const copy = {
  'zh-CN': { title: '绘制示意', brush: '画笔', eraser: '橡皮擦', colors: '画笔颜色', red: '红色', orange: '橙色', blue: '蓝色', size: '笔刷粗细', decrease: '减小笔刷粗细', increase: '增大笔刷粗细', undo: '撤销', redo: '重做', clear: '清除选区', cancel: '取消', save: '保存', loading: '正在加载图片…', error: '图片加载失败，请重试', retry: '重试', saveError: '示意保存失败，请重试', hint: '💡请画出你想要示意的区域，按住Shift可画水平/垂直线，支持滚轮缩放和按住空格+鼠标拖动查看。' },
  en: { title: 'Draw guide', brush: 'Brush', eraser: 'Eraser', colors: 'Brush color', red: 'Red', orange: 'Orange', blue: 'Blue', size: 'Brush size', decrease: 'Decrease brush size', increase: 'Increase brush size', undo: 'Undo', redo: 'Redo', clear: 'Clear guide', cancel: 'Cancel', save: 'Save', loading: 'Loading image…', error: 'Image failed to load. Please retry.', retry: 'Retry', saveError: 'Could not save the guide. Please retry.', hint: '💡Hold Shift while drawing for horizontal/vertical lines. Scroll to zoom; Space + drag to pan.' },
  ja: { title: 'ガイドを描く', brush: 'ブラシ', eraser: '消しゴム', colors: 'ブラシの色', red: '赤', orange: 'オレンジ', blue: '青', size: 'ブラシの太さ', decrease: 'ブラシを細くする', increase: 'ブラシを太くする', undo: '元に戻す', redo: 'やり直す', clear: 'ガイドを消去', cancel: 'キャンセル', save: '保存', loading: '画像を読み込み中…', error: '画像を読み込めませんでした', retry: '再試行', saveError: '保存できませんでした。もう一度お試しください。', hint: '💡ブラシは Shift を押しながら水平・垂直線を描けます。スクロールで拡大縮小、スペース＋ドラッグで移動。' },
};
const colors = [
  { id: 'red', token: '--status-danger' },
  { id: 'orange', token: '--status-warning' },
  { id: 'blue', token: '--dodger-blue-500' },
] as const;
const eraserSizeCopy = {
  'zh-CN': { size: '橡皮擦大小', decrease: '缩小橡皮擦', increase: '增大橡皮擦' },
  en: { size: 'Eraser size', decrease: 'Decrease eraser size', increase: 'Increase eraser size' },
  ja: { size: '消しゴムのサイズ', decrease: '消しゴムを小さくする', increase: '消しゴムを大きくする' },
};
type StraightLine = { anchor: GuidePoint; axis: 'horizontal' | 'vertical' | null };
type Gesture = { pointerId: number; kind: 'draw'; lastPointer: GuidePoint; straight: StraightLine | null }
  | { pointerId: number; kind: 'pan'; clientX: number; clientY: number; view: Viewport };
type Props = { image: CanvasImage; locale: Locale; phase: 'enter' | 'exit'; onClose: () => void; onSave: (guide: DrawingGuide | undefined) => void };

type SizeControlProps = {
  tool: GuideTool;
  value: number;
  active: boolean;
  disabled: boolean;
  labels: { size: string; decrease: string; increase: string };
  onChange: (value: number) => void;
};

function GuideSizeControl({ tool, value, active, disabled, labels, onChange }: SizeControlProps) {
  const sliderId = useId();
  const [dragging, setDragging] = useState(false);
  const blocked = disabled || !active;
  const progress = (value - 1) / 99 * 100;
  useEffect(() => {
    if (!active) setDragging(false);
    const reset = () => setDragging(false);
    window.addEventListener('blur', reset);
    return () => window.removeEventListener('blur', reset);
  }, [active]);
  return <div className="draw-guide-size" data-size-tool={tool} data-active={active} inert={!active} aria-hidden={!active}>
    <Button size="m" className="draw-guide-step" aria-label={labels.decrease} disabled={blocked || value <= 1} onClick={() => onChange(Math.max(1, value - 1))}><Icon name="guideMinus" size={24} /></Button>
    <div className="draw-guide-range" data-active={active && dragging} style={{ '--slider-progress': `${progress}%` } as CSSProperties}>
      <input id={sliderId} type="range" min={1} max={100} step={1} value={value} disabled={blocked} aria-label={labels.size} aria-valuetext={String(value)} onChange={event => onChange(Number(event.target.value))} onPointerDown={() => setDragging(true)} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)} onLostPointerCapture={() => setDragging(false)} onBlur={() => setDragging(false)} />
      <output className="draw-guide-size-tooltip" htmlFor={sliderId} aria-hidden="true">{value}<img src={assets.guideTooltipArrow} width={8} height={4} alt="" /></output>
    </div>
    <Button size="m" className="draw-guide-step" aria-label={labels.increase} disabled={blocked || value >= 100} onClick={() => onChange(Math.min(100, value + 1))}><Icon name="guidePlus" size={24} /></Button>
  </div>;
}

export function DrawingGuideEditor({ image, locale, phase, onClose, onSave }: Props) {
  const t = copy[locale];
  const stored = image.fusion?.drawingGuide?.sourceUrl === image.url ? image.fusion.drawingGuide : undefined;
  const [dimensions] = useState(() => stored ? { width: stored.width, height: stored.height } : guideDimensions(image.width, image.height));
  const [strokes, setStrokes] = useState<GuideStroke[]>(() => stored?.strokes ?? []);
  const strokeRef = useRef(strokes);
  const past = useRef<GuideStroke[][]>([]);
  const future = useRef<GuideStroke[][]>([]);
  const active = useRef<GuideStroke | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const paintFrame = useRef<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLCanvasElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<GuideTool>('brush');
  const [color, setColor] = useState<(typeof colors)[number]['id']>('red');
  const [toolSizes, setToolSizes] = useState<Record<GuideTool, number>>({ brush: 10, eraser: 10 });
  const size = toolSizes[tool];
  const [spaceDown, setSpaceDown] = useState(false);
  const spaceRef = useRef(false);
  const [panning, setPanning] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const viewRef = useRef(view);
  const readyRef = useRef(false); readyRef.current = loadState === 'ready' && phase !== 'exit';

  function changeView(next: Viewport) { viewRef.current = next; setView(next); repaint(); }
  function repaint() {
    if (paintFrame.current !== null) return;
    paintFrame.current = requestAnimationFrame(() => {
      paintFrame.current = null;
      const canvas = layer.current;
      const element = stage.current;
      if (!canvas || !element) return;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const pixelRatio = window.devicePixelRatio || 1;
      const width = Math.ceil(rect.width * pixelRatio), height = Math.ceil(rect.height * pixelRatio);
      // Rasterize the original stroke points at screen resolution. The backing
      // follows the viewport, not the zoomed image's potentially enormous size.
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const current = viewRef.current;
      paintGuide(canvas, strokeRef.current, active.current, {
        scale: current.zoom * pixelRatio,
        offsetX: current.x * pixelRatio,
        offsetY: current.y * pixelRatio,
        bounds: dimensions,
      });
    });
  }
  function hideCursor() {
    if (cursor.current) cursor.current.hidden = true;
    if (stage.current) stage.current.dataset.overImage = 'false';
  }
  function finishGesture(preserveStroke: boolean) {
    const current = gesture.current;
    const completed = active.current;
    active.current = null;
    gesture.current = null;
    setDrawing(false); setPanning(false);
    // Clear ownership first: releasing capture may immediately dispatch another
    // pointer event. Every stroke must reach history at most once.
    if (preserveStroke && current?.kind === 'draw' && completed) commit([...strokeRef.current, completed]);
    else repaint();
    if (current && stage.current?.hasPointerCapture(current.pointerId)) stage.current.releasePointerCapture(current.pointerId);
    hideCursor();
  }
  function cancelGesture() { finishGesture(false); }
  function commit(next: GuideStroke[]) {
    past.current.push(strokeRef.current);
    future.current = [];
    strokeRef.current = next; setStrokes(next); setNotice(''); repaint();
  }
  function undo() {
    if (gesture.current) return;
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(strokeRef.current);
    strokeRef.current = previous; setStrokes(previous); setNotice(''); repaint();
  }
  function redo() {
    if (gesture.current) return;
    const next = future.current.pop();
    if (!next) return;
    past.current.push(strokeRef.current);
    strokeRef.current = next; setStrokes(next); setNotice(''); repaint();
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    stage.current?.focus({ preventScroll: true });
    let priorSize: { width: number; height: number } | null = null;
    const resize = () => {
      const rect = stage.current!.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      if (!priorSize) {
        const bottom = rect.width < 900 ? 176 : 112;
        const zoom = Math.max(.05, Math.min(Math.max(1, rect.width - 64) / dimensions.width, Math.max(1, rect.height - bottom - 96) / dimensions.height));
        changeView({ zoom, x: (rect.width - dimensions.width * zoom) / 2, y: 96 + (rect.height - bottom - 96 - dimensions.height * zoom) / 2 });
      } else {
        const current = viewRef.current;
        changeView({ ...current, x: current.x + (rect.width - priorSize.width) / 2, y: current.y + (rect.height - priorSize.height) / 2 });
      }
      priorSize = { width: rect.width, height: rect.height };
      hideCursor();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage.current!);
    window.addEventListener('resize', resize);
    // A monitor change can alter pixel density without changing CSS dimensions.
    let resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    const pixelRatioChanged = () => {
      resolution.removeEventListener('change', pixelRatioChanged);
      resize();
      resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      resolution.addEventListener('change', pixelRatioChanged);
    };
    resolution.addEventListener('change', pixelRatioChanged);
    const reset = () => { spaceRef.current = false; setSpaceDown(false); finishGesture(true); };
    // Track an active gesture at window level so crossing the toolbar, leaving
    // the stage or losing pointer capture cannot drop its final samples/up.
    const pointerMove = (event: globalThis.PointerEvent) => {
      if (gesture.current?.pointerId === event.pointerId) move(event);
    };
    const pointerUp = (event: globalThis.PointerEvent) => end(event);
    const pointerCancel = (event: globalThis.PointerEvent) => {
      if (gesture.current?.pointerId === event.pointerId) finishGesture(true);
    };
    const releaseModifier = (event: globalThis.KeyboardEvent) => {
      if (event.code === 'Space') { spaceRef.current = false; setSpaceDown(false); }
      if (event.key === 'Shift' && !event.shiftKey && gesture.current?.kind === 'draw') gesture.current.straight = null;
    };
    window.addEventListener('blur', reset);
    window.addEventListener('keyup', releaseModifier);
    window.addEventListener('pointermove', pointerMove, true);
    window.addEventListener('pointerup', pointerUp, true);
    window.addEventListener('pointercancel', pointerCancel, true);
    repaint();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
      resolution.removeEventListener('change', pixelRatioChanged);
      window.removeEventListener('blur', reset);
      window.removeEventListener('keyup', releaseModifier);
      window.removeEventListener('pointermove', pointerMove, true);
      window.removeEventListener('pointerup', pointerUp, true);
      window.removeEventListener('pointercancel', pointerCancel, true);
      if (paintFrame.current !== null) cancelAnimationFrame(paintFrame.current);
      paintFrame.current = null;
      element.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [dimensions]);
  useEffect(() => {
    const element = stage.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); event.stopPropagation();
      if (!readyRef.current || gesture.current) return;
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      const current = viewRef.current;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      const zoom = Math.max(.05, Math.min(8, current.zoom * Math.exp(-Math.max(-600, Math.min(600, delta)) * .0015)));
      const ratio = zoom / current.zoom;
      changeView({ zoom, x: x - (x - current.x) * ratio, y: y - (y - current.y) * ratio });
      showCursor(event);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);

  function point(clientX: number, clientY: number): GuidePoint {
    const rect = stage.current!.getBoundingClientRect();
    const current = viewRef.current;
    return { x: (clientX - rect.left - current.x) / current.zoom, y: (clientY - rect.top - current.y) / current.zoom };
  }
  function inside(p: GuidePoint) { return p.x >= 0 && p.y >= 0 && p.x <= dimensions.width && p.y <= dimensions.height; }
  function appendDrawPoint(next: GuidePoint, shiftKey: boolean) {
    const current = gesture.current;
    const stroke = active.current;
    if (current?.kind !== 'draw' || !stroke) return;
    const last = stroke.points.at(-1)!;
    current.lastPointer = next;
    if (stroke.tool === 'brush' && shiftKey) {
      const straight = current.straight ??= { anchor: last, axis: null };
      if (!straight.axis) {
        const dx = next.x - straight.anchor.x, dy = next.y - straight.anchor.y;
        // Ignore tiny hand jitter before choosing an axis, at every zoom level.
        if (Math.hypot(dx, dy) * viewRef.current.zoom < 3) return;
        straight.axis = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
      }
      next = straight.axis === 'horizontal' ? { x: next.x, y: straight.anchor.y } : { x: straight.anchor.x, y: next.y };
    } else current.straight = null;
    if (Math.hypot(next.x - last.x, next.y - last.y) > .1) stroke.points.push(next);
  }
  function showCursor(event: { clientX: number; clientY: number; pointerType?: string }) {
    const el = cursor.current;
    if (!el) return;
    const tip = gesture.current?.kind === 'draw' ? active.current?.points.at(-1) ?? point(event.clientX, event.clientY) : point(event.clientX, event.clientY);
    if (!readyRef.current || event.pointerType === 'touch' || spaceRef.current || gesture.current?.kind === 'pan' || !inside(tip)) { hideCursor(); return; }
    const current = viewRef.current;
    stage.current!.dataset.overImage = 'true';
    el.hidden = false;
    el.style.transform = `translate(${current.x + tip.x * current.zoom}px, ${current.y + tip.y * current.zoom}px)`;
  }
  function start(event: PointerEvent<HTMLDivElement>) {
    if (!readyRef.current || gesture.current || (event.button !== 0 && event.button !== 1)) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    if (spaceRef.current || event.button === 1) {
      gesture.current = { pointerId: event.pointerId, kind: 'pan', clientX: event.clientX, clientY: event.clientY, view: { ...viewRef.current } };
      setPanning(true); hideCursor();
    } else {
      const first = point(event.clientX, event.clientY);
      if (!inside(first)) return;
      const token = colors.find(item => item.id === color)!.token;
      active.current = { tool, color: getComputedStyle(dialog.current!).getPropertyValue(token).trim(), size, points: [first] };
      gesture.current = { pointerId: event.pointerId, kind: 'draw', lastPointer: first, straight: tool === 'brush' && event.shiftKey ? { anchor: first, axis: null } : null };
      setDrawing(true); showCursor(event); repaint();
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: globalThis.PointerEvent) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    // An up outside the window may never be delivered. Preserve the stroke
    // before accepting a hover position, rather than extending or discarding it.
    if (event.buttons === 0) { finishGesture(true); showCursor(event); return; }
    if (current?.kind === 'pan') {
      changeView({ ...current.view, x: current.view.x + event.clientX - current.clientX, y: current.view.y + event.clientY - current.clientY });
      return;
    }
    if (!active.current || current?.kind !== 'draw') { showCursor(event); return; }
    const coalesced = event.getCoalescedEvents?.() ?? [];
    for (const sample of coalesced) {
      appendDrawPoint(point(sample.clientX, sample.clientY), sample.shiftKey);
    }
    // Keep the dispatched endpoint too; some devices provide only earlier
    // samples in the coalesced batch. appendDrawPoint ignores duplicate points.
    appendDrawPoint(point(event.clientX, event.clientY), event.shiftKey);
    showCursor(event);
    repaint();
  }
  function end(event: globalThis.PointerEvent) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.kind === 'draw' && active.current) {
      for (const sample of event.getCoalescedEvents?.() ?? []) {
        const next = point(sample.clientX, sample.clientY);
        if (Math.hypot(next.x - current.lastPointer.x, next.y - current.lastPointer.y) > .1) appendDrawPoint(next, sample.shiftKey);
      }
      const next = point(event.clientX, event.clientY);
      // Releasing Shift just before the mouse must not add an off-axis tail.
      if (Math.hypot(next.x - current.lastPointer.x, next.y - current.lastPointer.y) > .1) appendDrawPoint(next, event.shiftKey);
    }
    finishGesture(true);
    showCursor(event);
  }
  function chooseTool(next: GuideTool) { setTool(next); hideCursor(); stage.current?.focus({ preventScroll: true }); }
  function keyDown(event: KeyboardEvent<HTMLDialogElement>) {
    event.stopPropagation();
    if (phase === 'exit') return;
    const target = event.target as HTMLElement;
    if (event.key === 'Shift' && !event.repeat && gesture.current?.kind === 'draw' && active.current?.tool === 'brush') {
      gesture.current.straight = { anchor: active.current.points.at(-1)!, axis: null };
    }
    if (event.code === 'Space' && !target.closest('button, input')) {
      event.preventDefault(); spaceRef.current = true; setSpaceDown(true); hideCursor(); return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      else if (event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
    }
  }
  function saveGuide() {
    if (!readyRef.current || gesture.current || !layer.current) return;
    try {
      // Saving always includes the whole guide, even when the viewport is
      // zoomed into a small area or panned away from existing strokes.
      const preview = document.createElement('canvas');
      preview.width = dimensions.width;
      preview.height = dimensions.height;
      const ctx = paintGuide(preview, strokeRef.current);
      const pixels = ctx.getImageData(0, 0, dimensions.width, dimensions.height).data;
      let hasContent = false;
      for (let i = 3; i < pixels.length; i += 4) { if (pixels[i]) { hasContent = true; break; } }
      onSave(hasContent ? { sourceUrl: image.url, ...dimensions, strokes: strokeRef.current, previewUrl: preview.toDataURL('image/png') } : undefined);
    } catch { setNotice(t.saveError); }
  }

  const disabled = loadState !== 'ready' || drawing || panning || phase === 'exit';
  const brush = <Button size="m" className="draw-guide-tool draw-guide-brush" aria-label={t.brush} aria-pressed={tool === 'brush'} disabled={disabled} onClick={() => chooseTool('brush')}><Icon name="guideMarker" size={24} /></Button>;
  const eraser = <Button size="m" className="draw-guide-tool draw-guide-eraser" aria-label={t.eraser} aria-pressed={tool === 'eraser'} disabled={disabled} onClick={() => chooseTool('eraser')}><Icon name="guideEraser" size={24} /></Button>;
  return <dialog ref={dialog} className="draw-guide-editor" data-phase={phase} data-node-id="12:108" inert={phase === 'exit'} aria-label={t.title} onCancel={event => { event.preventDefault(); cancelGesture(); onClose(); }} onKeyDown={keyDown}>
    <div ref={stage} className="draw-guide-stage" tabIndex={0} role="region" aria-label={t.title} data-panning={panning} data-hand={spaceDown} data-ready={loadState === 'ready'} onPointerDown={start} onPointerMove={event => { if (!gesture.current) showCursor(event); }} onPointerEnter={showCursor} onPointerLeave={hideCursor} onContextMenu={event => event.preventDefault()}>
      <div className="draw-guide-image" style={{ width: dimensions.width, height: dimensions.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <img key={attempt} src={image.url} alt={image.name} draggable={false} onLoad={() => setLoadState('ready')} onError={() => setLoadState('error')} />
      </div>
      <canvas ref={layer} className="draw-guide-ink" aria-hidden="true" />
      <div ref={cursor} className="draw-guide-cursor" style={{ '--guide-cursor-size': `${size * view.zoom}px` } as CSSProperties} aria-hidden="true" hidden>
        <span className="draw-guide-cursor-ring" />
      </div>
    </div>
    <div className="draw-guide-hint" data-node-id="12:218">{t.hint}</div>
    {(loadState !== 'ready' || notice) && <div className="draw-guide-notice" role="status">
      <p>{loadState === 'loading' ? t.loading : loadState === 'error' ? t.error : notice}</p>
      {loadState === 'error' && <Button variant="secondary" onClick={() => { setLoadState('loading'); setAttempt(value => value + 1); }}>{t.retry}</Button>}
    </div>}
    <div className="draw-guide-toolbar" role="toolbar" aria-label={t.title} data-tool={tool} data-node-id={tool === 'brush' ? '1:725' : '12:742'}>
      <div className="draw-guide-title-group"><span className="draw-guide-title">{t.title}</span><Divider vertical /></div>
      <div className="draw-guide-tools">
        {brush}
        <div className="draw-guide-options" data-options-tool="brush" data-expanded={tool === 'brush'} inert={tool !== 'brush'} aria-hidden={tool !== 'brush'}>
          <div className="draw-guide-options-content">
            <div className="draw-guide-colors" role="group" aria-label={t.colors}>
              {colors.map(item => <button key={item.id} type="button" className="draw-guide-color" disabled={disabled} aria-label={t[item.id]} aria-pressed={color === item.id} data-tooltip={t[item.id]} style={{ '--guide-color': `var(${item.token})` } as CSSProperties} onClick={() => { setColor(item.id); stage.current?.focus({ preventScroll: true }); }} />)}
            </div>
            <GuideSizeControl tool="brush" value={toolSizes.brush} active={tool === 'brush'} disabled={disabled} labels={t} onChange={value => setToolSizes(previous => ({ ...previous, brush: value }))} />
          </div>
        </div>
        <span className="draw-guide-switch-divider" aria-hidden="true"><Divider vertical /></span>
        {eraser}
        <div className="draw-guide-options" data-options-tool="eraser" data-expanded={tool === 'eraser'} inert={tool !== 'eraser'} aria-hidden={tool !== 'eraser'}>
          <div className="draw-guide-options-content">
            <GuideSizeControl tool="eraser" value={toolSizes.eraser} active={tool === 'eraser'} disabled={disabled} labels={eraserSizeCopy[locale]} onChange={value => setToolSizes(previous => ({ ...previous, eraser: value }))} />
          </div>
        </div>
      </div>
      <div className="draw-guide-actions">
        <Divider vertical />
        <Button size="m" className="draw-guide-tool" aria-label={t.undo} disabled={disabled || !past.current.length} onClick={undo}><Icon name="guideUndo" size={24} /></Button>
        <Button size="m" className="draw-guide-tool" aria-label={t.redo} disabled={disabled || !future.current.length} onClick={redo}><Icon name="guideRedo" size={24} /></Button>
        <Divider vertical />
        <Button size="m" className="draw-guide-clear" disabled={disabled || !strokes.length} onClick={() => commit([])}><Icon name="guideClear" size={20} />{t.clear}</Button>
        <Divider vertical />
        <Button size="m" className="draw-guide-cancel" variant="secondary" onClick={() => { cancelGesture(); onClose(); }}>{t.cancel}</Button>
        <Button size="m" className="draw-guide-save" variant="primary" disabled={disabled} onClick={saveGuide}>{t.save}</Button>
      </div>
    </div>
  </dialog>;
}
