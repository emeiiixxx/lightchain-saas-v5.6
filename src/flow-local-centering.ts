import { FLOW_BRANCH_GAP, layoutConnectedGroup, type FlowLayoutRect, type FlowLayoutVertex } from './canvas-connected-layout';
import { videoLayoutOrder } from './video-layout-groups';

export type LocalFlowVertex = FlowLayoutVertex & { x: number; y: number; positionPinned?: boolean };
type Position = { x: number; y: number };
type LayoutState = { owners: Record<string, string>; order: Record<string, number> };
type Branch = { owner: string; kind: LocalFlowVertex['kind']; sources: string[] };

// Pins are obstacles for the object they actually touch, not for the envelope
// of its entire upstream tree. Otherwise one moved result can push the editor
// and every earlier step away from the real (unmoved) input.
function avoidPinnedObjects(
  current: Map<string, LocalFlowVertex>, automatic: Set<string>, sequence: Map<string, number>,
  ownerOf: (vertex: LocalFlowVertex) => string,
) {
  const baseline = new Map([...current].map(([id, vertex]) => [id, { ...vertex }]));
  const sourcesOf = (vertex: LocalFlowVertex) => [...new Set(vertex.sources)].filter(id => current.has(id) && id !== vertex.id).sort();
  const sameSources = (a: LocalFlowVertex, b: LocalFlowVertex) =>
    a.kind === b.kind && JSON.stringify(sourcesOf(a)) === JSON.stringify(sourcesOf(b));
  const horizontalOverlap = (a: FlowLayoutRect, b: FlowLayoutRect) => a.x < b.x + b.width && a.x + a.width > b.x;
  const tooClose = (a: FlowLayoutRect, b: FlowLayoutRect) => horizontalOverlap(a, b)
    && a.y < b.y + b.height + FLOW_BRANCH_GAP && a.y + a.height + FLOW_BRANCH_GAP > b.y;
  const centerOfInputs = (ids: string[], items: Map<string, LocalFlowVertex>) =>
    (Math.min(...ids.map(id => items.get(id)!.y)) + Math.max(...ids.map(id => {
      const item = items.get(id)!; return item.y + item.height;
    }))) / 2;
  const ordered = [...automatic].sort((a, b) => (sequence.get(a) ?? 0) - (sequence.get(b) ?? 0) || a.localeCompare(b));
  const children = new Map<string, string[]>();
  for (const id of automatic) {
    const vertex = current.get(id)!;
    const sources = sourcesOf(vertex);
    for (const source of sources) {
      const list = children.get(source) ?? [];
      list.push(id); children.set(source, list);
    }
  }
  const downstream = (roots: string[], owner: string) => {
    const ids = new Set<string>(), queue = [...roots];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i], vertex = current.get(id);
      if (!vertex || !automatic.has(id) || vertex.positionPinned || ownerOf(vertex) !== owner || ids.has(id)) continue;
      ids.add(id);
      // A join travels with a branch only when all its inputs travel together.
      // Otherwise it is centered once, after its separate inputs settle.
      for (const child of children.get(id) ?? []) {
        if (sourcesOf(current.get(child)!).every(source => ids.has(source))) queue.push(child);
      }
    }
    return ids;
  };
  const inheritedJoinShift = new Map<string, number>();
  const translate = (ids: Set<string>, dy: number) => {
    if (!dy) return;
    for (const id of ids) {
      const vertex = current.get(id)!;
      const sources = sourcesOf(vertex);
      if (sources.length > 1 && sources.every(source => ids.has(source))) {
        inheritedJoinShift.set(id, (inheritedJoinShift.get(id) ?? 0) + dy);
      }
      current.set(id, { ...vertex, y: vertex.y + dy });
    }
  };
  for (const id of ordered) {
    let vertex = current.get(id)!;
    const owner = ownerOf(vertex);
    const pins = [...current.values()].filter(item => item.positionPinned && ownerOf(item) === owner);
    if (!pins.length) continue;
    const sources = sourcesOf(vertex);
    const ownBranch = downstream([id], owner);
    if (sources.length > 1) {
      const delta = centerOfInputs(sources, current) - centerOfInputs(sources, baseline) - (inheritedJoinShift.get(id) ?? 0);
      if (delta) { translate(ownBranch, delta); vertex = current.get(id)!; }
    }
    const others = [...current.values()].filter(item => ownerOf(item) === owner && !ownBranch.has(item.id));
    const collided = sources.length > 1
      ? [...ownBranch].some(branchId => others.some(item => tooClose(current.get(branchId)!, item)))
      : pins.some(item => tooClose(vertex, item));
    if (!collided) continue;

    // Keep later automatic siblings in order if the blocked item needs room.
    // Pinned siblings and all upstream objects are always excluded.
    const rootBaseline = baseline.get(id)!;
    const siblings = ordered.filter(otherId => {
      const other = baseline.get(otherId)!;
      return ownerOf(other) === owner && sameSources(rootBaseline, other) && other.y >= rootBaseline.y;
    });
    const moving = downstream(siblings, owner);
    const obstacles = [...current.values()].filter(item => ownerOf(item) === owner && !moving.has(item.id));
    let minimum = -Infinity;
    for (const item of obstacles) {
      const initial = baseline.get(item.id)!;
      if (automatic.has(item.id) && sameSources(rootBaseline, initial) && initial.y < rootBaseline.y) {
        minimum = Math.max(minimum, item.y + item.height + FLOW_BRANCH_GAP - vertex.y);
      }
    }
    const blocked: { start: number; end: number }[] = [];
    for (const movingId of moving) {
      const item = current.get(movingId)!;
      for (const obstacle of obstacles) if (horizontalOverlap(item, obstacle)) blocked.push({
        start: obstacle.y - FLOW_BRANCH_GAP - item.y - item.height,
        end: obstacle.y + obstacle.height + FLOW_BRANCH_GAP - item.y,
      });
    }
    // Merge forbidden translations once, then choose the closest clear gap.
    // Strict endpoints allow exactly FLOW_BRANCH_GAP of separation.
    const merged: typeof blocked = [];
    for (const interval of blocked.sort((a, b) => a.start - b.start)) {
      const last = merged[merged.length - 1];
      if (last && interval.start < last.end) last.end = Math.max(last.end, interval.end);
      else merged.push({ ...interval });
    }
    const preferred = Math.max(0, minimum);
    const interval = merged.find(item => preferred > item.start && preferred < item.end);
    const dy = !interval ? preferred : interval.start >= minimum && Math.abs(interval.start) < Math.abs(interval.end)
      ? interval.start : interval.end;
    translate(moving, dy);
  }
}

// Explicit connected additions only: retain the input positions and ownership,
// then arrange the affected sibling branches using the same centers as Arrange.
export function centerAddedFlowBranches(
  previous: LocalFlowVertex[], next: LocalFlowVertex[], state: LayoutState,
): Map<string, Position> {
  const before = new Map(previous.map(vertex => [vertex.id, vertex]));
  const current = new Map(next.map(vertex => [vertex.id, { ...vertex }]));
  const sourcesOf = (vertex: LocalFlowVertex) => [...new Set(vertex.sources)]
    .filter(id => id !== vertex.id && current.has(id)).sort();
  const ownerOf = (vertex: LocalFlowVertex) => state.owners[vertex.id] ?? vertex.id;
  // Only explicitly dragged objects are fixed. Other members of the same
  // group still participate in automatic layout. Arrange clears these pins.
  for (const vertex of next) {
    const prior = before.get(vertex.id);
    if (prior && vertex.positionPinned) current.set(vertex.id, { ...vertex, x: prior.x, y: prior.y });
  }
  const keyOf = (branch: Branch) => JSON.stringify([branch.owner, branch.kind, branch.sources]);
  const branchOf = (vertex: LocalFlowVertex, sources = sourcesOf(vertex)): Branch => ({
    owner: ownerOf(vertex), kind: vertex.kind, sources,
  });
  const pending = new Map<string, Branch>();
  const enqueue = (branch: Branch) => {
    // A growing result branch can outgrow the space between sibling editors.
    // Include its same-owner upstream chain so those complete branches are
    // spaced together around their unchanged inputs, not just the new results.
    const visited = new Set<string>();
    while (branch.sources.length === 1) {
      const parent = current.get(branch.sources[0]);
      if (!parent || parent.positionPinned || visited.has(parent.id) || ownerOf(parent) !== branch.owner) break;
      visited.add(parent.id);
      const parentBranch = branchOf(parent);
      if (!parentBranch.sources.length) break;
      branch = parentBranch;
    }
    if (branch.sources.length) pending.set(keyOf(branch), branch);
  };
  for (const vertex of next) {
    const prior = before.get(vertex.id);
    const sources = sourcesOf(vertex);
    if (!sources.length) continue;
    if (!prior) enqueue(branchOf(vertex, sources));
    else if (vertex.kind === 'workflow' && sources.some(id => !prior.sources.includes(id))) {
      enqueue(branchOf(vertex, sources));
      // A node gaining another input no longer belongs to its old sibling set.
      // Recenter those remaining siblings around their unchanged input, too.
      enqueue(branchOf(vertex, sourcesOf(prior)));
    } else if (vertex.kind === 'media' && (prior.width !== vertex.width || prior.height !== vertex.height)) {
      // Video completion can replace a slot with a different actual ratio.
      // Callers opt into this pass only at settlement, never history restore.
      enqueue(branchOf(vertex, sources));
    }
  }
  const changedPositions = () => new Map(next.flatMap(vertex => {
    const point = current.get(vertex.id)!;
    return point.x === vertex.x && point.y === vertex.y ? [] : [[vertex.id, { x: point.x, y: point.y }] as const];
  }));
  if (!pending.size) return changedPositions();

  const order = Object.fromEntries(next.map((vertex, index) => [vertex.id, state.order[vertex.id] ?? index]));
  const sequence = new Map(videoLayoutOrder(next, order).map((vertex, index) => [vertex.id, index]));
  const consumers = new Map<string, LocalFlowVertex[]>();
  for (const vertex of next) for (const source of sourcesOf(vertex)) {
    const list = consumers.get(source) ?? [];
    list.push(vertex);
    consumers.set(source, list);
  }
  const ancestorsOf = (ids: string[]) => {
    const found = new Set(ids);
    const queue = [...found];
    for (let i = 0; i < queue.length; i++) for (const source of current.get(queue[i])?.sources ?? []) {
      if (!current.has(source) || found.has(source)) continue;
      found.add(source); queue.push(source);
    }
    return found;
  };
  const families = new Map<string, { roots: LocalFlowVertex[]; owner: string; fixed: Set<string> }>();
  for (const branch of pending.values()) {
    const roots = (consumers.get(branch.sources[0]) ?? [])
      .filter(vertex => !vertex.positionPinned && keyOf(branchOf(vertex)) === keyOf(branch));
    if (!roots.length) continue;
    const rootIds = new Set(roots.map(vertex => vertex.id));
    const fixed = ancestorsOf(branch.sources);
    // A+B and A share a branch level even though their input lists differ.
    // A later join referencing A and an earlier branch's result is a
    // descendant, however; it must stay attached to that result.
    const checked = new Set(rootIds);
    for (let i = 0; i < roots.length; i++) for (const source of sourcesOf(roots[i])) {
      for (const sibling of consumers.get(source) ?? []) {
        if (checked.has(sibling.id)) continue;
        checked.add(sibling.id);
        if (sibling.positionPinned || sibling.kind !== branch.kind || ownerOf(sibling) !== branch.owner || fixed.has(sibling.id)) continue;
        const upstream = ancestorsOf(sourcesOf(sibling));
        if ([...rootIds].some(id => upstream.has(id))) continue;
        roots.push(sibling); rootIds.add(sibling.id);
        for (const id of upstream) fixed.add(id);
      }
    }
    families.set(JSON.stringify([...rootIds].sort()), { roots, owner: branch.owner, fixed });
  }
  const familiesInOrder = [...families.values()].sort((a, b) =>
    Math.min(...a.roots.map(vertex => sequence.get(vertex.id)!))
    - Math.min(...b.roots.map(vertex => sequence.get(vertex.id)!)));
  const automatic = new Set<string>();
  for (const { roots, owner, fixed } of familiesInOrder) {
    // A dragged object is a layout boundary, like a fixed input. Its downstream
    // additions form their own family anchored at its actual position.
    const scope = new Set<string>();
    const queue = roots.map(vertex => vertex.id);
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index];
      const vertex = current.get(id);
      if (!vertex || vertex.positionPinned || fixed.has(id) || scope.has(id) || ownerOf(vertex) !== owner) continue;
      scope.add(id);
      for (const child of consumers.get(id) ?? []) queue.push(child.id);
    }
    const rootIds = new Set(roots.filter(vertex => scope.has(vertex.id)).map(vertex => vertex.id));
    if (!rootIds.size) continue;
    const inputs = [...new Set(roots.flatMap(sourcesOf))].map(id => current.get(id)!);
    const left = Math.min(...inputs.map(vertex => vertex.x));
    const top = Math.min(...inputs.map(vertex => vertex.y));
    const bounds: FlowLayoutRect = {
      x: left, y: top,
      width: Math.max(...inputs.map(vertex => vertex.x + vertex.width)) - left,
      height: Math.max(...inputs.map(vertex => vertex.y + vertex.height)) - top,
    };
    // A virtual source represents the actual input selection, so direct
    // siblings share its center without moving or duplicating the real inputs.
    let anchorId = '__local-flow-anchor__';
    while (current.has(anchorId)) anchorId += '_';
    const anchor: FlowLayoutVertex = {
      id: anchorId, kind: roots[0].kind === 'workflow' ? 'media' : 'workflow',
      width: bounds.width, height: bounds.height, sources: [],
    };
    const vertices = [...scope].map(id => {
      const vertex = current.get(id)!;
      return { ...vertex, sources: rootIds.has(id) ? [anchorId] : vertex.sources };
    });
    const externalInputs = new Map([...current].filter(([id]) => !scope.has(id)));
    const layout = layoutConnectedGroup([anchor, ...vertices], { ...order, [anchorId]: -1 }, {
      origin: bounds, externalInputs,
      fixedRoots: new Map([[anchorId, bounds]]), avoidCollisions: false,
    });
    const placed = new Map([...layout.positions].filter(([id]) => scope.has(id)));
    // Internal branches are spaced before centering. Unrelated groups remain
    // fixed; full-canvas collision avoidance belongs to Arrange.
    for (const [id, point] of placed) {
      automatic.add(id);
      current.set(id, { ...current.get(id)!, ...point });
    }
  }
  avoidPinnedObjects(current, automatic, sequence, ownerOf);
  return changedPositions();
}
