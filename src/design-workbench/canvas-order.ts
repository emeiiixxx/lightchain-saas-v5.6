import type { CanvasImage } from './useCanvas';

// A monotonic timestamp preserves insertion order within a batch, even when
// several items arrive in the same millisecond or the system clock changes.
let lastTime = 0;
export function nextCanvasTime() {
  lastTime = Math.max(Date.now(), lastTime + 1);
  return lastTime;
}

/** R05: arrange from the top layer down, keeping each manual group intact. */
export function orderArrangementUnits(units: CanvasImage[][], images: CanvasImage[]) {
  // Canvas drawing order is bottom to top. A group's topmost member represents
  // its layer position; sorting units never changes the drawing order of members.
  const layerIndex = new Map(images.map((image, index) => [image.id, index]));
  return units.map(members => ({
    members,
    layer: Math.max(...members.map(image => layerIndex.get(image.id) ?? -1)),
  })).sort((a, b) => b.layer - a.layer).map(unit => unit.members);
}
