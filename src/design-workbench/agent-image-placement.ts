import { imageBounds, type Bounds } from './canvas-selection';
import { CANVAS_IMAGE_GAP as IMAGE_GAP } from './canvas-spacing';
import { createGenerationPlacement, generationContentBounds } from './generation-placement';
import type { CanvasImage } from './useCanvas';

export type AgentPlacementOptions = {
  /** The last existing result in this generation round, for sequential output. */
  appendAfter?: CanvasImage;
  /** Retained for callers; reference identities do not determine placement. */
  referenceIds?: string[];
  /** Fixed-screen filename height converted to world coordinates by the caller. */
  filenameTopSpace?: number;
};

export const agentPlacementBaseline = generationContentBounds;

export function placeAgentImageBatch(items: Omit<CanvasImage, 'x' | 'y'>[], existing: CanvasImage[], viewport: Bounds, options: AgentPlacementOptions = {}): CanvasImage[] {
  if (!items.length) return [];
  const scene = createGenerationPlacement(existing, options.filenameTopSpace ?? 0);
  const boxes = items.map(item => imageBounds({ ...item, x: 0, y: 0 }));
  const rowSize = { width: boxes.reduce((width, box) => width + box.width, 0) + (items.length - 1) * IMAGE_GAP,
    height: boxes.reduce((height, box) => Math.max(height, box.height), 0) };
  const previousImage = options.appendAfter && existing.find(item => item.id === options.appendAfter!.id);
  let previous = previousImage ? imageBounds(previousImage) : null;
  const additions: CanvasImage[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index], box = boxes[index];
    const continuation = previous ? { x: previous.x + previous.width + IMAGE_GAP, y: previous.y } : undefined;
    // An empty canvas centers the whole supplied row; live Agent output still
    // passes only the one image whose dimensions have become known.
    const position = scene.position(!existing.length && !additions.length ? rowSize : box, viewport, continuation);
    const placed = { ...item, x: position.x - box.x, y: position.y - box.y };
    additions.push(placed);
    previous = { ...position, width: box.width, height: box.height };
    scene.reserve(placed);
  }
  return additions;
}
