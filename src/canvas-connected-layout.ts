export type FlowLayoutVertex = {
  id: string;
  width: number;
  height: number;
  kind: 'media' | 'workflow';
  sources: string[];
};
type Position = { x: number; y: number };
export type FlowLayoutRect = Position & { width: number; height: number };
export type ConnectedGroupContext = {
  // Context layouts return absolute positions; external inputs remain fixed.
  origin: Position;
  externalInputs: ReadonlyMap<string, FlowLayoutRect>;
  occupied?: ReadonlyMap<string, FlowLayoutRect>;
  groupGap?: number;
  bottomFloor?: number;
};
export type ConnectedGroupLayout = { positions: Map<string, Position>; width: number; height: number; bounds?: FlowLayoutRect };
const STACK_GAP = 120;
const EDITOR_GAP = 80;

export function layoutConnectedGroup(input: FlowLayoutVertex[], order: Record<string, number>, context?: ConnectedGroupContext): ConnectedGroupLayout {
  // Untethered parts retain the normal layout's relative starting position.
  // Fixed external inputs are added only as constraints, never as output nodes.
  const baseline = context ? layoutConnectedGroup(input, order) : undefined;
  const externalInputs = context?.externalInputs ?? new Map<string, FlowLayoutRect>();
  const byId = new Map(input.map(vertex => [vertex.id, vertex]));
  const vertices = [...byId.values()].map(vertex => ({ ...vertex, sources: [...new Set(vertex.sources)].filter(id => (byId.has(id) || externalInputs.has(id)) && id !== vertex.id) }));
  if (!vertices.length) return { positions: new Map(), width: 0, height: 0, bounds: { ...(context?.origin ?? { x: 0, y: 0 }), width: 0, height: 0 } };
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
    byId.has(id) && ranks.get(id)! < ranks.get(vertex.id)!)]));
  const externalParents = new Map(vertices.map(vertex => [vertex.id, vertex.sources.filter(id => !byId.has(id) && externalInputs.has(id))]));
  const allParents = new Map(vertices.map(vertex => [vertex.id, vertex.sources.filter(id =>
    parents.get(vertex.id)!.includes(id) || externalParents.get(vertex.id)!.includes(id))]));
  const consumers = new Map(vertices.map(vertex => [vertex.id, [] as FlowLayoutVertex[]]));
  for (const vertex of vertices) for (const source of parents.get(vertex.id)!) consumers.get(source)!.push(vertex);
  // A fresh input belongs beside the results it joins, rather than at the
  // beginning of the whole workflow. Shared inputs stop at their first consumer.
  for (const vertex of vertices) {
    const targets = consumers.get(vertex.id)!;
    if (vertex.kind === 'media' && !parents.get(vertex.id)!.length && !externalParents.get(vertex.id)!.length && targets.length) {
      ranks.set(vertex.id, Math.min(...targets.map(target => ranks.get(target.id)!)) - 1);
    }
  }
  const compareConsumers = (a: FlowLayoutVertex, b: FlowLayoutVertex) =>
    ranks.get(a.id)! - ranks.get(b.id)! || compareOrder(a, b);
  type InputSlot = { id: string; consumer: FlowLayoutVertex; index: number };
  type InputReservation = { before: InputSlot[]; after: InputSlot[] };
  const reservations = new Map<string, InputReservation>();
  const anchors = new Map<string, { id: string; side: 'before' | 'after' }>();
  for (const vertex of vertices) {
    if (vertex.kind !== 'media' || parents.get(vertex.id)!.length || externalParents.get(vertex.id)!.length) continue;
    const consumer = [...consumers.get(vertex.id)!].sort(compareConsumers)[0];
    if (!consumer) continue;
    const inputs = allParents.get(consumer.id)!;
    const index = inputs.indexOf(vertex.id);
    const isExistingInput = (id: string) => externalInputs.has(id) && !byId.has(id)
      || byId.has(id) && (parents.get(id)!.length > 0 || externalParents.get(id)!.length > 0) && ranks.get(id) === ranks.get(vertex.id);
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
      compareConsumers(a.consumer, b.consumer) || a.index - b.index);
    // Fixed external inputs cannot be stretched or moved to make room.
    if (!byId.has(id)) continue;
    const space = (slots: InputSlot[]) => slots.reduce((sum, slot) => sum + byId.get(slot.id)!.height + STACK_GAP, 0);
    // Symmetric layout padding leaves room for fresh inputs while the actual
    // material and every single-child continuation retain the same center.
    reservedHeight.set(id, byId.get(id)!.height + 2 * Math.max(space(reservation.before), space(reservation.after)));
  }
  // Inputs follow the first consuming step's list. Creation order breaks ties
  // between consumers in the same column, without reordering output branches.
  const inputOrder = new Map<string, number>();
  for (const editor of [...vertices].filter(vertex => vertex.kind === 'workflow').sort(compareConsumers)) {
    for (const id of editor.sources) if (!inputOrder.has(id)) inputOrder.set(id, inputOrder.size);
  }
  const columns: FlowLayoutVertex[][] = Array.from({ length: Math.max(...ranks.values()) + 1 }, () => []);
  for (const vertex of vertices) (columns[ranks.get(vertex.id)!] ??= []).push(vertex);
  for (const column of columns) column.sort((a, b) =>
    (inputOrder.get(a.id) ?? Infinity) - (inputOrder.get(b.id) ?? Infinity) || compareOrder(a, b));
  const externalAnchors = new Set([...anchors].filter(([, anchor]) => externalInputs.has(anchor.id) && !byId.has(anchor.id)).map(([id]) => id));
  const widths = columns.map(column => Math.max(0, ...column.filter(item => !externalAnchors.has(item.id)).map(item => item.width)));
  const columnX: number[] = [];
  let nextColumnX = context?.origin.x ?? 0;
  columns.forEach((_, index) => {
    columnX[index] = nextColumnX;
    if (widths[index]) nextColumnX += widths[index] + EDITOR_GAP;
  });
  // Cut only at joins. Each remaining tree keeps its complete downstream
  // branches, so a single chain shares one center line even after a join.
  const roots = columns.flat().filter(vertex => parents.get(vertex.id)!.length !== 1 || externalParents.get(vertex.id)!.length > 0);
  const children = new Map<string, string[]>(vertices.map(vertex => [vertex.id, []]));
  // A downstream editor's input order must not reorder the results or branches
  // created by their shared producer.
  for (const vertex of [...vertices].sort(compareOrder)) {
    const sources = parents.get(vertex.id)!;
    if (sources.length === 1 && !externalParents.get(vertex.id)!.length) children.get(sources[0])!.push(vertex.id);
  }
  type Contour = { top: number; bottom: number };
  type BranchLayout = { points: Map<string, number>; contours: Map<number, Contour> };
  function layoutTree(id: string): BranchLayout {
    const vertex = byId.get(id)!;
    const points = new Map<string, number>();
    const contours = new Map<number, Contour>();
    const childBounds: Contour[] = [];
    for (const child of children.get(id)!) {
      const branch = layoutTree(child);
      let offset = 0;
      for (const [rank, contour] of branch.contours) {
        const previous = contours.get(rank);
        if (previous) offset = Math.max(offset, previous.bottom + STACK_GAP - contour.top);
      }
      for (const [childId, y] of branch.points) points.set(childId, y + offset);
      const childTop = branch.points.get(child)! + offset;
      childBounds.push({ top: childTop, bottom: childTop + byId.get(child)!.height });
      for (const [rank, contour] of branch.contours) {
        const previous = contours.get(rank);
        contours.set(rank, {
          top: Math.min(previous?.top ?? Infinity, contour.top + offset),
          bottom: Math.max(previous?.bottom ?? -Infinity, contour.bottom + offset),
        });
      }
    }
    // Every tree uses the same center rule: the midpoint of the actual direct
    // children's outer edges. Padding only reserves room; it never shifts this
    // center. Move complete child trees to preserve their internal alignment.
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
  const boxOf = (id: string): FlowLayoutRect | undefined => {
    const point = positions.get(id);
    const vertex = byId.get(id);
    return point && vertex ? { ...point, width: vertex.width, height: vertex.height } : externalInputs.get(id);
  };
  const fixedOccupied = new Map(context?.occupied ?? []);
  for (const [id, box] of externalInputs) if (!fixedOccupied.has(id)) fixedOccupied.set(id, box);
  for (const root of roots) {
    const layout = layoutTree(root.id);
    const points = new Map<string, Position>();
    const contours = layout.contours;
    for (const [id, y] of layout.points) {
      const vertex = byId.get(id)!;
      const rank = ranks.get(vertex.id)!;
      points.set(vertex.id, {
        x: columnX[rank] + (roots.length > 1 && vertex.kind === 'media' ? widths[rank] - vertex.width : 0), y,
      });
    }

    const anchor = anchors.get(root.id);
    const anchorBox = anchor ? boxOf(anchor.id) : undefined;
    if (externalAnchors.has(root.id) && anchorBox) {
      // New inputs share their fixed neighbour's column, even when that column
      // belongs to an earlier group. Their ownership and IDs stay local.
      const offset = anchorBox.x + anchorBox.width - root.width - points.get(root.id)!.x;
      for (const point of points.values()) point.x += offset;
    }

    // Center a join on the full extent of its actual inputs. A shared source
    // stays in place; collisions move the whole new tree, never its nodes alone.
    const inputs = allParents.get(root.id)!.flatMap(id => {
      const box = boxOf(id);
      return box ? [box] : [];
    });
    if (context && inputs.length) {
      const minimumX = Math.max(...inputs.map(box => box.x + box.width)) + EDITOR_GAP;
      const offset = Math.max(0, minimumX - points.get(root.id)!.x);
      for (const point of points.values()) point.x += offset;
    }
    let center = inputs.length ? (
      Math.min(...inputs.map(box => box.y))
      + Math.max(...inputs.map(box => box.y + box.height))
    ) / 2 : context ? context.origin.y + (baseline?.positions.get(root.id)?.y ?? 0) + root.height / 2 : 0;
    let placeAbove = false;
    if (anchor && anchorBox) {
      const slots = reservations.get(anchor.id)![anchor.side];
      const index = slots.findIndex(slot => slot.id === root.id);
      if (anchor.side === 'before') {
        const space = slots.slice(index + 1).reduce((sum, slot) => sum + byId.get(slot.id)!.height + STACK_GAP, 0);
        center = anchorBox.y - STACK_GAP - space - root.height / 2;
        placeAbove = true;
      } else {
        const space = slots.slice(0, index).reduce((sum, slot) => sum + byId.get(slot.id)!.height + STACK_GAP, 0);
        center = anchorBox.y + anchorBox.height + STACK_GAP + space + root.height / 2;
      }
    }
    const blocked: Contour[] = [];
    if (context) {
      const previousBoxes = new Map(fixedOccupied);
      for (const [id, point] of positions) {
        const vertex = byId.get(id)!;
        previousBoxes.set(id, { ...point, width: vertex.width, height: vertex.height });
      }
      for (const [rank, contour] of contours) {
        const columnMembers = [...points].filter(([id]) => ranks.get(id) === rank);
        const left = Math.min(...columnMembers.map(([, point]) => point.x));
        const right = Math.max(...columnMembers.map(([id, point]) => point.x + byId.get(id)!.width));
        for (const [id, previous] of previousBoxes) {
          const related = positions.has(id) || externalInputs.has(id);
          const gap = related ? STACK_GAP : context.groupGap ?? 240;
          const horizontalGap = related ? 0 : gap;
          if (left >= previous.x + previous.width + horizontalGap || right + horizontalGap <= previous.x) continue;
          const isLooseInput = root.kind === 'media' && !allParents.get(root.id)!.length && points.size === 1;
          const padding = positions.has(id) && !isLooseInput
            ? Math.max(0, ((reservedHeight.get(id) ?? previous.height) - previous.height) / 2) : 0;
          blocked.push({
            top: previous.y - padding - gap - contour.bottom,
            bottom: previous.y + previous.height + padding + gap - contour.top,
          });
        }
      }
    } else for (const [rank, contour] of contours) {
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
    const avoid = (preferred: number, upwards: boolean) => {
      let offset = preferred;
      for (const interval of [...blocked].sort((a, b) => upwards ? b.bottom - a.bottom : a.top - b.top)) {
        if (offset > interval.top && offset < interval.bottom) offset = upwards ? interval.top : interval.bottom;
      }
      return offset;
    };
    const minimumCenter = context?.bottomFloor === undefined ? -Infinity
      : context.bottomFloor - Math.min(...[...points.values()].map(point => point.y));
    const preferred = Math.max(center, minimumCenter);
    center = avoid(preferred, placeAbove);
    // A fixed row floor outranks centering and an unavailable before-input slot.
    if (center < minimumCenter) center = avoid(preferred, false);
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
    positions: context ? positions : new Map([...positions].map(([id, point]) => [id, { x: point.x - left, y: point.y - top }])),
    width: right - left, height: bottom - top,
    bounds: { x: context ? left : 0, y: context ? top : 0, width: right - left, height: bottom - top },
  };
}

