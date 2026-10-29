import { centerAddedFlowBranches, type LocalFlowVertex } from './flow-local-centering';
import type { ReferenceScene } from './video-canvas-references';
import { reconcileVideoWorkflowLayout, videoLayoutVertices, type VideoLayoutState } from './video-workflow-layout';

type VideoFlowScene = ReferenceScene & { layout?: VideoLayoutState };

function localVertices(scene: VideoFlowScene): LocalFlowVertex[] {
  const positions = new Map([
    ...scene.images,
    ...scene.workflows,
    ...(scene.materialWorkflows ?? []),
    ...(scene.upscaleWorkflows ?? []),
  ].map(item => [item.id, { x: item.x, y: item.y }]));
  return videoLayoutVertices(scene.images, scene.workflows, scene.materialWorkflows, scene.upscaleWorkflows)
    .map(vertex => ({ ...vertex, ...positions.get(vertex.id)! }));
}

// Used only by explicit flow additions. Dragging, parameter edits, history
// restoration and task settlement keep their existing positions and behavior.
export function centerVideoFlowAddition<T extends VideoFlowScene>(previous: T, next: T): T {
  const layout = reconcileVideoWorkflowLayout(next.images, next.workflows, next.materialWorkflows, next.upscaleWorkflows, next.layout);
  const positions = centerAddedFlowBranches(localVertices(previous), localVertices(next), layout);
  const position = <Item extends { id: string; x: number; y: number }>(item: Item): Item => {
    const point = positions.get(item.id);
    return point ? { ...item, ...point } : item;
  };
  return {
    ...next,
    images: next.images.map(position),
    workflows: next.workflows.map(position),
    materialWorkflows: next.materialWorkflows?.map(position),
    upscaleWorkflows: next.upscaleWorkflows?.map(position),
    layout,
  };
}
