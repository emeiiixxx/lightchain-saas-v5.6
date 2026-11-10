import { canvasMediaDisplayName } from '../canvas-media-filename';
import { ProgressiveImage } from './ProgressiveImage';
import { useEffect, useState } from 'react';
import { FullImageStage } from './FullImageStage';
import { FullScreenViewer } from './FullScreenViewer';
import type { CanvasImage } from '../canvas';
import { messages, type Locale } from '../i18n';

type Props = { image: CanvasImage; locale: Locale; phase: 'enter' | 'exit'; onClose: () => void };
export function FullImageViewer({ image, locale, phase, onClose }: Props) {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const t = messages[locale];
  useEffect(() => {
    const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const fit = Math.min(800 / image.width, 800 / image.height, Math.max(1, size.width - (size.width <= 680 ? 32 : 80)) / image.width, Math.max(1, size.height - 160) / image.height);
  return <FullScreenViewer label={`${t.viewFull} · ${canvasMediaDisplayName(image.name)}`} closeLabel={t.close} phase={phase} onClose={onClose} nodeId="68:27657" closeNodeId="68:28013">
    <FullImageStage key={image.url} width={image.width * fit} height={image.height * fit}>
      <ProgressiveImage className="full-image-content" src={image.url} alt={canvasMediaDisplayName(image.name)} eager fit="contain" />
    </FullImageStage>
    <div className="full-image-instructions" role="status" data-node-id="68:27757">{t.fullImageInstructions}</div>
  </FullScreenViewer>;
}
