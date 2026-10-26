/** Arrangement metadata belongs to the canvas snapshot, not the layout pass. */
export type VideoLayoutState = {
  order: Record<string, number>;
  nextOrder: number;
  owners: Record<string, string>;
  groupOrder: Record<string, number>;
};

export type VideoLayoutVertex = {
  id: string;
  kind: 'media' | 'workflow';
  width: number;
  height: number;
  sources: string[];
};

// Stable dependency order, including deterministic handling of feedback links.
// Feedback affects layout only; no stored business connection is removed.
export function videoLayoutOrder(vertices: VideoLayoutVertex[], order: Record<string, number>): VideoLayoutVertex[] {
  const byId = new Map(vertices.map(vertex => [vertex.id, vertex]));
  const remaining = new Set([...vertices].sort((a, b) => order[a.id] - order[b.id]).map(vertex => vertex.id));
  const result: VideoLayoutVertex[] = [];
  while (remaining.size) {
    const id = [...remaining].find(id => byId.get(id)!.sources.every(source => !remaining.has(source)))
      ?? remaining.values().next().value!;
    remaining.delete(id);
    result.push(byId.get(id)!);
  }
  return result;
}

export function reconcileVideoLayout(vertices: VideoLayoutVertex[], saved?: VideoLayoutState): VideoLayoutState {
  const order: Record<string, number> = {};
  let nextOrder = saved?.nextOrder ?? 0;
  const byId = new Map(vertices.map(vertex => [vertex.id, vertex]));
  const degree = new Map(vertices.map(vertex => [vertex.id, 0]));
  for (const vertex of vertices) {
    order[vertex.id] = saved?.order[vertex.id] ?? nextOrder++;
    for (const source of vertex.sources) {
      if (!byId.has(source) || source === vertex.id) continue;
      degree.set(vertex.id, degree.get(vertex.id)! + 1);
      degree.set(source, degree.get(source)! + 1);
    }
  }

  // Retain live groups across reference additions and reordering. A completely
  // detached item becomes standalone; a deleted group's bare sources can be
  // adopted by their remaining consumer instead of keeping a phantom owner.
  const validGroups = new Set<string>();
  for (const vertex of vertices) {
    const group = saved?.owners[vertex.id];
    if (!group || !degree.get(vertex.id)) continue;
    if (vertex.kind === 'workflow' || vertex.sources.some(source => byId.has(source) && saved?.owners[source] === group)) validGroups.add(group);
  }
  const owners: Record<string, string> = {};
  const groupOrder: Record<string, number> = {};
  for (const vertex of vertices) {
    const group = saved?.owners[vertex.id];
    if (group && validGroups.has(group) && degree.get(vertex.id)) {
      owners[vertex.id] = group;
      groupOrder[group] = saved?.groupOrder[group] ?? order[vertex.id];
    }
  }

  for (const vertex of videoLayoutOrder(vertices, order)) {
    if (!degree.get(vertex.id)) continue;
    const sources = vertex.sources.filter(id => byId.has(id) && id !== vertex.id);
    if (vertex.kind === 'media') {
      // Generated results and direct image derivatives follow their producer.
      const parent = sources.find(id => owners[id]);
      if (parent && !owners[vertex.id]) owners[vertex.id] = owners[parent];
      else if (!owners[vertex.id] && sources.length && sources.every(id => byId.get(id)?.kind === 'media')) {
        const group = `video-group:${sources[0]}`;
        owners[vertex.id] = group;
        groupOrder[group] ??= Math.min(...sources.map(id => order[id]));
        for (const source of sources) if (!owners[source]) owners[source] = group;
      }
      continue;
    }
    const parents = new Set(sources.flatMap(id => owners[id] ? [owners[id]] : []));
    const group = owners[vertex.id] ?? (parents.size === 1 ? [...parents][0] : `video-group:${vertex.id}`);
    owners[vertex.id] = group;
    groupOrder[group] ??= sources.length ? Math.min(...sources.map(id => order[id])) : order[vertex.id];
    // Only previously ungrouped inputs move into this group.
    for (const source of sources) if (!owners[source]) owners[source] = group;
  }
  // Cyclic legacy edges may have put a result before its producer above.
  for (const vertex of vertices) {
    if (vertex.kind !== 'media' || owners[vertex.id]) continue;
    const parent = vertex.sources.find(id => owners[id]);
    if (parent) owners[vertex.id] = owners[parent];
  }
  return { order, nextOrder, owners, groupOrder };
}
