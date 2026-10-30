import type { CanvasImage } from './useCanvas';

export type CanvasLayerTarget = { kind: 'image' | 'group'; id: string };
export type CanvasLayerEdge = 'before' | 'after';
export type CanvasLayerUnit = CanvasLayerTarget & { images: CanvasImage[] };

/** List order is front to back; the renderer stores the opposite order. */
export function canvasLayerUnits(images: CanvasImage[]): CanvasLayerUnit[] {
  const units: CanvasLayerUnit[] = [];
  const groups = new Map<string, CanvasLayerUnit>();
  for (let index = images.length - 1; index >= 0; index--) {
    const image = images[index];
    if (!image.groupId) { units.push({ kind: 'image', id: image.id, images: [image] }); continue; }
    let group = groups.get(image.groupId);
    if (!group) {
      group = { kind: 'group', id: image.groupId, images: [] };
      groups.set(image.groupId, group); units.push(group);
    }
    group.images.push(image);
  }
  return units;
}

function layerMembers(images: CanvasImage[], target: CanvasLayerTarget) {
  return images.filter(image => target.kind === 'group' ? image.groupId === target.id : image.id === target.id);
}

export function canMoveCanvasLayer(images: CanvasImage[], source: CanvasLayerTarget, target: CanvasLayerTarget) {
  if (source.kind === target.kind && source.id === target.id) return false;
  const sources = layerMembers(images, source), targets = layerMembers(images, target);
  if (!sources.length || !targets.length) return false;
  const sourceParent = source.kind === 'image' ? sources[0].groupId : undefined;
  const targetParent = target.kind === 'image' ? targets[0].groupId : undefined;
  // Sorting does not change group membership or introduce nested groups.
  return sourceParent === targetParent;
}

export function moveCanvasLayer(images: CanvasImage[], source: CanvasLayerTarget, target: CanvasLayerTarget, edge: CanvasLayerEdge) {
  if (!canMoveCanvasLayer(images, source, target)) return images;
  const sourceIds = new Set(layerMembers(images, source).map(image => image.id));
  const targetIds = new Set(layerMembers(images, target).map(image => image.id));
  const displayed = [...images].reverse();
  const moving = displayed.filter(image => sourceIds.has(image.id));
  const remaining = displayed.filter(image => !sourceIds.has(image.id));
  const indices = remaining.flatMap((image, index) => targetIds.has(image.id) ? [index] : []);
  const index = edge === 'before' ? indices[0] : indices[indices.length - 1] + 1;
  remaining.splice(index, 0, ...moving);
  const next = remaining.reverse();
  return next.every((image, index) => image === images[index]) ? images : next;
}
