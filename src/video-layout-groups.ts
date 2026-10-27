/** Arrangement metadata belongs to the canvas snapshot, not the layout pass. */
export type VideoLayoutState = {
  order: Record<string, number>;
  nextOrder: number;
  owners: Record<string, string>;
  groupOrder: Record<string, number>;
  // Frozen placement key: a new cross-group flow starts after every source
  // group; later reference edits never reorder an existing group.
  groupSortOrder?: Record<string, number>;
  // Media provenance is frozen when each canvas instance first appears.
  originOrder?: Record<string, number>;
  // Version 1 groupOrder values use original upload order rather than the
  // immediate input's arrival time. Optional fields support older snapshots.
  originVersion?: 1;
  groupCreatedOrder?: Record<string, number>;
};

export type VideoLayoutVertex = {
  id: string;
  kind: 'media' | 'workflow';
  width: number;
  height: number;
  sources: string[];
  // Primary provenance can differ from visible links, e.g. a video's main
  // frame determines upload order while its optional end frame remains linked.
  originSources?: string[];
};

const validOrder = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= 0;

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

  const originOrder: Record<string, number> = {};
  const resolvedOrigins = new Map<string, number | undefined>();
  const resolving = new Set<string>();
  function resolveOrigin(id: string): number | undefined {
    if (resolvedOrigins.has(id)) return resolvedOrigins.get(id);
    const vertex = byId.get(id);
    if (!vertex || resolving.has(id)) return undefined;
    const recorded = saved?.originOrder?.[id];
    if (vertex.kind === 'media' && validOrder(recorded)) {
      originOrder[id] = recorded;
      resolvedOrigins.set(id, recorded);
      return recorded;
    }
    resolving.add(id);
    const sources = (vertex.originSources ?? vertex.sources).filter(source => source !== id && byId.has(source));
    const inherited = sources.map(resolveOrigin).filter(validOrder);
    // Input-free generation has no original upload to inherit. Its media uses
    // its own arrival order, while workflows stay dynamic for future results.
    const value = inherited.length ? Math.min(...inherited) : vertex.kind === 'media' ? order[id] : undefined;
    resolving.delete(id);
    resolvedOrigins.set(id, value);
    if (vertex.kind === 'media' && value !== undefined) originOrder[id] = value;
    return value;
  }
  vertices.filter(vertex => vertex.kind === 'media').forEach(vertex => resolveOrigin(vertex.id));
  const sourceOrder = (id: string) => resolveOrigin(id) ?? order[id];

  // Old groupOrder stores the arrival ordinal of the first input. Translate
  // that exact input when still present; current extra inputs must not reset
  // an existing group's history. A deleted legacy input cannot be reconstructed.
  const legacyOrigins = new Map(vertices.filter(vertex => vertex.kind === 'media')
    .map(vertex => [order[vertex.id], originOrder[vertex.id]]));
  const recordedGroupOrder = (group: string): number | undefined => {
    const recorded = saved?.groupOrder[group];
    if (!validOrder(recorded)) return undefined;
    return saved?.originVersion === 1 ? recorded : legacyOrigins.get(recorded) ?? recorded;
  };
  const recordedGroupCreation = (group: string): number | undefined => {
    const recorded = saved?.groupCreatedOrder?.[group];
    if (validOrder(recorded)) return recorded;
    const creator = group.startsWith('video-group:') ? group.slice('video-group:'.length) : '';
    if (validOrder(order[creator])) return order[creator];
    const legacy = saved?.groupOrder[group];
    return validOrder(legacy) ? legacy : undefined;
  };

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
  const groupCreatedOrder: Record<string, number> = {};
  for (const vertex of vertices) {
    const group = saved?.owners[vertex.id];
    if (group && validGroups.has(group) && degree.get(vertex.id)) {
      owners[vertex.id] = group;
      groupOrder[group] ??= recordedGroupOrder(group) ?? sourceOrder(vertex.id);
      groupCreatedOrder[group] ??= recordedGroupCreation(group) ?? order[vertex.id];
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
        groupOrder[group] ??= Math.min(...sources.map(sourceOrder));
        groupCreatedOrder[group] ??= order[vertex.id];
        for (const source of sources) if (!owners[source]) owners[source] = group;
      }
      continue;
    }
    const parents = new Set(sources.flatMap(id => owners[id] ? [owners[id]] : []));
    const group = owners[vertex.id] ?? (parents.size === 1 ? [...parents][0] : `video-group:${vertex.id}`);
    const primarySources = (vertex.originSources ?? sources).filter(id => byId.has(id) && id !== vertex.id);
    const orderingSources = primarySources.length ? primarySources : sources;
    owners[vertex.id] = group;
    groupOrder[group] ??= orderingSources.length ? Math.min(...orderingSources.map(sourceOrder)) : order[vertex.id];
    groupCreatedOrder[group] ??= order[vertex.id];
    // Only previously ungrouped inputs move into this group.
    for (const source of sources) if (!owners[source]) owners[source] = group;
  }
  // Cyclic legacy edges may have put a result before its producer above.
  for (const vertex of vertices) {
    if (vertex.kind !== 'media' || owners[vertex.id]) continue;
    const parent = vertex.sources.find(id => owners[id]);
    if (parent) owners[vertex.id] = owners[parent];
  }
  const dependencies = new Map<string, Set<string>>();
  for (const vertex of vertices) {
    const group = owners[vertex.id];
    if (!group) continue;
    const parents = dependencies.get(group) ?? new Set<string>();
    for (const source of vertex.sources) {
      const parent = owners[source];
      if (parent && parent !== group) parents.add(parent);
    }
    dependencies.set(group, parents);
  }
  const groupSortOrder: Record<string, number> = {};
  const resolvingGroups = new Set<string>();
  function resolveGroupSortOrder(group: string): number {
    if (validOrder(groupSortOrder[group])) return groupSortOrder[group];
    const recorded = saved?.groupSortOrder?.[group];
    if (validOrder(recorded)) return groupSortOrder[group] = recorded;
    // Existing snapshots without this key are migrated once from their live
    // references. A legacy cycle cannot define a strict dependency order.
    if (resolvingGroups.has(group)) return groupOrder[group];
    resolvingGroups.add(group);
    const parents = [...(dependencies.get(group) ?? [])].map(resolveGroupSortOrder);
    const value = Math.max(groupOrder[group], ...parents);
    resolvingGroups.delete(group);
    groupSortOrder[group] = value;
    return value;
  }
  Object.keys(groupOrder).forEach(resolveGroupSortOrder);
  return { order, nextOrder, owners, groupOrder, groupSortOrder, originOrder, originVersion: 1, groupCreatedOrder };
}
