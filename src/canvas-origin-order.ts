import { workflowInputs, workflowSources, type CanvasImage } from './canvas';

const validOrder = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value) && value >= 0;

// A session ordinal represents upload order. Generated images keep their
// original input's ordinal, independent of when the result was generated.
export function canvasImageOriginOrders(items: CanvasImage[], previous: CanvasImage[] = []): Map<string, number> {
  const previousOrders = previous.length ? canvasImageOriginOrders(previous) : new Map<string, number>();
  const byId = new Map(items.map(item => [item.id, item]));
  const images = items.filter(item => !item.nodeOnly);
  const orders = new Map<string, number>();
  let nextOrder = 0;
  for (const order of previousOrders.values()) nextOrder = Math.max(nextOrder, order + 1);
  // A group's original source may be gone while the group is still alive.
  // Later uploads must remain after that frozen ordering boundary.
  for (const item of [...previous, ...items]) for (const member of [item.layoutMeta?.image, item.layoutMeta?.editor]) {
    if (member?.group) nextOrder = Math.max(nextOrder, member.group.order + 1, (member.group.sortOrder ?? member.group.order) + 1);
  }
  for (const image of images) {
    const order = validOrder(image.layoutOriginOrder) ? image.layoutOriginOrder : previousOrders.get(image.id);
    if (order === undefined) continue;
    orders.set(image.id, order);
    nextOrder = Math.max(nextOrder, order + 1);
  }
  // Allocate arrival order before resolving edges, including forward references
  // in old snapshots. Newly uploaded inputs get a new order even in an old slot.
  const arrivals = new Map(images.map(image => [image.id, orders.get(image.id) ?? nextOrder++]));
  const visiting = new Set<string>();
  function resolve(id: string): number {
    const saved = orders.get(id);
    if (saved !== undefined) return saved;
    const fallback = arrivals.get(id)!;
    if (visiting.has(id)) return fallback;
    visiting.add(id);
    const image = byId.get(id)!;
    let sourceIds: string[] = [];
    // Direct image processing takes precedence over legacy editor metadata.
    if (image.sourceImageId) sourceIds = [image.sourceImageId];
    else if (image.generatedByEditorId) {
      const editor = byId.get(image.generatedByEditorId);
      if (editor?.fusion) {
        if (image.generatedFromReferenceId) {
          // Batch results belong to one specific primary reference, whose ID
          // is not necessarily the canvas image ID. Shared references do not count.
          const reference = workflowInputs(editor.fusion).find(item => item.id === image.generatedFromReferenceId);
          if (reference?.sourceImageId) sourceIds = [reference.sourceImageId];
        } else sourceIds = workflowSources(items, editor).map(source => source.id);
      }
    }
    const sources = sourceIds.filter(sourceId => arrivals.has(sourceId) && sourceId !== id);
    const order = sources.length ? Math.min(...sources.map(resolve)) : fallback;
    visiting.delete(id);
    orders.set(id, order);
    return order;
  }
  images.forEach(image => resolve(image.id));
  return orders;
}

// Save provenance before inputs can be replaced or deleted. Existing fields
// remain immutable, and the normal canvas history carries them through undo/redo.
export function withCanvasOriginOrder(items: CanvasImage[], previous: CanvasImage[] = []): CanvasImage[] {
  if (items.every(item => item.nodeOnly || validOrder(item.layoutOriginOrder))) return items;
  const orders = canvasImageOriginOrders(items, previous);
  return items.map(item => item.nodeOnly || validOrder(item.layoutOriginOrder)
    ? item : { ...item, layoutOriginOrder: orders.get(item.id)! });
}
