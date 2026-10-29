import { imageBounds, type Bounds } from './canvas-selection';
import { AGENT_ROW_GAP } from './canvas-spacing';
import type { CanvasImage } from './useCanvas';

type Point = { x: number; y: number };

export function extendGenerationBounds(current: Bounds | null, next: Bounds): Bounds {
  if (!current) return { ...next };
  const x = Math.min(current.x, next.x), y = Math.min(current.y, next.y);
  return { x, y, width: Math.max(current.x + current.width, next.x + next.width) - x,
    height: Math.max(current.y + current.height, next.y + next.height) - y };
}

export function generationContentBounds(items: CanvasImage[]): Bounds | null {
  return items.reduce<Bounds | null>((bounds, item) => extendGenerationBounds(bounds, imageBounds(item)), null);
}

function overlaps(a: Bounds, b: Bounds) {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

// Read the scene once per insertion. Include offscreen objects, rotations and
// pending/failed images; only reserve new objects, never move existing ones.
export function createGenerationPlacement(existing: CanvasImage[], filenameTopSpace: number) {
  const topSpace = Number.isFinite(filenameTopSpace) ? Math.max(0, filenameTopSpace) : 0;
  let content: Bounds | null = null;
  const obstacles: Bounds[] = [];
  const reserve = (item: CanvasImage) => {
    const bounds = imageBounds(item);
    content = extendGenerationBounds(content, bounds);
    const nameSpace = item.shape ? 0 : topSpace;
    obstacles.push({ ...bounds, y: bounds.y - nameSpace, height: bounds.height + nameSpace });
  };
  existing.forEach(reserve);
  return {
    topSpace, reserve,
    position(size: { width: number; height: number }, viewport: Bounds, continuation?: Point): Point {
      // Only sequential results may continue their existing row. New batches
      // always start below all content; no positions around references are tried.
      if (continuation) {
        const bounds = { ...continuation, width: size.width, y: continuation.y - topSpace, height: size.height + topSpace };
        if (!obstacles.some(obstacle => overlaps(bounds, obstacle))) return continuation;
      }
      return content
        ? { x: continuation?.x ?? content.x, y: content.y + content.height + AGENT_ROW_GAP + topSpace }
        : { x: viewport.x + (viewport.width - size.width) / 2,
          y: viewport.y + (viewport.height - size.height + topSpace) / 2 };
    },
  };
}
