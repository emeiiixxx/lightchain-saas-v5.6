// Pack visible standalone items in creation order using their actual sizes.
export function packStandaloneRows<T extends { width: number; height: number }>(items: readonly T[], rowWidth: number, gap = 40, maxItemsPerRow = Infinity): { placements: Array<{ item: T; x: number; y: number }>; width: number; height: number } {
  const placements: Array<{ item: T; x: number; y: number }> = [];
  const widthLimit = Number.isFinite(rowWidth) ? Math.max(0, rowWidth) : Infinity;
  const countLimit = Number.isFinite(maxItemsPerRow) ? Math.max(1, Math.floor(maxItemsPerRow)) : Infinity;
  let x = 0, y = 0, width = 0, rowHeight = 0, rowCount = 0;
  for (const item of items) {
    if (rowCount > 0 && (rowCount >= countLimit || x + gap + item.width > widthLimit)) {
      y += rowHeight + gap;
      x = 0; rowHeight = 0; rowCount = 0;
    }
    const itemX = rowCount ? x + gap : 0;
    placements.push({ item, x: itemX, y });
    x = itemX + item.width;
    width = Math.max(width, x);
    rowHeight = Math.max(rowHeight, item.height);
    rowCount++;
  }
  return { placements, width, height: placements.length ? y + rowHeight : 0 };
}
