import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { EditableFilename } from '../../components/EditableFilename';
import { canMoveCanvasLayer, canvasLayerUnits, type CanvasLayerEdge, type CanvasLayerTarget } from '../canvas-layers';
import { useLocale } from '../LocaleContext';
import type { CanvasImage } from '../useCanvas';
import { ShapeIcon } from './ShapeToolMenu';
import { Icon } from './ui';

type DropPosition = { target: CanvasLayerTarget; edge: CanvasLayerEdge };
const keyOf = (target: CanvasLayerTarget) => `${target.kind}:${target.id}`;
const layerDragType = 'application/x-lightchain-canvas-layer';

export function CanvasLayerList({ images, selectedIds, disabled = false, onSelectImage, onRenameImage, onReorder }: {
  images: CanvasImage[]; selectedIds: string[]; disabled?: boolean;
  onSelectImage: (id: string) => void; onRenameImage: (id: string, name: string) => void;
  onReorder: (source: CanvasLayerTarget, target: CanvasLayerTarget, edge: CanvasLayerEdge) => void;
}) {
  const { t } = useLocale();
  const units = useMemo(() => canvasLayerUnits(images), [images]);
  const groupNumbers = useMemo(() => new Map(units.filter(unit => unit.kind === 'group')
    .sort((a, b) => Math.min(...a.images.map(image => image.groupedAt ?? image.addedAt ?? 0))
      - Math.min(...b.images.map(image => image.groupedAt ?? image.addedAt ?? 0)) || a.id.localeCompare(b.id))
    .map((unit, index) => [unit.id, index + 1])), [units]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [dragging, setDragging] = useState<CanvasLayerTarget | null>(null);
  const source = useRef<CanvasLayerTarget | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);
  const suppressClick = useRef(false);
  const clearDrag = useCallback(() => { source.current = null; setDragging(null); setDropPosition(null); }, []);

  useEffect(() => {
    if (!dragging) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); clearDrag();
    };
    window.addEventListener('blur', clearDrag);
    window.addEventListener('dragend', clearDrag);
    window.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('blur', clearDrag);
      window.removeEventListener('dragend', clearDrag);
      window.removeEventListener('keydown', escape, true);
    };
  }, [dragging, clearDrag]);
  useEffect(() => { if (disabled) clearDrag(); }, [disabled, clearDrag]);

  const startDrag = (event: DragEvent<HTMLDivElement>, target: CanvasLayerTarget) => {
    if (disabled || event.currentTarget.contains(document.activeElement)
      && document.activeElement?.matches('input, textarea, [contenteditable="true"]')) {
      event.preventDefault(); return;
    }
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(layerDragType, keyOf(target));
    source.current = target; suppressClick.current = true; setDragging(target);
  };
  const findDrop = (event: DragEvent<HTMLDivElement>): DropPosition | null => {
    const from = source.current;
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-layer-kind]') : null;
    if (!from || !row || disabled) return null;
    const fromImage = from.kind === 'image' ? images.find(image => image.id === from.id) : undefined;
    // A root item moves around whole groups, even when hovering their children.
    const anchor = fromImage?.groupId ? row : row.closest<HTMLElement>('[data-layer-unit]');
    if (!anchor) return null;
    const target: CanvasLayerTarget = { kind: anchor.dataset.layerKind as CanvasLayerTarget['kind'], id: anchor.dataset.layerId! };
    if (!canMoveCanvasLayer(images, from, target)) return null;
    const bounds = anchor.getBoundingClientRect();
    return { target, edge: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after' };
  };
  const marker = (target: CanvasLayerTarget) => dropPosition && keyOf(dropPosition.target) === keyOf(target) ? dropPosition.edge : undefined;
  const imageRow = (image: CanvasImage, child = false) => {
    const target: CanvasLayerTarget = { kind: 'image', id: image.id };
    const selected = selectedIds.includes(image.id);
    const isDragging = dragging && (keyOf(dragging) === keyOf(target) || dragging.kind === 'group' && dragging.id === image.groupId);
    return <div key={image.id} className={`canvas-layer-row${child ? ' canvas-layer-row--child' : ''}${selected ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}`}
      data-layer-kind="image" data-layer-id={image.id} data-layer-unit={child ? undefined : ''} data-drop-edge={marker(target)}
      role="button" tabIndex={0} aria-pressed={selected} draggable={!disabled}
      onDragStart={event => startDrag(event, target)} onDragEnd={clearDrag}
      onClick={() => onSelectImage(image.id)} onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectImage(image.id); }
      }}>
      <span className="canvas-layer-icon">{image.shape ? <ShapeIcon kind={image.shape.kind} /> : <Icon name="canvas-image-name" size={20} />}</span>
      {image.generating || image.generationFailed ? <span className="canvas-layer-name">{t(image.generating ? '生成中' : '生成失败')}</span>
        : <EditableFilename name={image.name} onRename={image.shape ? undefined : name => onRenameImage(image.id, name)} />}
    </div>;
  };

  return <div className="canvas-layer-list" onPointerDownCapture={() => { suppressClick.current = false; }}
    onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); } }}
    onDragOver={event => {
      if (!source.current && !event.dataTransfer.types.includes(layerDragType)) return;
      event.preventDefault(); event.stopPropagation();
      const position = findDrop(event);
      event.dataTransfer.dropEffect = position ? 'move' : 'none';
      setDropPosition(previous => previous?.edge === position?.edge && previous?.target.kind === position?.target.kind
        && previous?.target.id === position?.target.id ? previous : position);
    }} onDragLeave={event => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropPosition(null);
    }} onDrop={event => {
      if (!source.current && !event.dataTransfer.types.includes(layerDragType)) return;
      event.preventDefault(); event.stopPropagation();
      const position = findDrop(event), from = source.current;
      clearDrag();
      if (from && position) onReorder(from, position.target, position.edge);
    }}>
    {!images.length ? <div className="left-panel-placeholder">{t('暂无图层')}</div> : units.map(unit => {
      if (unit.kind === 'image') return imageRow(unit.images[0]);
      const open = !collapsed.has(unit.id);
      const selected = unit.images.every(image => selectedIds.includes(image.id));
      const isDragging = dragging?.kind === 'group' && dragging.id === unit.id;
      return <div key={`group:${unit.id}`} className="canvas-layer-group" data-layer-unit="" data-layer-kind="group" data-layer-id={unit.id} data-drop-edge={marker(unit)}>
        <div className={`canvas-layer-row canvas-layer-row--group${selected ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}`}
          role="button" tabIndex={0} aria-pressed={selected} draggable={!disabled} onDragStart={event => startDrag(event, unit)} onDragEnd={clearDrag}
          onClick={() => onSelectImage(unit.images[0].id)} onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectImage(unit.images[0].id); }
          }}>
          <button type="button" className="canvas-layer-toggle" aria-label={t(open ? '收起分组' : '展开分组')} aria-expanded={open}
            onClick={event => { event.stopPropagation(); setCollapsed(previous => { const next = new Set(previous); if (open) next.add(unit.id); else next.delete(unit.id); return next; }); }}
            onKeyDown={event => event.stopPropagation()} onDragStart={event => event.preventDefault()}>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
          </button>
          <svg className="canvas-layer-icon" viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true"><rect x="2" y="2" width="16" height="16" rx="5" strokeDasharray="2 3" /></svg>
          <span className="canvas-layer-name">{t('分组')}{groupNumbers.get(unit.id)}</span>
        </div>
        {open && unit.images.map(image => imageRow(image, true))}
      </div>;
    })}
  </div>;
}
