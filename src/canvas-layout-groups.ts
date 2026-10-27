import { workflowSources, type CanvasImage } from './canvas';
import { canvasImageOriginOrders } from './canvas-origin-order';
import { reconcileVideoLayout, type VideoLayoutState, type VideoLayoutVertex } from './video-layout-groups';

type CanvasLayoutGroup = { id: string; order: number; sortOrder?: number; createdOrder: number };
type CanvasLayoutMember = { vertexId: string; order: number; group?: CanvasLayoutGroup };
export type CanvasLayoutMetadata = { image?: CanvasLayoutMember; editor?: CanvasLayoutMember };

function verticesOf(items: CanvasImage[]): VideoLayoutVertex[] {
  return items.flatMap(item => [
    ...(!item.nodeOnly ? [{ id: item.id, kind: 'media' as const, width: item.width, height: item.height,
      sources: item.sourceImageId ? [item.sourceImageId] : item.generatedByEditorId ? [`${item.generatedByEditorId}:fusion`] : [] }] : []),
    ...(item.fusion ? [{ id: `${item.id}:fusion`, kind: 'workflow' as const, width: 0, height: 0,
      sources: workflowSources(items, item).map(source => source.id) }] : []),
  ]);
}

function savedMembers(items: CanvasImage[]) {
  const members = new Map<string, CanvasLayoutMember>();
  for (const item of items) {
    // Copies may carry the source record's fields, but never its membership.
    if (!item.nodeOnly && item.layoutMeta?.image?.vertexId === item.id) members.set(item.id, item.layoutMeta.image);
    const editorId = `${item.id}:fusion`;
    if (item.fusion && item.layoutMeta?.editor?.vertexId === editorId) members.set(editorId, item.layoutMeta.editor);
  }
  return members;
}

export function canvasLayoutGroups(items: CanvasImage[], previous: CanvasImage[] = []): VideoLayoutState {
  const vertices = verticesOf(items);
  const stored = new Map([...savedMembers(previous), ...savedMembers(items)]);
  const origins = canvasImageOriginOrders(items, previous);
  const saved: VideoLayoutState = { order: {}, nextOrder: 0, owners: {}, groupOrder: {}, groupSortOrder: {}, groupCreatedOrder: {}, originOrder: {}, originVersion: 1 };
  for (const member of stored.values()) saved.nextOrder = Math.max(saved.nextOrder, member.order + 1);
  for (const vertex of vertices) {
    const member = stored.get(vertex.id);
    if (member) {
      saved.order[vertex.id] = member.order;
      if (member.group) {
        saved.owners[vertex.id] = member.group.id;
        saved.groupOrder[member.group.id] = member.group.order;
        if (member.group.sortOrder !== undefined) saved.groupSortOrder![member.group.id] = member.group.sortOrder;
        saved.groupCreatedOrder![member.group.id] = member.group.createdOrder;
      }
    }
    const origin = origins.get(vertex.id);
    if (origin !== undefined) saved.originOrder![vertex.id] = origin;
  }
  for (const vertex of vertices) if (saved.order[vertex.id] === undefined) saved.order[vertex.id] = saved.nextOrder++;

  // Seed genuine direct batches before other consumers are classified. Once
  // metadata exists, a leftover task tag cannot reclaim a detached input or
  // another group's members. A new batch explicitly replaces that task tag.
  const previousById = new Map(previous.map(item => [item.id, item]));
  const directBatches = new Map<string, string[]>();
  for (const item of items) {
    if (item.nodeOnly || !item.layoutTaskId || saved.owners[item.id]
      || items.some(candidate => candidate.id === item.layoutTaskId && candidate.fusion)
      || !items.some(candidate => candidate.sourceImageId === item.id)) continue;
    const prior = previousById.get(item.id);
    const newlyAssigned = prior !== undefined && prior.layoutTaskId !== item.layoutTaskId;
    if (stored.has(item.id) && !newlyAssigned) continue;
    const roots = directBatches.get(item.layoutTaskId) ?? [];
    roots.push(item.id); directBatches.set(item.layoutTaskId, roots);
  }
  for (const [taskId, roots] of directBatches) {
    const id = `fusion-task:${taskId}`;
    const members = new Set(roots);
    for (let changed = true; changed;) {
      changed = false;
      for (const item of items) if (!item.nodeOnly && item.sourceImageId && members.has(item.sourceImageId)
        && !members.has(item.id) && !saved.owners[item.id]) {
        members.add(item.id); changed = true;
      }
    }
    const order = Math.min(...roots.map(root => origins.get(root) ?? saved.order[root]));
    saved.groupOrder[id] ??= order;
    saved.groupCreatedOrder![id] ??= Math.min(...[...members].filter(member => !roots.includes(member)).map(member => saved.order[member]));
    for (const member of members) saved.owners[member] = id;
  }
  // Legacy snapshots already record the first consumer of adopted inputs.
  // Establish those live owners before later consumers are considered; stale
  // tags and current snapshots with explicit membership are not migration hints.
  const legacyOwners = new Map<string, string>();
  for (const item of items) {
    if (item.nodeOnly || !item.layoutTaskId || stored.has(item.id)) continue;
    const owner = items.find(candidate => candidate.id === item.layoutTaskId && candidate.fusion);
    if (owner && workflowSources(items, owner).some(source => source.id === item.id)) legacyOwners.set(item.id, `${owner.id}:fusion`);
  }
  if (legacyOwners.size) {
    const ownerIds = new Set(legacyOwners.values());
    const firstConsumers = vertices.filter(vertex => vertex.kind === 'media' || ownerIds.has(vertex.id)
      || !vertex.sources.some(source => legacyOwners.has(source)));
    const seeded = reconcileVideoLayout(firstConsumers, saved);
    const groups = new Set([...ownerIds].flatMap(id => seeded.owners[id] ? [seeded.owners[id]] : []));
    for (const [id, group] of Object.entries(seeded.owners)) if (groups.has(group)) saved.owners[id] ??= group;
    for (const group of groups) {
      saved.groupOrder[group] ??= seeded.groupOrder[group];
      saved.groupCreatedOrder![group] ??= seeded.groupCreatedOrder![group];
      saved.groupSortOrder![group] ??= seeded.groupSortOrder![group];
    }
  }
  return reconcileVideoLayout(vertices, saved);
}

// Store membership when the snapshot changes, before an input can disappear.
// Layout reads these records; changing positions never reassigns a live group.
export function withCanvasLayoutGroups(items: CanvasImage[], previous: CanvasImage[] = []): CanvasImage[] {
  if (!items.length) return items;
  const state = canvasLayoutGroups(items, previous);
  const member = (id: string): CanvasLayoutMember => {
    const group = state.owners[id];
    return { vertexId: id, order: state.order[id], ...(group ? { group: {
      id: group, order: state.groupOrder[group], sortOrder: state.groupSortOrder?.[group] ?? state.groupOrder[group],
      createdOrder: state.groupCreatedOrder![group],
    } } : {}) };
  };
  const equal = (a: CanvasLayoutMember | undefined, b: CanvasLayoutMember | undefined) =>
    a?.vertexId === b?.vertexId && a?.order === b?.order && a?.group?.id === b?.group?.id
    && a?.group?.order === b?.group?.order && a?.group?.sortOrder === b?.group?.sortOrder
    && a?.group?.createdOrder === b?.group?.createdOrder;
  return items.map(item => {
    const image = item.nodeOnly ? undefined : member(item.id);
    const editor = item.fusion ? member(`${item.id}:fusion`) : undefined;
    return equal(item.layoutMeta?.image, image) && equal(item.layoutMeta?.editor, editor)
      ? item : { ...item, layoutMeta: { image, editor } };
  });
}
