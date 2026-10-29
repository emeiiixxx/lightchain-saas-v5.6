import { imageBounds, selectionBounds, type Bounds } from './canvas-selection';
import { CANVAS_IMAGE_GAP } from './canvas-spacing';
import { createGenerationPlacement } from './generation-placement';
import type { CanvasImage } from './useCanvas';

// Place the entire row below all current content, without moving anything.
export function placeToolbarImageBatch(
  items: Omit<CanvasImage, 'x' | 'y'>[], existing: CanvasImage[], viewport: Bounds, filenameTopSpace: number,
  _referenceIds: string[] = [],
): CanvasImage[] {
  if (!items.length) return [];
  const scene = createGenerationPlacement(existing, filenameTopSpace);
  let right = 0;
  const row = items.map(item => {
    const bounds = imageBounds({ ...item, x: 0, y: 0 });
    const positioned = { ...item, x: right - bounds.x, y: -bounds.y };
    right += bounds.width + CANVAS_IMAGE_GAP;
    return positioned;
  });
  const bounds = selectionBounds(row);
  const position = scene.position(bounds, viewport);
  return row.map(item => ({ ...item, x: item.x + position.x, y: item.y + position.y }));
}
