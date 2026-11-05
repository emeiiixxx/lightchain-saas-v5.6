import { imageBounds, selectionBounds, type Bounds } from './canvas-selection';
import { CANVAS_IMAGE_GAP } from './canvas-spacing';
import type { CanvasImage } from './useCanvas';

type Point = { x: number; y: number };

export function imageBatchFitZoom(bounds: Pick<Bounds, 'width' | 'height'>, viewport: { width: number; height: number }, filenameTopSpace: number, maxZoom = 1) {
  return Math.min(maxZoom, Math.max(1, viewport.width) / Math.max(1, bounds.width),
    Math.max(1, viewport.height - filenameTopSpace) / Math.max(1, bounds.height));
}

export function imageBatchSize(items: Omit<CanvasImage, 'x' | 'y'>[]) {
  const boxes = items.map(item => imageBounds({ ...item, x: 0, y: 0 }));
  return { width: boxes.reduce((sum, box) => sum + box.width, 0) + Math.max(0, boxes.length - 1) * CANVAS_IMAGE_GAP,
    height: boxes.reduce((height, box) => Math.max(height, box.height), 0) };
}

function addedImageRows(items: Omit<CanvasImage, 'x' | 'y'>[]) {
  const rows: { items: { item: Omit<CanvasImage, 'x' | 'y'>; bounds: Bounds }[]; width: number; height: number }[] = [];
  for (const item of items) {
    const bounds = imageBounds({ ...item, x: 0, y: 0 });
    let row = rows.at(-1);
    if (!row || row.items.length === 5) {
      row = { items: [], width: 0, height: 0 };
      rows.push(row);
    }
    row.width += (row.items.length ? CANVAS_IMAGE_GAP : 0) + bounds.width;
    row.height = Math.max(row.height, bounds.height);
    row.items.push({ item, bounds });
  }
  return rows;
}

export function addedImageBatchSize(items: Omit<CanvasImage, 'x' | 'y'>[]) {
  const rows = addedImageRows(items);
  return { width: rows.reduce((width, row) => Math.max(width, row.width), 0),
    height: rows.reduce((height, row) => height + row.height, 0) + Math.max(0, rows.length - 1) * CANVAS_IMAGE_GAP,
    rowCount: rows.length };
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
  let rowTop = 0;
  const positioned = addedImageRows(items).flatMap(row => {
    let right = 0;
    const images = row.items.map(({ item, bounds }) => {
      const image = { ...item, x: right - bounds.x, y: rowTop - bounds.y };
      right += bounds.width + CANVAS_IMAGE_GAP;
      return image;
    });
    rowTop += row.height + CANVAS_IMAGE_GAP + options.filenameTopSpace;
    return images;
  });
  const bounds = selectionBounds(positioned);
  const previous = existing.length ? selectionBounds(existing) : null;
  const left = options.point?.x ?? previous?.x ?? viewport.x + (viewport.width - bounds.width) / 2;
  const top = options.point?.y ?? (previous
    ? previous.y + previous.height + CANVAS_IMAGE_GAP + options.filenameTopSpace
    : viewport.y + (viewport.height - bounds.height + options.filenameTopSpace) / 2);
  return positioned.map(item => ({ ...item, x: item.x + left, y: item.y + top }));
}
