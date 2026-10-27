import type { Bounds } from './canvas-selection';

export const canvasLayouts = [
  { value: 'compact', label: '紧凑分布', en: 'Compact arrangement', ja: 'コンパクト配置' },
  { value: 'horizontal', label: '水平分布', en: 'Horizontal arrangement', ja: '横に配置' },
  { value: 'vertical', label: '垂直分布', en: 'Vertical arrangement', ja: '縦に配置' },
] as const;

export type CanvasLayout = typeof canvasLayouts[number]['value'];

export const arrangementGap = 40;

/** Positions use world coordinates relative to the selection's top-left corner. */
export function arrangeBoxes(boxes: Bounds[], layout: CanvasLayout, aspectRatio: number) {
  if (!boxes.length) return [];
  if (layout === 'compact') return packBoxes(boxes, aspectRatio);
  const count = boxes.length;
  const columns = layout === 'horizontal' ? count : 1;
  const columnWidths = Array.from({ length: Math.min(columns, count) }, () => 0);
  const rowHeights = Array.from({ length: Math.ceil(count / columns) }, () => 0);
  boxes.forEach((box, index) => {
    columnWidths[index % columns] = Math.max(columnWidths[index % columns], box.width);
    rowHeights[Math.floor(index / columns)] = Math.max(rowHeights[Math.floor(index / columns)], box.height);
  });
  let x = 0, y = 0;
  const columnX = columnWidths.map(width => { const start = x; x += width + arrangementGap; return start; });
  const rowY = rowHeights.map(height => { const start = y; y += height + arrangementGap; return start; });
  return boxes.map((_, index) => ({ x: columnX[index % columns], y: rowY[Math.floor(index / columns)] }));
}

/** Order-preserving free-rectangle packing; never rotates or resizes an item. */
function packBoxes(boxes: Bounds[], aspectRatio: number) {
  const gap = arrangementGap;
  const ratio = Math.max(0.5, Math.min(2.5, aspectRatio || 1));
  // Padding on the right and bottom reserves the gap when rectangles touch.
  const items = boxes.map((box, index) => ({ index, width: box.width + gap, height: box.height + gap }));
  const minWidth = Math.max(...items.map(item => item.width));
  const maxWidth = items.reduce((sum, item) => sum + item.width, 0);
  const maxHeight = items.reduce((sum, item) => sum + item.height, 0);
  const idealWidth = Math.sqrt(items.reduce((sum, item) => sum + item.width * item.height, 0) * ratio);
  const widths = [...new Set([minWidth, ...Array.from({ length: 13 }, (_, index) =>
    Math.max(minWidth, Math.min(maxWidth, idealWidth * (0.6 + index * 0.1))))])];
  let best: { x: number; y: number }[] = [];
  let bestScore = Infinity;
  for (const width of widths) {
    let free: Bounds[] = [{ x: 0, y: 0, width, height: maxHeight }];
    const positions = new Array<{ x: number; y: number }>(boxes.length);
    let usedWidth = 0, usedHeight = 0;
    let previous = { x: -Infinity, y: -Infinity };
    for (const item of items) {
      // Never backfill an earlier reading position and change the layer-based sequence.
      // Topmost, then leftmost available position keeps the result predictable.
      const space = free.filter(rect => rect.width >= item.width && rect.height >= item.height
          && (rect.y > previous.y || rect.y === previous.y && rect.x >= previous.x))
        .sort((a, b) => a.y - b.y || a.x - b.x || a.width * a.height - b.width * b.height)[0];
      if (!space) break;
      const placed = { x: space.x, y: space.y, width: item.width, height: item.height };
      positions[item.index] = { x: placed.x, y: placed.y };
      previous = positions[item.index];
      usedWidth = Math.max(usedWidth, placed.x + item.width);
      usedHeight = Math.max(usedHeight, placed.y + item.height);
      const right = placed.x + placed.width, bottom = placed.y + placed.height;
      const split: Bounds[] = [];
      for (const rect of free) {
        const rectRight = rect.x + rect.width, rectBottom = rect.y + rect.height;
        if (placed.x >= rectRight || right <= rect.x || placed.y >= rectBottom || bottom <= rect.y) {
          split.push(rect); continue;
        }
        if (placed.x > rect.x) split.push({ ...rect, width: placed.x - rect.x });
        if (right < rectRight) split.push({ ...rect, x: right, width: rectRight - right });
        if (placed.y > rect.y) split.push({ ...rect, height: placed.y - rect.y });
        if (bottom < rectBottom) split.push({ ...rect, y: bottom, height: rectBottom - bottom });
      }
      // Free rectangles can overlap; discard contained duplicates after every placement.
      free = split.filter((rect, i) => !split.some((other, j) => i !== j
        && other.x <= rect.x && other.y <= rect.y
        && other.x + other.width >= rect.x + rect.width && other.y + other.height >= rect.y + rect.height
        && (j < i || other.x !== rect.x || other.y !== rect.y || other.width !== rect.width || other.height !== rect.height)));
    }
    if (positions.filter(Boolean).length !== boxes.length) continue;
    const contentWidth = usedWidth - gap, contentHeight = usedHeight - gap;
    // Balance empty area against an excessively long strip on either axis.
    const score = contentWidth * contentHeight * (1 + 0.3 * Math.abs(Math.log(contentWidth / contentHeight / ratio)));
    if (score < bestScore) { bestScore = score; best = positions; }
  }
  // A vertical stack remains valid even if floating-point edge cases reject every trial.
  if (best.length) return best;
  let y = 0;
  return boxes.map(box => { const position = { x: 0, y }; y += box.height + gap; return position; });
}
