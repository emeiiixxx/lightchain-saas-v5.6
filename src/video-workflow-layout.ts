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
  const widths = columns.map(column => Math.max(0, ...column.map(item => item.width)));
  const columnX: number[] = [];
  columns.forEach((_, index) => {
    columnX[index] = index ? columnX[index - 1] + widths[index - 1] + EDITOR_GAP : 0;
  });
  const parents = new Map(vertices.map(vertex => [vertex.id, vertex.sources.filter(id =>
    ranks.has(id) && ranks.get(id)! < ranks.get(vertex.id)!)]));
  // Cut only at joins. Each remaining tree keeps its complete downstream
  // branches, so a single chain shares one center line even after a join.
  const roots = columns.flat().filter(vertex => parents.get(vertex.id)!.length !== 1);
  const tree = new Map<string, HierarchyData>();
  const byId = new Map(vertices.map(vertex => [vertex.id, vertex]));
  for (const vertex of vertices) tree.set(vertex.id, {
    id: vertex.id, height: vertex.height, width: widths[ranks.get(vertex.id)!], children: [],
  });
  for (const column of columns) for (const vertex of column) {
    const sources = parents.get(vertex.id)!;
    if (sources.length === 1) tree.get(sources[0])!.children!.push(tree.get(vertex.id)!);
  }
  type Contour = { top: number; bottom: number };
  const occupied = new Map<number, Contour[]>();
  const positions = new Map<string, Position>();
  for (const root of roots) {
    const layout = compactBox(tree.get(root.id)!, {
      direction: 'LR', fixedRoot: false,
      getId: data => data.id!, getWidth: data => data.width!, getHeight: data => data.height!,
      getHGap: () => EDITOR_GAP / 2, getVGap: () => STACK_GAP / 2,
    });
    const rootCenter = layout.y + layout.vgap + root.height / 2;
    const points = new Map<string, Position>();
    const contours = new Map<number, Contour>();
    layout.eachNode(node => {
      const vertex = byId.get(node.id)!;
      const rank = ranks.get(vertex.id)!;
      const y = node.y + node.vgap - rootCenter;
      points.set(vertex.id, {
        x: columnX[rank] + (roots.length > 1 && vertex.kind === 'media' ? widths[rank] - vertex.width : 0), y,
      });
      const contour = contours.get(rank);
      contours.set(rank, {
        top: Math.min(contour?.top ?? Infinity, y),
        bottom: Math.max(contour?.bottom ?? -Infinity, y + vertex.height),
      });
    });

    // Center a join on the full extent of its actual inputs. A shared source
    // stays in place; collisions move the whole new tree, never its nodes alone.
    const inputs = parents.get(root.id)!.filter(id => positions.has(id));
    let center = inputs.length ? (
      Math.min(...inputs.map(id => positions.get(id)!.y))
      + Math.max(...inputs.map(id => positions.get(id)!.y + byId.get(id)!.height))
    ) / 2 : 0;
    const blocked: Contour[] = [];
    for (const [rank, contour] of contours) {
      for (const previous of occupied.get(rank) ?? []) blocked.push({
        top: previous.top - STACK_GAP - contour.bottom,
        bottom: previous.bottom + STACK_GAP - contour.top,
      });
    }
    // Sorted forbidden offsets also account for long trees spanning later
    // columns, without changing the 80px horizontal layer spacing.
    blocked.sort((a, b) => a.top - b.top);
    for (const interval of blocked) if (center > interval.top && center < interval.bottom) center = interval.bottom;
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
