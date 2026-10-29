import { imageBounds, type Bounds } from './canvas-selection';
import { AGENT_ROW_GAP, CANVAS_IMAGE_GAP as IMAGE_GAP } from './canvas-spacing';
import type { CanvasImage } from './useCanvas';

export type AgentPlacementOptions = {
  /** The last existing result in this generation round, for sequential output. */
  appendAfter?: CanvasImage;
  /** Fixed-screen filename height converted to world coordinates by the caller. */
  filenameTopSpace?: number;
};

function overlaps(a: Bounds, b: Bounds) {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function agentPlacementBaseline(existing: CanvasImage[]): Bounds | null {
  if (!existing.length) return null;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const item of existing) {
    const bounds = imageBounds(item);
    left = Math.min(left, bounds.x); top = Math.min(top, bounds.y);
    right = Math.max(right, bounds.x + bounds.width); bottom = Math.max(bottom, bounds.y + bounds.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function occupiedBounds(item: CanvasImage, filenameTopSpace: number): Bounds {
  const bounds = imageBounds(item);
  return { ...bounds, y: bounds.y - filenameTopSpace, height: bounds.height + filenameTopSpace };
}

export function placeAgentImageBatch(items: Omit<CanvasImage, 'x' | 'y'>[], existing: CanvasImage[], viewport: Bounds, options: AgentPlacementOptions = {}): CanvasImage[] {
  if (!items.length) return [];
  const filenameTopSpace = Number.isFinite(options.filenameTopSpace) ? Math.max(0, options.filenameTopSpace!) : 0;
  const center = { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 };
  const baseline = agentPlacementBaseline(existing);
  const boxes = items.map(item => imageBounds({ ...item, x: 0, y: 0 }));
  const rowWidth = boxes.reduce((width, box) => width + box.width, 0) + (items.length - 1) * IMAGE_GAP;
  const rowHeight = boxes.reduce((height, box) => Math.max(height, box.height), 0);
  const obstacles = existing.map(item => occupiedBounds(item, filenameTopSpace));
  const additions: CanvasImage[] = [];
  let previous = options.appendAfter ? imageBounds(options.appendAfter) : null;
  let bottom = baseline ? baseline.y + baseline.height : -Infinity;
  for (let index = 0; index < items.length; index++) {
    const item = items[index], box = boxes[index];
    const left = previous ? previous.x + previous.width + IMAGE_GAP : baseline?.x ?? center.x - rowWidth / 2;
    let top = previous ? previous.y : baseline
      ? bottom + AGENT_ROW_GAP + filenameTopSpace
      : center.y - (rowHeight + filenameTopSpace) / 2 + filenameTopSpace;
    const candidate = { x: left, y: top - filenameTopSpace, width: box.width, height: box.height + filenameTopSpace };
    // Each image reserves its position immediately. A conflict moves only this
    // image below every current object; its x and all earlier positions stay.
    if (obstacles.some(obstacle => overlaps(candidate, obstacle))) {
      top = bottom + AGENT_ROW_GAP + filenameTopSpace;
    }
    const placed = { ...item, x: left - box.x, y: top - box.y };
    additions.push(placed);
    previous = { x: left, y: top, width: box.width, height: box.height };
    obstacles.push({ ...previous, y: top - filenameTopSpace, height: box.height + filenameTopSpace });
    bottom = Math.max(bottom, top + box.height);
  }
  return additions;
}
