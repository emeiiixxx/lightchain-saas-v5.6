import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import { reorderVideoReferences, videoWorkflowReferences, type VideoReference, type VideoWorkflow } from '../video-workflow';

type Kind = VideoReference['kind'];
type Drag = { id: string; kind: Kind; targetId: string };
type Position = { x: number; y: number };

/** Native drag keeps its source mounted; only the grid order changes until drop. */
export function useVideoReferenceSort(node: VideoWorkflow, onChange: (patch: Partial<VideoWorkflow>) => void) {
  const [preview, setPreview] = useState<Drag | null>(null);
  const drag = useRef<Drag | null>(null);
  const current = useRef({ node, onChange });
  current.current = { node, onChange };
  const rows = useRef(new Map<Kind, HTMLDivElement>());
  const tiles = useRef(new Map<string, HTMLDivElement>());
  const animations = useRef(new Map<string, Animation>());
  const before = useRef<Map<string, Position> | null>(null);
  const pointer = useRef<{ kind: Kind; x: number; y: number } | null>(null);
  const scrollFrame = useRef(0);

  function position(tile: HTMLElement): Position {
    const row = tile.parentElement!;
    const bounds = row.getBoundingClientRect();
    const rect = tile.getBoundingClientRect();
    const scale = bounds.width / row.offsetWidth || 1;
    // Scroll and canvas zoom must not be mistaken for an item changing slots.
    return { x: (rect.left - bounds.left) / scale + row.scrollLeft, y: (rect.top - bounds.top) / scale + row.scrollTop };
  }

  function capture() {
    before.current = new Map([...tiles.current].map(([id, tile]) => [id, position(tile)]));
  }

  useLayoutEffect(() => {
    const positions = before.current;
    before.current = null;
    if (!positions) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const [id, tile] of tiles.current) {
      animations.current.get(id)?.cancel();
      animations.current.delete(id);
      const previous = positions.get(id);
      if (!previous || reduced) continue;
      const next = position(tile);
      const x = previous.x - next.x;
      const y = previous.y - next.y;
      if (Math.abs(x) < .1 && Math.abs(y) < .1) continue;
      const animation = tile.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }], { duration: 200, easing: 'ease-out' });
      animations.current.set(id, animation);
      animation.onfinish = () => { if (animations.current.get(id) === animation) animations.current.delete(id); };
    }
  });

  useEffect(() => () => {
    cancelAnimationFrame(scrollFrame.current);
    for (const animation of animations.current.values()) animation.cancel();
  }, []);

  function stopScroll() {
    cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = 0;
    pointer.current = null;
  }

  function end() {
    stopScroll();
    if (!drag.current) return;
    // Release commits the final slots immediately; only drag-over previews
    // animate. Clear pending FLIP work and any in-flight neighbor movement.
    before.current = null;
    for (const animation of animations.current.values()) animation.cancel();
    animations.current.clear();
    drag.current = null;
    setPreview(null);
  }

  function targetAt(row: HTMLElement, kind: Kind, clientX: number, clientY: number) {
    const items = videoWorkflowReferences(current.current.node).filter(item => item.kind === kind);
    const bounds = row.getBoundingClientRect();
    const scale = bounds.width / row.offsetWidth || 1;
    const style = getComputedStyle(row);
    const first = items[0];
    const width = (first ? tiles.current.get(first.id)?.offsetWidth : undefined) ?? 64;
    const gap = Number.parseFloat(style.columnGap) || 0;
    const localX = (clientX - bounds.left) / scale + row.scrollLeft - (Number.parseFloat(style.paddingLeft) || 0);
    const localY = (clientY - bounds.top) / scale + row.scrollTop - (Number.parseFloat(style.paddingTop) || 0);
    const height = Number.parseFloat(style.gridAutoRows) || (first ? tiles.current.get(first.id)?.offsetHeight : undefined) || 64;
    const rowGap = Number.parseFloat(style.rowGap) || 0;
    const column = Math.max(0, Math.min(3, Math.round((localX - width / 2) / (width + gap))));
    const rowIndex = Math.max(0, Math.round((localY - height / 2) / (height + rowGap)));
    // Fixed slots, rather than animated elements, prevent hover oscillation.
    const index = Math.min(items.length - 1, rowIndex * 4 + column);
    return items[index]?.id;
  }

  function previewAt(row: HTMLElement, kind: Kind, clientX: number, clientY: number) {
    const active = drag.current;
    const targetId = targetAt(row, kind, clientX, clientY);
    if (!active || active.kind !== kind || !targetId || targetId === active.targetId) return;
    capture();
    drag.current = { ...active, targetId };
    setPreview(drag.current);
  }

  function startScroll() {
    if (scrollFrame.current) return;
    let last = performance.now();
    const tick = (now: number) => {
      scrollFrame.current = 0;
      const point = pointer.current;
      if (!drag.current || !point) return;
      const row = rows.current.get(point.kind);
      if (!row) return;
      const bounds = row.getBoundingClientRect();
      const scale = bounds.width / row.offsetWidth || 1;
      const edge = 28 * scale;
      const inside = point.y >= bounds.top && point.y <= bounds.bottom && point.x >= bounds.left && point.x <= bounds.right;
      const velocityX = !inside || row.scrollWidth <= row.clientWidth ? 0 : point.x < bounds.left + edge ? -1 : point.x > bounds.right - edge ? 1 : 0;
      const velocityY = !inside || row.scrollHeight <= row.clientHeight ? 0 : point.y < bounds.top + edge ? -1 : point.y > bounds.bottom - edge ? 1 : 0;
      const delta = Math.min(32, now - last);
      last = now;
      if (velocityX || velocityY) {
        row.scrollLeft += velocityX * delta * .45;
        row.scrollTop += velocityY * delta * .45;
        previewAt(row, point.kind, point.x, point.y);
      }
      scrollFrame.current = requestAnimationFrame(tick);
    };
    scrollFrame.current = requestAnimationFrame(tick);
  }

  function begin(event: DragEvent<HTMLDivElement>, reference: VideoReference) {
    if ((event.target as Element).closest('.video-reference-remove')) { event.preventDefault(); return; }
    event.stopPropagation();
    drag.current = { id: reference.id, kind: reference.kind, targetId: reference.id };
    setPreview(drag.current);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-lightchain-video-reference', JSON.stringify({ nodeId: node.id, id: reference.id }));
  }

  function over(event: DragEvent<HTMLDivElement>, kind: Kind) {
    if (!drag.current) return;
    event.stopPropagation();
    if (drag.current.kind !== kind) { event.dataTransfer.dropEffect = 'none'; stopScroll(); return; }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    pointer.current = { kind, x: event.clientX, y: event.clientY };
    previewAt(event.currentTarget, kind, event.clientX, event.clientY);
    if (event.currentTarget.scrollWidth > event.currentTarget.clientWidth || event.currentTarget.scrollHeight > event.currentTarget.clientHeight) startScroll();
  }

  function leave(event: DragEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) stopScroll();
  }

  function drop(event: DragEvent<HTMLDivElement>, kind: Kind) {
    const active = drag.current;
    if (!active) return;
    event.stopPropagation();
    if (active.kind !== kind) { end(); return; }
    event.preventDefault();
    const targetId = targetAt(event.currentTarget, kind, event.clientX, event.clientY);
    end();
    if (targetId && active.id !== targetId) current.current.onChange({ referenceOrder: reorderVideoReferences(current.current.node, kind, active.id, targetId) });
  }

  function move(kind: Kind, sourceId: string, targetId: string) {
    if (sourceId === targetId || drag.current) return;
    capture();
    current.current.onChange({ referenceOrder: reorderVideoReferences(current.current.node, kind, sourceId, targetId) });
  }

  const order = preview ? reorderVideoReferences(node, preview.kind, preview.id, preview.targetId) : videoWorkflowReferences(node).map(item => item.id);
  return {
    dragId: preview?.id,
    order,
    begin, over, leave, drop, end, move,
    row: (kind: Kind, element: HTMLDivElement | null) => { if (element) rows.current.set(kind, element); else rows.current.delete(kind); },
    tile: (id: string, element: HTMLDivElement | null) => { if (element) tiles.current.set(id, element); else tiles.current.delete(id); },
  };
}
