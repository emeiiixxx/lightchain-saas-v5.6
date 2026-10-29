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
  const rootsOf = (branch: Branch) => [...current.values()].filter(vertex => keyOf(branchOf(vertex)) === keyOf(branch));
  const branches = [...pending.values()].sort((a, b) =>
    Math.min(...rootsOf(a).map(vertex => sequence.get(vertex.id)!))
    - Math.min(...rootsOf(b).map(vertex => sequence.get(vertex.id)!)));

  for (const branch of branches) {
    const roots = rootsOf(branch);
    if (!roots.length) continue;
    // Inputs and their ancestors stay fixed, including references from other
    // groups. Descendant traversal also stops at every ownership boundary.
    const fixed = new Set(branch.sources);
    const ancestors = [...fixed];
    for (let index = 0; index < ancestors.length; index++) {
      for (const id of current.get(ancestors[index])?.sources ?? []) {
        if (!current.has(id) || fixed.has(id)) continue;
        fixed.add(id); ancestors.push(id);
      }
    }
    const scope = new Set<string>();
    const queue = roots.map(vertex => vertex.id);
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index];
      const vertex = current.get(id);
      if (!vertex || fixed.has(id) || scope.has(id) || ownerOf(vertex) !== branch.owner) continue;
      scope.add(id);
      for (const child of current.values()) if (child.sources.includes(id)) queue.push(child.id);
    }
    const rootIds = new Set(roots.filter(vertex => scope.has(vertex.id)).map(vertex => vertex.id));
    if (!rootIds.size) continue;
    const inputs = branch.sources.map(id => current.get(id)!);
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
      id: anchorId, kind: branch.kind === 'workflow' ? 'media' : 'workflow',
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
    // Normal additions prioritize centering even when unrelated content
    // overlaps. Collision avoidance belongs to the explicit Arrange action.
    for (const [id, point] of placed) current.set(id, { ...current.get(id)!, ...point });
  }
  return new Map(next.flatMap(vertex => {
    const point = current.get(vertex.id)!;
    return point.x === vertex.x && point.y === vertex.y ? [] : [[vertex.id, { x: point.x, y: point.y }] as const];
  }));
}
