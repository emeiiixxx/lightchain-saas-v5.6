import type { VideoCanvasMedia } from './video-canvas-media';
import { videoWorkflowSize, videoWorkflowSourceIds, type VideoWorkflow } from './video-workflow';
import { materialWorkflowSize, materialWorkflowSourceIds, type MaterialWorkflow } from './material-workflow';
import { videoUpscaleWorkflowSize, videoUpscaleWorkflowSourceIds, type VideoUpscaleWorkflow } from './video-upscale-workflow';
import { reconcileVideoLayout, type VideoLayoutState, type VideoLayoutVertex } from './video-layout-groups';
import { orderedLayoutStages } from './canvas-layout-stages';
import { layoutConnectedGroup } from './canvas-connected-layout';
import { placeConnectedGroupStages } from './canvas-group-placement';
import { canvasSafeArea } from './canvas';
import { packStandaloneRows } from './canvas-standalone-layout';

export type { VideoLayoutState } from './video-layout-groups';
type Position = { x: number; y: number };
const GROUP_GAP = 240;
const GROUPS_PER_ROW = 5;

export function videoLayoutVertices(images: VideoCanvasMedia[], videoWorkflows: VideoWorkflow[], materialWorkflows: MaterialWorkflow[] = [], upscaleWorkflows: VideoUpscaleWorkflow[] = []): VideoLayoutVertex[] {
  const vertices: VideoLayoutVertex[] = [
    ...images.map(image => ({ id: image.id, width: image.width, height: image.height, kind: 'media' as const,
      sources: image.sourceImageId ? [image.sourceImageId] : image.generatedByEditorId ? [image.generatedByEditorId] : [] })),
    ...videoWorkflows.map(node => ({ id: node.id, ...videoWorkflowSize(node), kind: 'workflow' as const,
      sources: videoWorkflowSourceIds(node),
      ...(node.mode === 'frames' ? { originSources: node.main?.sourceImageId ? [node.main.sourceImageId] : [] } : {}),
    })),
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
// Groups retain their own assets. Cross-group references order whole groups
// into downstream stages instead of joining them into a connected component.
export function arrangeVideoWorkflowMedia(images: VideoCanvasMedia[], workflows: VideoWorkflow[], materialWorkflows: MaterialWorkflow[] = [], upscaleWorkflows: VideoUpscaleWorkflow[] = [], saved?: VideoLayoutState, viewport = { width: 1440, height: 852, zoom: 1 }): Map<string, Position> {
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
  const orderedGroups = [...members.keys()].sort((a, b) => state.groupOrder[a] - state.groupOrder[b]
    || (state.groupCreatedOrder?.[a] ?? state.groupOrder[a]) - (state.groupCreatedOrder?.[b] ?? state.groupOrder[b])
    || a.localeCompare(b));
  const stages = orderedLayoutStages(orderedGroups, dependencies);
  const related = placeConnectedGroupStages(stages.map(groups => groups.map(id => ({
    layout: layoutConnectedGroup(members.get(id)!, state.order), vertices: members.get(id)!,
  }))), state.order, { groupGap: GROUP_GAP, groupsPerRow: GROUPS_PER_ROW, centerStages: false });
  const positions = new Map(related.positions);
  const standalone = vertices.filter(vertex => !state.owners[vertex.id]).sort((a, b) => state.order[a.id] - state.order[b.id]);
  const zoom = Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1;
  const rowWidth = canvasSafeArea(viewport.width, viewport.height).width / zoom;
  const free = packStandaloneRows(standalone, rowWidth);
  for (const { item, x, y } of free.placements) positions.set(item.id, { x, y: y + (members.size ? related.height + GROUP_GAP : 0) });
  return positions;
}
