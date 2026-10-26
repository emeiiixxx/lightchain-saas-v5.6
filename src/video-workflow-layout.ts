import type { VideoCanvasMedia } from './video-canvas-media';
import { videoWorkflowSize, videoWorkflowSourceIds, type VideoWorkflow } from './video-workflow';
import { materialWorkflowSize, materialWorkflowSourceIds, type MaterialWorkflow } from './material-workflow';
import { videoUpscaleWorkflowSize, videoUpscaleWorkflowSourceIds, type VideoUpscaleWorkflow } from './video-upscale-workflow';
import { reconcileVideoLayout, type VideoLayoutState, type VideoLayoutVertex } from './video-layout-groups';
import { orderedLayoutStages } from './canvas-layout-stages';
import { layoutConnectedGroup } from './canvas-connected-layout';

export type { VideoLayoutState } from './video-layout-groups';
type Position = { x: number; y: number };
type LayoutGroup = { positions: Map<string, Position>; width: number; height: number };
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
  const orderedGroups = [...members.keys()].sort((a, b) => state.groupOrder[a] - state.groupOrder[b] || a.localeCompare(b));
  const stages = orderedLayoutStages(orderedGroups, dependencies);
  const positions = new Map<string, Position>();
  let stageX = 0, relatedHeight = 0;
  for (const groups of stages) {
    const stage = packGroups(groups.map(id => layoutConnectedGroup(members.get(id)!, state.order)));
    for (const [id, position] of stage.positions) positions.set(id, { x: position.x + stageX, y: position.y });
    relatedHeight = Math.max(relatedHeight, stage.height);
    stageX += stage.width + STAGE_GAP;
  }
  const standalone = vertices.filter(vertex => !state.owners[vertex.id]).sort((a, b) => state.order[a.id] - state.order[b.id]);
  const free = packGroups(standalone.map(vertex => ({ positions: new Map([[vertex.id, { x: 0, y: 0 }]]), width: vertex.width, height: vertex.height })), false);
  for (const [id, position] of free.positions) positions.set(id, { x: position.x, y: position.y + (members.size ? relatedHeight + STAGE_GAP : 0) });
  return positions;
}
