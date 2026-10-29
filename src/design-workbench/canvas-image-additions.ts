import { imageBounds, selectionBounds, type Bounds } from './canvas-selection';
import { CANVAS_IMAGE_GAP } from './canvas-spacing';
import type { CanvasImage } from './useCanvas';

type Point = { x: number; y: number };

export function imageBatchFitZoom(bounds: Pick<Bounds, 'width' | 'height'>, viewport: { width: number; height: number }, filenameTopSpace: number) {
  return Math.min(1, Math.max(1, viewport.width) / Math.max(1, bounds.width),
    Math.max(1, viewport.height - filenameTopSpace) / Math.max(1, bounds.height));
}

// Logical creation groups are independent of the user's selectable layer groups.
export function restoreCanvasContentGroups(items: CanvasImage[]): CanvasImage[] {
  const byId = new Map(items.map(item => [item.id, item]));
  const resolved = new Map<string, string>();
  const resolve = (item: CanvasImage, visited = new Set<string>()): string => {
    const known = resolved.get(item.id) ?? item.contentGroupId;
    if (known) return known;
    visited.add(item.id);
    const parent = byId.get(item.generationParentId ?? '');
    const group = item.agentConversationId ? `agent:${item.agentConversationId}`
      : item.generationPlacement === 'agent' ? `agent:legacy-agent:${item.generationBatchId ?? item.id}`
      : parent && !visited.has(parent.id) ? resolve(parent, visited)
      : `added:${item.additionBatchId ?? item.id}`;
    resolved.set(item.id, group);
    return group;
  };
  return items.map(item => ({ ...item, contentGroupId: resolve(item) }));
}

export function placeAddedImages(items: Omit<CanvasImage, 'x' | 'y'>[], existing: CanvasImage[], viewport: Bounds,
  options: { point?: Point; filenameTopSpace: number }): CanvasImage[] {
  if (!items.length) return [];
  let right = 0;
  const row = items.map(item => {
    const bounds = imageBounds({ ...item, x: 0, y: 0 });
    const positioned = { ...item, x: right - bounds.x, y: -bounds.y };
    right += bounds.width + CANVAS_IMAGE_GAP;
    return positioned;
  });
  const bounds = selectionBounds(row);
  const previous = existing.length ? selectionBounds(existing) : null;
  const left = options.point?.x ?? previous?.x ?? viewport.x + (viewport.width - bounds.width) / 2;
  const top = options.point?.y ?? (previous
    ? previous.y + previous.height + CANVAS_IMAGE_GAP + options.filenameTopSpace
    : viewport.y + (viewport.height - bounds.height + options.filenameTopSpace) / 2);
  return row.map(item => ({ ...item, x: item.x + left, y: item.y + top }));
}
