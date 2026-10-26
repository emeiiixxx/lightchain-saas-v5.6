import { compactBox, type HierarchyData } from '@antv/hierarchy';
import type { VideoCanvasMedia } from './video-canvas-media';
import { videoWorkflowSize, videoWorkflowSourceIds, type VideoWorkflow } from './video-workflow';
import { materialWorkflowSize, materialWorkflowSourceIds, type MaterialWorkflow } from './material-workflow';
import { videoUpscaleWorkflowSize, videoUpscaleWorkflowSourceIds, type VideoUpscaleWorkflow } from './video-upscale-workflow';
import { reconcileVideoLayout, videoLayoutOrder, type VideoLayoutState, type VideoLayoutVertex } from './video-layout-groups';

export type { VideoLayoutState } from './video-layout-groups';
type Position = { x: number; y: number };
type LayoutGroup = { positions: Map<string, Position>; width: number; height: number };
const STACK_GAP = 120;
const EDITOR_GAP = 80;
const GROUP_GAP = 240;
const STAGE_GAP = 480;
const GROUPS_PER_ROW = 5;

export function videoLayoutVertices(images: VideoCanvasMedia[], videoWorkflows: VideoWorkflow[], materialWorkflows: MaterialWorkflow[] = [], upscaleWorkflows: VideoUpscaleWorkflow[] = []): VideoLayoutVertex[] {
  const vertices: VideoLayoutVertex[] = [
    ...images.map(image => ({ id: image.id, width: image.width, height: image.height, kind: 'media' as const,
      sources: image.sourceImageId ? [image.sourceImageId] : image.generatedByEditorId ? [image.generatedByEditorId] : [] })),
    ...videoWorkflows.map(node => ({ id: node.id, ...videoWorkflowSize(node), kind: 'workflow' as const, sources: videoWorkflowSourceIds(node) })),
    ...materialWorkflows.map(node => ({ id: node.id, ...materialWorkflowSize(node), kind: 'workflow' as const, sources: materialWorkflowSourceIds(node) })),
    ...upscaleWorkflows.map(node => ({ id: node.id, ...videoUpscaleWorkflowSize(), kind: 'workflow' as const, sources: videoUpscaleWorkflowSourceIds(node) })),
  ];
  const ids = new Set(vertices.map(vertex => vertex.id));
  return vertices.map(vertex => ({ ...vertex, sources: [...new Set(vertex.sources)].filter(id => ids.has(id) && id !== vertex.id) }));
}

// Every snapshot mutation records ownership and cross-type creation order.
// Merely dragging or changing parameters does not recompute ownership from URLs.
export function reconcileVideoWorkflowLayout(images: VideoCanvasMedia[], workflows: VideoWorkflow[], materialWorkflows: MaterialWorkflow[] = [], upscaleWorkflows: VideoUpscaleWorkflow[] = [], saved?: VideoLayoutState): VideoLayoutState {
  return reconcileVideoLayout(videoLayoutVertices(images, workflows, materialWorkflows, upscaleWorkflows), saved);
}

function layoutGroup(vertices: VideoLayoutVertex[], state: VideoLayoutState): LayoutGroup {
  const ranks = new Map<string, number>();
  const ordered = videoLayoutOrder(vertices, state.order);
  for (const vertex of ordered) {
    ranks.set(vertex.id, Math.max(0, ...vertex.sources.flatMap(source => ranks.has(source) ? [ranks.get(source)! + 1] : [])));
  }
  // Input lists determine media order; the oldest consuming editor breaks ties
  // when a shared source appears in more than one list.
  const inputOrder = new Map<string, number>();
  for (const editor of [...vertices].filter(vertex => vertex.kind === 'workflow').sort((a, b) => state.order[a.id] - state.order[b.id])) {
    for (const id of editor.sources) if (!inputOrder.has(id)) inputOrder.set(id, inputOrder.size);
  }
  const columns: VideoLayoutVertex[][] = [];
  for (const vertex of vertices) (columns[ranks.get(vertex.id)!] ??= []).push(vertex);
  for (const column of columns) column.sort((a, b) =>
    (inputOrder.get(a.id) ?? Infinity) - (inputOrder.get(b.id) ?? Infinity) || state.order[a.id] - state.order[b.id]);
  const sizes = columns.map(column => ({
    width: Math.max(0, ...column.map(item => item.width)),
    height: column.reduce((sum, item) => sum + item.height, 0) + Math.max(0, column.length - 1) * STACK_GAP,
  }));
  // Reuse the fusion canvas contour layout for ordinary branching workflows.
  // Multi-input joins use centered columns below, with each source shown once.
  const parents = new Map(vertices.map(vertex => [vertex.id, vertex.sources.filter(id =>
    ranks.has(id) && ranks.get(id)! < ranks.get(vertex.id)!)]));
  const roots = vertices.filter(vertex => !parents.get(vertex.id)!.length);
  if (roots.length === 1 && [...parents.values()].every(ids => ids.length <= 1)) {
    const tree = new Map<string, HierarchyData>();
    for (const vertex of vertices) tree.set(vertex.id, {
      id: vertex.id, height: vertex.height,
      width: sizes[ranks.get(vertex.id)!].width,
      children: [],
    });
    for (const column of columns) for (const vertex of column) {
      const parent = parents.get(vertex.id)![0];
      if (parent) tree.get(parent)!.children!.push(tree.get(vertex.id)!);
    }
    const layout = compactBox(tree.get(roots[0].id)!, {
      direction: 'LR', fixedRoot: false,
      getId: data => data.id!, getWidth: data => data.width!, getHeight: data => data.height!,
      getHGap: () => EDITOR_GAP / 2, getVGap: () => STACK_GAP / 2,
    });
    const byId = new Map(vertices.map(vertex => [vertex.id, vertex]));
    const points = new Map<string, Position>();
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    layout.eachNode(node => {
      const vertex = byId.get(node.id)!;
      const x = node.x + node.hgap, y = node.y + node.vgap;
      points.set(vertex.id, { x, y });
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x + vertex.width); bottom = Math.max(bottom, y + vertex.height);
    });
    return { positions: new Map([...points].map(([id, point]) => [id, { x: point.x - left, y: point.y - top }])), width: right - left, height: bottom - top };
  }
  const height = Math.max(0, ...sizes.map(size => size.height));
  const positions = new Map<string, Position>();
  let x = 0;
  columns.forEach((column, index) => {
    const size = sizes[index];
    let y = (height - size.height) / 2;
    for (const item of column) {
      positions.set(item.id, { x: x + (item.kind === 'media' ? size.width - item.width : 0), y });
      y += item.height + STACK_GAP;
    }
    x += size.width + (index < columns.length - 1 ? EDITOR_GAP : 0);
  });
  return { positions, width: x, height };
}

function packGroups(groups: LayoutGroup[], centerGroups = true): LayoutGroup {
  const positions = new Map<string, Position>();
  let y = 0, width = 0;
  for (let offset = 0; offset < groups.length; offset += GROUPS_PER_ROW) {
    const row = groups.slice(offset, offset + GROUPS_PER_ROW);
    const rowHeight = Math.max(...row.map(group => group.height));
    let x = 0;
    for (const group of row) {
      const groupY = y + (centerGroups ? (rowHeight - group.height) / 2 : 0);
      for (const [id, position] of group.positions) positions.set(id, { x: x + position.x, y: groupY + position.y });
      x += group.width + GROUP_GAP;
    }
    width = Math.max(width, x - GROUP_GAP);
    y += rowHeight + GROUP_GAP;
  }
  return { positions, width, height: Math.max(0, y - GROUP_GAP) };
}

// Groups retain their own assets. Cross-group references order whole groups
// into downstream stages instead of joining them into a connected component.
export function arrangeVideoWorkflowMedia(images: VideoCanvasMedia[], workflows: VideoWorkflow[], materialWorkflows: MaterialWorkflow[] = [], upscaleWorkflows: VideoUpscaleWorkflow[] = [], saved?: VideoLayoutState): Map<string, Position> {
  const vertices = videoLayoutVertices(images, workflows, materialWorkflows, upscaleWorkflows);
  const state = reconcileVideoLayout(vertices, saved);
  const members = new Map<string, VideoLayoutVertex[]>();
  for (const vertex of vertices) {
    const group = state.owners[vertex.id];
    if (!group) continue;
    const items = members.get(group) ?? [];
    items.push(vertex); members.set(group, items);
  }
  const dependencies = new Map([...members.keys()].map(id => [id, new Set<string>()]));
  for (const vertex of vertices) {
    const group = state.owners[vertex.id];
    for (const source of vertex.sources) {
      const parent = state.owners[source];
      if (group && parent && group !== parent) dependencies.get(group)!.add(parent);
    }
  }
  const pending = new Set([...members.keys()].sort((a, b) => state.groupOrder[a] - state.groupOrder[b] || a.localeCompare(b)));
  const positions = new Map<string, Position>();
  let stageX = 0, relatedHeight = 0;
  while (pending.size) {
    const ready = [...pending].filter(id => [...dependencies.get(id)!].every(parent => !pending.has(parent)));
    if (!ready.length) ready.push(pending.values().next().value!);
    const stage = packGroups(ready.map(id => layoutGroup(members.get(id)!, state)));
    for (const [id, position] of stage.positions) positions.set(id, { x: position.x + stageX, y: position.y });
    relatedHeight = Math.max(relatedHeight, stage.height);
    stageX += stage.width + STAGE_GAP;
    ready.forEach(id => pending.delete(id));
  }
  const standalone = vertices.filter(vertex => !state.owners[vertex.id]).sort((a, b) => state.order[a.id] - state.order[b.id]);
  const free = packGroups(standalone.map(vertex => ({ positions: new Map([[vertex.id, { x: 0, y: 0 }]]), width: vertex.width, height: vertex.height })), false);
  for (const [id, position] of free.positions) positions.set(id, { x: position.x, y: position.y + (members.size ? relatedHeight + STAGE_GAP : 0) });
  return positions;
}
