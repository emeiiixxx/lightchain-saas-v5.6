import { centerAddedFlowBranches, type LocalFlowVertex } from './flow-local-centering';
import type { ReferenceScene } from './video-canvas-references';
import { reconcileVideoWorkflowLayout, videoLayoutVertices, type VideoLayoutState } from './video-workflow-layout';

type VideoFlowScene = ReferenceScene & { layout?: VideoLayoutState };
type PositionedItem = { id: string; x: number; y: number; positionPinned?: boolean };

const sceneObjects = (scene: VideoFlowScene) => [
  ...scene.images, ...scene.workflows, ...(scene.materialWorkflows ?? []), ...(scene.upscaleWorkflows ?? []),
];
const sceneLayout = (scene: VideoFlowScene) => reconcileVideoWorkflowLayout(
  scene.images, scene.workflows, scene.materialWorkflows, scene.upscaleWorkflows, scene.layout,
);

// Pin only the objects that actually move. Other objects in the same group
// remain available to automatic layout; undo/redo retains each object's choice.
export function moveVideoFlowNodes<T extends VideoFlowScene>(scene: T, positions: ReadonlyMap<string, { x: number; y: number }>): T {
  let moved = false;
  const move = <Item extends PositionedItem>(item: Item): Item => {
    const point = positions.get(item.id);
    if (!point || (point.x === item.x && point.y === item.y)) return item;
    moved = true;
    return { ...item, ...point, positionPinned: true };
  };
  const next = { ...scene, images: scene.images.map(move), workflows: scene.workflows.map(move),
    materialWorkflows: scene.materialWorkflows?.map(move), upscaleWorkflows: scene.upscaleWorkflows?.map(move) };
  return moved ? next : scene;
}

function localVertices(scene: VideoFlowScene): LocalFlowVertex[] {
  const positions = new Map(sceneObjects(scene).map(item => [item.id, { x: item.x, y: item.y, positionPinned: item.positionPinned }]));
  return videoLayoutVertices(scene.images, scene.workflows, scene.materialWorkflows, scene.upscaleWorkflows)
    .map(vertex => ({ ...vertex, ...positions.get(vertex.id)! }));
}

// Explicit additions and live result-size changes share the same per-object pins.
// History restoration never enters this layout pass.
export function centerVideoFlowAddition<T extends VideoFlowScene>(previous: T, next: T): T {
  const layout = sceneLayout(next);
  const positions = centerAddedFlowBranches(localVertices(previous), localVertices(next), layout);
  const position = <Item extends PositionedItem>(item: Item): Item => {
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
