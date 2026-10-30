import { EditableFilename } from './EditableFilename';
import type { CSSProperties } from 'react';
import { canvasMediaFilename } from '../canvas-media-filename';

export function CanvasMediaFilename({ name, url, kind = 'image', onRename }: { name: string; url?: string; kind?: 'image' | 'video'; onRename?: (name: string) => void }) {
  const icon = `${import.meta.env.BASE_URL}assets/canvas-media-filename/${kind}.svg`;
  const filename = canvasMediaFilename(name, url);
  return <div className="canvas-media-filename" data-node-id={kind === 'video' ? '3:1009' : '3:933'}>
    <span aria-hidden="true" className="canvas-media-filename-icon" style={{ '--filename-icon': `url("${icon}")` } as CSSProperties} />
    <EditableFilename className="canvas-media-filename-text" name={filename} onRename={onRename} />
  </div>;
}
