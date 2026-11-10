import { canvasMediaDisplayName } from '../../canvas-media-filename';
import { ProgressiveImage } from './ProgressiveImage';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Icon } from './ui';
import type { CanvasImage } from '../useCanvas';
import { messages, type Locale } from '../i18n';
import { useLocale } from '../LocaleContext';
import { FullImageStage } from '../../components/FullImageStage';
import { createViewerWheelZoom } from '../viewer-wheel-zoom';

export type FullImageViewerImage = Pick<CanvasImage, 'url' | 'name' | 'width' | 'height'>;
type Props = {
  details?: ReactNode; content?: ReactNode;
  image: FullImageViewerImage; locale: Locale; phase: 'enter' | 'exit'; onClose: () => void;
  images?: { url: string; name: string }[]; selectedIndex?: number; onSelect?: (index: number) => void;
};
export function FullImageViewer({ image, locale, phase, onClose, images = [], selectedIndex = 0, onSelect, details, content }: Props) {
  const { t: translate } = useLocale();
  const hasGallery = images.length > 1 && !!onSelect;
  const thumbnails = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const wheelZoom = useMemo(createViewerWheelZoom, [image.url, selectedIndex]);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const t = messages[locale];
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
  const fit = details
    ? Math.min(556 / image.width, 726 / image.height, Math.max(1, size.width - (size.width <= 680 ? 32 : 80)) / image.width, Math.max(1, size.height - 160) / image.height)
    : Math.min(size.width / image.width, size.height / image.height);
  // The canvas workbench disables pointer events; mount outside it so the
  // thumbnail buttons and image gestures receive their own pointer events.
  return createPortal(<dialog ref={dialog} className={`full-image-viewer${hasGallery ? ' full-image-viewer--gallery' : ''}${details ? ' full-image-viewer--task' : ''}`} data-phase={phase} data-node-id="68:27657" inert={phase === 'exit'} aria-label={`${t.viewFull} · ${canvasMediaDisplayName(image.name)}`}
    onCancel={event => { if (event.target !== event.currentTarget) return; event.preventDefault(); onClose(); }} onKeyDown={event => {
      if ((event.target instanceof Element && event.target.closest('[data-task-controls], input, textarea, [role=menu]')) || !hasGallery || phase === 'exit' || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      onSelect?.((selectedIndex + step + images.length) % images.length);
    }}>
    <FullImageStage key={`${selectedIndex}-${image.url}`} width={image.width * fit} height={image.height * fit} wheelFactor={wheelZoom.factor}>
      {content ?? <ProgressiveImage className="full-image-content" src={image.url} alt={canvasMediaDisplayName(image.name)} eager fit="contain" />}
    </FullImageStage>
    {hasGallery && !details && <nav ref={thumbnails} className="full-image-thumbnails" aria-label={translate('图片缩略图')}>
      {images.map((item, index) => <button key={item.url} type="button" aria-label={`${t.viewFull} · ${canvasMediaDisplayName(item.name)}`} aria-current={index === selectedIndex ? 'true' : undefined} onClick={() => onSelect?.(index)}>
        <ProgressiveImage src={item.url} alt="" fit="contain" eager />
      </button>)}
    </nav>}
    <div className="full-image-instructions" role="status" data-node-id="68:27757">{details ? (locale === 'en' ? '💡 Scroll to zoom and drag to explore. Press ESC to return to the canvas.' : locale === 'ja' ? '💡 スクロールで拡大・縮小、ドラッグで移動できます。ESC キーでキャンバスに戻れます' : '💡您可通过滚轮缩放和拖动查看，支持按 ESC 返回画布') : t.fullImageInstructions}</div>
    {details}
    {details ? <Button variant="outline" size="m" className="task-detail-back" onClick={onClose}><Icon name="task-detail-back" size={20} />{locale === 'en' ? 'Back to canvas' : locale === 'ja' ? 'キャンバスに戻る' : '返回画布'}</Button> : <Button className="full-image-close" aria-label={t.close} onClick={onClose} data-node-id="68:28013"><Icon name="close" size={20} /></Button>}
  </dialog>, document.body);
}
