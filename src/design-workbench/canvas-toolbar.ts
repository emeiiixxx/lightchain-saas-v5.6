import type { Bounds } from './canvas-selection';

type Camera = { x: number; y: number; zoom: number };
type Size = { width: number; height: number };

export function screenBounds(bounds: Bounds, camera: Camera): Bounds {
  return { x: bounds.x * camera.zoom + camera.x, y: bounds.y * camera.zoom + camera.y, width: bounds.width * camera.zoom, height: bounds.height * camera.zoom };
}

export function intersectsViewport(bounds: Bounds, viewport: Size) {
  return bounds.x < viewport.width && bounds.y < viewport.height && bounds.x + bounds.width > 0 && bounds.y + bounds.height > 0;
}

export function canvasToolbarPosition(bounds: Bounds, camera: Camera, viewport: Size, toolbar: Size, rightInset = 16) {
  const box = screenBounds(bounds, camera);
  const above = box.y - toolbar.height - 16;
  const top = above >= 0 ? above : box.y + box.height + 16;
  return {
    left: Math.max(toolbar.width / 2 + 16, Math.min(box.x + box.width / 2, viewport.width - rightInset - toolbar.width / 2)),
    top,
    visibility: intersectsViewport(box, viewport) && top >= 0 && top + toolbar.height <= viewport.height ? 'visible' as const : 'hidden' as const,
  };
}
