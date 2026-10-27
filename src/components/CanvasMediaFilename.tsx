import type { CSSProperties } from 'react';
import { canvasMediaFilename } from '../canvas-media-filename';

export function CanvasMediaFilename({ name, url, kind = 'image' }: { name: string; url?: string; kind?: 'image' | 'video' }) {
  const icon = `${import.meta.env.BASE_URL}assets/canvas-media-filename/${kind}.svg`;
  return <div className="canvas-media-filename" data-node-id={kind === 'video' ? '3:1009' : '3:933'}>
    <span aria-hidden="true" className="canvas-media-filename-icon" style={{ '--filename-icon': `url("${icon}")` } as CSSProperties} />
    <span className="canvas-media-filename-text">{canvasMediaFilename(name, url)}</span>
  </div>;
}
