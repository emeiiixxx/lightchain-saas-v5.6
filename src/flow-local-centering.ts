import { layoutConnectedGroup, type FlowLayoutRect, type FlowLayoutVertex } from './canvas-connected-layout';
import { videoLayoutOrder } from './video-layout-groups';

export type LocalFlowVertex = FlowLayoutVertex & { x: number; y: number };
type Position = { x: number; y: number };
type LayoutState = { owners: Record<string, string>; order: Record<string, number> };
type Branch = { owner: string; kind: LocalFlowVertex['kind']; sources: string[] };

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
      if (!parent || visited.has(parent.id) || ownerOf(parent) !== branch.owner) break;
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
  if (!pending.size) return new Map();

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
      .filter(vertex => keyOf(branchOf(vertex)) === keyOf(branch));
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
        if (sibling.kind !== branch.kind || ownerOf(sibling) !== branch.owner || fixed.has(sibling.id)) continue;
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
  for (const { roots, owner, fixed } of familiesInOrder) {
    // Inputs and their ancestors stay fixed, including references from other
    // groups. Descendant traversal also stops at every ownership boundary.
    const scope = new Set<string>();
    const queue = roots.map(vertex => vertex.id);
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index];
      const vertex = current.get(id);
      if (!vertex || fixed.has(id) || scope.has(id) || ownerOf(vertex) !== owner) continue;
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
    for (const [id, point] of placed) current.set(id, { ...current.get(id)!, ...point });
  }
  return new Map(next.flatMap(vertex => {
    const point = current.get(vertex.id)!;
    return point.x === vertex.x && point.y === vertex.y ? [] : [[vertex.id, { x: point.x, y: point.y }] as const];
  }));
}
