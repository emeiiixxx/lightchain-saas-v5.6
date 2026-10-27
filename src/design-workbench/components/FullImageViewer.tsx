import { ProgressiveImage } from './ProgressiveImage';
import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Button, Icon } from './ui';
import type { CanvasImage } from '../useCanvas';
import { messages, type Locale } from '../i18n';
import { useLocale } from '../LocaleContext';

type Props = {
  details?: ReactNode; content?: ReactNode;
  image: Pick<CanvasImage, 'url' | 'name' | 'width' | 'height'>; locale: Locale; phase: 'enter' | 'exit'; onClose: () => void;
  images?: { url: string; name: string }[]; selectedIndex?: number; onSelect?: (index: number) => void;
};
export function FullImageViewer({ image, locale, phase, onClose, images = [], selectedIndex = 0, onSelect, details, content }: Props) {
  const { t: translate } = useLocale();
  const hasGallery = images.length > 1 && !!onSelect;
  const thumbnails = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointer: number; clientX: number; clientY: number; x: number; y: number } | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0, zoom: 1 });
  const current = useRef(position); current.current = position;
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const t = messages[locale];
  useLayoutEffect(() => {
    setPosition({ x: 0, y: 0, zoom: 1 });
    gesture.current = null;
    setDragging(false);
  }, [image.url]);
  useEffect(() => {
    thumbnails.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedIndex]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); element.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const element = stage.current!;
    const wheel = (event: WheelEvent) => {
      if (element.closest('[inert]')) return;
      event.preventDefault(); event.stopPropagation();
      const rect = element.getBoundingClientRect();
      const px = event.clientX - rect.left - rect.width / 2;
      const py = event.clientY - rect.top - rect.height / 2;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      setPosition(previous => {
        const zoom = Math.max(.1, Math.min(8, previous.zoom * Math.exp(-Math.max(-600, Math.min(600, delta)) * .0015)));
        const ratio = zoom / previous.zoom;
        return { zoom, x: px - (px - previous.x) * ratio, y: py - (py - previous.y) * ratio };
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (phase === 'exit' || event.button !== 0) return;
    event.preventDefault();
    gesture.current = { pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: current.current.x, y: current.current.y };
    event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointer !== event.pointerId) return;
    setPosition(previous => ({ ...previous, x: g.x + event.clientX - g.clientX, y: g.y + event.clientY - g.clientY }));
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointer !== event.pointerId) return;
    gesture.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const fit = Math.min((details ? 556 : 800) / image.width, (details ? 726 : 800) / image.height, Math.max(1, size.width - (size.width <= 680 ? 32 : 80)) / image.width, Math.max(1, size.height - 160) / image.height);
  // The canvas workbench disables pointer events; mount outside it so the
  // thumbnail buttons and image gestures receive their own pointer events.
  return createPortal(<dialog ref={dialog} className={`full-image-viewer${hasGallery ? ' full-image-viewer--gallery' : ''}${details ? ' full-image-viewer--task' : ''}`} data-phase={phase} data-node-id="68:27657" inert={phase === 'exit'} aria-label={`${t.viewFull} · ${image.name}`}
    onCancel={event => { if (event.target !== event.currentTarget) return; event.preventDefault(); onClose(); }} onKeyDown={event => {
      if ((event.target instanceof Element && event.target.closest('[data-task-controls], input, textarea, [role=menu]')) || !hasGallery || phase === 'exit' || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      onSelect?.((selectedIndex + step + images.length) % images.length);
    }}>
    <div ref={stage} className={`full-image-stage${dragging ? ' is-panning' : ''}`} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
      <div className="full-image-center" style={{ width: image.width * fit, height: image.height * fit }}>
        {content ?? <ProgressiveImage className="full-image-content" src={image.url} alt={image.name} eager fit="contain" style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${position.zoom})` }} />}
      </div>
    </div>
    {hasGallery && !details && <nav ref={thumbnails} className="full-image-thumbnails" aria-label={translate('图片缩略图')}>
      {images.map((item, index) => <button key={item.url} type="button" aria-label={`${t.viewFull} · ${item.name}`} aria-current={index === selectedIndex ? 'true' : undefined} onClick={() => onSelect?.(index)}>
        <ProgressiveImage src={item.url} alt="" fit="contain" eager />
      </button>)}
    </nav>}
    <div className="full-image-instructions" role="status" data-node-id="68:27757">{details ? (locale === 'en' ? '💡 Scroll to zoom and drag to explore. Press ESC to return to the canvas.' : locale === 'ja' ? '💡 スクロールで拡大・縮小、ドラッグで移動できます。ESC キーでキャンバスに戻れます' : '💡您可通过滚轮缩放和拖动查看，支持按 ESC 返回画布') : t.fullImageInstructions}</div>
    {details}
    {details ? <Button variant="outline" size="m" className="task-detail-back" onClick={onClose}><Icon name="task-detail-back" size={20} />{locale === 'en' ? 'Back to canvas' : locale === 'ja' ? 'キャンバスに戻る' : '返回画布'}</Button> : <Button className="full-image-close" aria-label={t.close} onClick={onClose} data-node-id="68:28013"><Icon name="close" size={20} /></Button>}
  </dialog>, document.body);
}
