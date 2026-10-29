import { imageBounds, selectionBounds, type Bounds } from './canvas-selection';
import { CANVAS_IMAGE_GAP, TOOLBAR_ROW_GAP } from './canvas-spacing';
import type { CanvasImage } from './useCanvas';

// Toolbar tasks reserve their complete result row below the current canvas.
// The existing scene is only read for its bounds and is never repositioned.
export function placeToolbarImageBatch(
  items: Omit<CanvasImage, 'x' | 'y'>[], existing: CanvasImage[], viewport: Bounds, filenameTopSpace: number,
): CanvasImage[] {
  if (!items.length) return [];
  const topSpace = Number.isFinite(filenameTopSpace) ? Math.max(0, filenameTopSpace) : 0;
  let right = 0;
  const row = items.map(item => {
    const bounds = imageBounds({ ...item, x: 0, y: 0 });
    const positioned = { ...item, x: right - bounds.x, y: -bounds.y };
    right += bounds.width + CANVAS_IMAGE_GAP;
    return positioned;
  });
  const bounds = selectionBounds(row);
  const content = existing.length ? selectionBounds(existing) : null;
  const left = content?.x ?? viewport.x + (viewport.width - bounds.width) / 2;
  const top = content ? content.y + content.height + TOOLBAR_ROW_GAP + topSpace
    : viewport.y + (viewport.height - bounds.height + topSpace) / 2;
  return row.map(item => ({ ...item, x: item.x + left, y: item.y + top }));
}
