import type { CanvasImage } from './useCanvas';
import { shapeLocalBounds } from './canvas-shapes';

export type Bounds = { x: number; y: number; width: number; height: number };
export function imageBounds(item: CanvasImage): Bounds {
  const angle = (item.rotation ?? 0) * Math.PI / 180;
  if (item.shape) {
    const local = shapeLocalBounds(item), cx = item.x + item.width / 2, cy = item.y + item.height / 2;
    const corners = [[local.x, local.y], [local.x + local.width, local.y], [local.x, local.y + local.height], [local.x + local.width, local.y + local.height]]
      .map(([x, y]) => ({ x: cx + x * Math.cos(angle) - y * Math.sin(angle), y: cy + x * Math.sin(angle) + y * Math.cos(angle) }));
    const x = Math.min(...corners.map(point => point.x)), y = Math.min(...corners.map(point => point.y));
    return { x, y, width: Math.max(...corners.map(point => point.x)) - x, height: Math.max(...corners.map(point => point.y)) - y };
  }
  const width = Math.abs(Math.cos(angle)) * item.width + Math.abs(Math.sin(angle)) * item.height;
  const height = Math.abs(Math.sin(angle)) * item.width + Math.abs(Math.cos(angle)) * item.height;
  return { x: item.x + (item.width - width) / 2, y: item.y + (item.height - height) / 2, width, height };
}
export function selectionBounds(items: CanvasImage[]): Bounds {
  const boxes = items.map(imageBounds);
  const x = Math.min(...boxes.map(item => item.x)), y = Math.min(...boxes.map(item => item.y));
  return { x, y, width: Math.max(...boxes.map(item => item.x + item.width)) - x, height: Math.max(...boxes.map(item => item.y + item.height)) - y };
}
export function expandGroups(images: CanvasImage[], ids: string[]) {
  const groups = new Set(images.filter(item => ids.includes(item.id) && item.groupId).map(item => item.groupId));
  return images.filter(item => !item.generating && (ids.includes(item.id) || !!item.groupId && groups.has(item.groupId))).map(item => item.id);
}
export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
