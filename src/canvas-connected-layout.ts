import { compactBox, type HierarchyData } from '@antv/hierarchy';

export type FlowLayoutVertex = {
  id: string;
  width: number;
  height: number;
  kind: 'media' | 'workflow';
  sources: string[];
};
type Position = { x: number; y: number };
export type ConnectedGroupLayout = { positions: Map<string, Position>; width: number; height: number };
const STACK_GAP = 120;
const EDITOR_GAP = 80;

export function layoutConnectedGroup(input: FlowLayoutVertex[], order: Record<string, number>): ConnectedGroupLayout {
  const byId = new Map(input.map(vertex => [vertex.id, vertex]));
  const vertices = [...byId.values()].map(vertex => ({ ...vertex, sources: [...new Set(vertex.sources)].filter(id => byId.has(id) && id !== vertex.id) }));
  if (!vertices.length) return { positions: new Map(), width: 0, height: 0 };
  for (const vertex of vertices) byId.set(vertex.id, vertex);
  const originalOrder = new Map(vertices.map((vertex, index) => [vertex.id, index]));
  const compareOrder = (a: FlowLayoutVertex, b: FlowLayoutVertex) =>
    (order[a.id] ?? originalOrder.get(a.id)!) - (order[b.id] ?? originalOrder.get(b.id)!)
    || originalOrder.get(a.id)! - originalOrder.get(b.id)!;
  const ranks = new Map<string, number>();
  // Missing and feedback edges affect only this local layout, never saved links.
  const remaining = new Set([...vertices].sort(compareOrder).map(vertex => vertex.id));
  const ordered: FlowLayoutVertex[] = [];
  while (remaining.size) {
    const id = [...remaining].find(id => byId.get(id)!.sources.every(source => !remaining.has(source)))
      ?? remaining.values().next().value!;
    remaining.delete(id);
    ordered.push(vertices[originalOrder.get(id)!]);
  }
  for (const vertex of ordered) {
    ranks.set(vertex.id, Math.max(0, ...vertex.sources.flatMap(source => ranks.has(source) ? [ranks.get(source)! + 1] : [])));
  }
  const parents = new Map(vertices.map(vertex => [vertex.id, vertex.sources.filter(id =>
    ranks.get(id)! < ranks.get(vertex.id)!)]));
  const consumers = new Map(vertices.map(vertex => [vertex.id, [] as FlowLayoutVertex[]]));
  for (const vertex of vertices) for (const source of parents.get(vertex.id)!) consumers.get(source)!.push(vertex);
  // A fresh input belongs beside the results it joins, rather than at the
  // beginning of the whole workflow. Shared inputs stop at their first consumer.
  for (const vertex of vertices) {
    const targets = consumers.get(vertex.id)!;
    if (vertex.kind === 'media' && !parents.get(vertex.id)!.length && targets.length) {
      ranks.set(vertex.id, Math.min(...targets.map(target => ranks.get(target.id)!)) - 1);
    }
  }
  type InputSlot = { id: string; consumer: FlowLayoutVertex; index: number };
  type InputReservation = { before: InputSlot[]; after: InputSlot[] };
  const reservations = new Map<string, InputReservation>();
  const anchors = new Map<string, { id: string; side: 'before' | 'after' }>();
  for (const vertex of vertices) {
    if (vertex.kind !== 'media' || parents.get(vertex.id)!.length) continue;
    const consumer = [...consumers.get(vertex.id)!].sort((a, b) =>
      ranks.get(a.id)! - ranks.get(b.id)! || compareOrder(a, b))[0];
    if (!consumer) continue;
    const inputs = parents.get(consumer.id)!;
    const index = inputs.indexOf(vertex.id);
    const isExistingInput = (id: string) => parents.get(id)!.length > 0 && ranks.get(id) === ranks.get(vertex.id);
    const previous = inputs.slice(0, index).reverse().find(isExistingInput);
    const next = inputs.slice(index + 1).find(isExistingInput);
    const anchor = previous ?? next;
    if (!anchor) continue;
    const side = previous ? 'after' : 'before';
    const reservation = reservations.get(anchor) ?? { before: [], after: [] };
    reservation[side].push({ id: vertex.id, consumer, index });
    reservations.set(anchor, reservation);
    anchors.set(vertex.id, { id: anchor, side });
  }
  const reservedHeight = new Map<string, number>();
  for (const [id, reservation] of reservations) {
    for (const slots of [reservation.before, reservation.after]) slots.sort((a, b) =>
      compareOrder(a.consumer, b.consumer) || a.index - b.index);
    const space = (slots: InputSlot[]) => slots.reduce((sum, slot) => sum + byId.get(slot.id)!.height + STACK_GAP, 0);
    // Symmetric layout padding leaves room for fresh inputs while the actual
    // material and every single-child continuation retain the same center.
    reservedHeight.set(id, byId.get(id)!.height + 2 * Math.max(space(reservation.before), space(reservation.after)));
  }
  // Input lists determine media order; the oldest consuming editor breaks ties
  // when a shared source appears in more than one list.
  const inputOrder = new Map<string, number>();
  for (const editor of [...vertices].filter(vertex => vertex.kind === 'workflow').sort(compareOrder)) {
    for (const id of editor.sources) if (!inputOrder.has(id)) inputOrder.set(id, inputOrder.size);
  }
  const columns: FlowLayoutVertex[][] = Array.from({ length: Math.max(...ranks.values()) + 1 }, () => []);
  for (const vertex of vertices) (columns[ranks.get(vertex.id)!] ??= []).push(vertex);
  for (const column of columns) column.sort((a, b) =>
    (inputOrder.get(a.id) ?? Infinity) - (inputOrder.get(b.id) ?? Infinity) || compareOrder(a, b));
  const widths = columns.map(column => Math.max(0, ...column.map(item => item.width)));
  const columnX: number[] = [];
  columns.forEach((_, index) => {
    columnX[index] = index ? columnX[index - 1] + widths[index - 1] + EDITOR_GAP : 0;
  });
  // Cut only at joins. Each remaining tree keeps its complete downstream
  // branches, so a single chain shares one center line even after a join.
  const roots = columns.flat().filter(vertex => parents.get(vertex.id)!.length !== 1);
  const tree = new Map<string, HierarchyData>();
  for (const vertex of vertices) tree.set(vertex.id, {
    id: vertex.id, height: reservedHeight.get(vertex.id) ?? vertex.height, width: widths[ranks.get(vertex.id)!], children: [],
  });
  for (const column of columns) for (const vertex of column) {
    const sources = parents.get(vertex.id)!;
    if (sources.length === 1) tree.get(sources[0])!.children!.push(tree.get(vertex.id)!);
  }
  type Contour = { top: number; bottom: number };
  type ReservedTree = { points: Map<string, number>; contours: Map<number, Contour> };
  function layoutReservedTree(id: string): ReservedTree {
    const vertex = byId.get(id)!;
    const points = new Map<string, number>();
    const contours = new Map<number, Contour>();
    const childBounds: Contour[] = [];
    for (const child of tree.get(id)!.children!) {
      const branch = layoutReservedTree(child.id!);
      let offset = 0;
      for (const [rank, contour] of branch.contours) {
        const previous = contours.get(rank);
        if (previous) offset = Math.max(offset, previous.bottom + STACK_GAP - contour.top);
      }
      for (const [childId, y] of branch.points) points.set(childId, y + offset);
      const childTop = branch.points.get(child.id!)! + offset;
      childBounds.push({ top: childTop, bottom: childTop + byId.get(child.id!)!.height });
      for (const [rank, contour] of branch.contours) {
        const previous = contours.get(rank);
        contours.set(rank, {
          top: Math.min(previous?.top ?? Infinity, contour.top + offset),
          bottom: Math.max(previous?.bottom ?? -Infinity, contour.bottom + offset),
        });
      }
    }
    // Reserve space in the contours, but align the parent to its visible
    // children. Repacking whole child trees keeps every column collision-free.
    const center = childBounds.length
      ? (Math.min(...childBounds.map(child => child.top)) + Math.max(...childBounds.map(child => child.bottom))) / 2
      : 0;
    points.set(id, center - vertex.height / 2);
    const height = reservedHeight.get(id) ?? vertex.height;
    contours.set(ranks.get(id)!, { top: center - height / 2, bottom: center + height / 2 });
    return {
      points: new Map([...points].map(([childId, y]) => [childId, y - center])),
      contours: new Map([...contours].map(([rank, contour]) => [rank, { top: contour.top - center, bottom: contour.bottom - center }])),
    };
  }
  const occupied = new Map<number, Contour[]>();
  const positions = new Map<string, Position>();
  for (const root of roots) {
    const layout = compactBox(tree.get(root.id)!, {
      direction: 'LR', fixedRoot: false,
      getId: data => data.id!, getWidth: data => data.width!, getHeight: data => data.height!,
      getHGap: () => EDITOR_GAP / 2, getVGap: () => STACK_GAP / 2,
    });
    const rootCenter = layout.y + layout.vgap + (reservedHeight.get(root.id) ?? root.height) / 2;
    const points = new Map<string, Position>();
    const contours = new Map<number, Contour>();
    layout.eachNode(node => {
      const vertex = byId.get(node.id)!;
      const rank = ranks.get(vertex.id)!;
      const height = reservedHeight.get(vertex.id) ?? vertex.height;
      const top = node.y + node.vgap - rootCenter;
      const y = top + (height - vertex.height) / 2;
      points.set(vertex.id, {
        x: columnX[rank] + (roots.length > 1 && vertex.kind === 'media' ? widths[rank] - vertex.width : 0), y,
      });
      const contour = contours.get(rank);
      contours.set(rank, {
        top: Math.min(contour?.top ?? Infinity, top),
        bottom: Math.max(contour?.bottom ?? -Infinity, top + height),
      });
    });
    if ([...points.keys()].some(id => reservedHeight.has(id))) {
      const visibleLayout = layoutReservedTree(root.id);
      for (const [id, y] of visibleLayout.points) points.set(id, { ...points.get(id)!, y });
      contours.clear();
      for (const [rank, contour] of visibleLayout.contours) contours.set(rank, contour);
    }

    // Center a join on the full extent of its actual inputs. A shared source
    // stays in place; collisions move the whole new tree, never its nodes alone.
    const inputs = parents.get(root.id)!.filter(id => positions.has(id));
    let center = inputs.length ? (
      Math.min(...inputs.map(id => positions.get(id)!.y))
      + Math.max(...inputs.map(id => positions.get(id)!.y + byId.get(id)!.height))
    ) / 2 : 0;
    const anchor = anchors.get(root.id);
    let placeAbove = false;
    if (anchor && positions.has(anchor.id)) {
      const slots = reservations.get(anchor.id)![anchor.side];
      const index = slots.findIndex(slot => slot.id === root.id);
      const position = positions.get(anchor.id)!;
      if (anchor.side === 'before') {
        const space = slots.slice(index + 1).reduce((sum, slot) => sum + byId.get(slot.id)!.height + STACK_GAP, 0);
        center = position.y - STACK_GAP - space - root.height / 2;
        placeAbove = true;
      } else {
        const space = slots.slice(0, index).reduce((sum, slot) => sum + byId.get(slot.id)!.height + STACK_GAP, 0);
        center = position.y + byId.get(anchor.id)!.height + STACK_GAP + space + root.height / 2;
      }
    }
    const blocked: Contour[] = [];
    for (const [rank, contour] of contours) {
      // A loose input may fill its reserved slot between two old results.
      // Whole trees still avoid each other's full column contours.
      const previousSpans = root.kind === 'media' && !parents.get(root.id)!.length && points.size === 1
        ? [...positions].flatMap(([id, point]) => ranks.get(id) === rank ? [{ top: point.y, bottom: point.y + byId.get(id)!.height }] : [])
        : occupied.get(rank) ?? [];
      for (const previous of previousSpans) blocked.push({
        top: previous.top - STACK_GAP - contour.bottom,
        bottom: previous.bottom + STACK_GAP - contour.top,
      });
    }
    // Sorted forbidden offsets also account for long trees spanning later
    // columns, without changing the 80px horizontal layer spacing.
    blocked.sort((a, b) => placeAbove ? b.bottom - a.bottom : a.top - b.top);
    for (const interval of blocked) if (center > interval.top && center < interval.bottom) center = placeAbove ? interval.top : interval.bottom;
    for (const [id, point] of points) positions.set(id, { x: point.x, y: point.y + center });
    for (const [rank, contour] of contours) {
      const spans = occupied.get(rank) ?? [];
      spans.push({ top: contour.top + center, bottom: contour.bottom + center });
      occupied.set(rank, spans);
    }
  }
  const left = Math.min(...[...positions.values()].map(point => point.x));
  const top = Math.min(...[...positions.values()].map(point => point.y));
  const right = Math.max(...vertices.map(vertex => positions.get(vertex.id)!.x + vertex.width));
  const bottom = Math.max(...vertices.map(vertex => positions.get(vertex.id)!.y + vertex.height));
  return {
    positions: new Map([...positions].map(([id, point]) => [id, { x: point.x - left, y: point.y - top }])),
    width: right - left, height: bottom - top,
  };
}

