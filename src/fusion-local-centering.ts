import { canvasNodes, fusionPosition, workflowSources, type CanvasImage } from './canvas';
import { canvasLayoutGroups } from './canvas-layout-groups';
import { centerAddedFlowBranches, type LocalFlowVertex } from './flow-local-centering';

function verticesOf(items: CanvasImage[]): LocalFlowVertex[] {
  const editors = new Map(items.filter(item => item.fusion).map(item => [`${item.id}:fusion`, item]));
  return canvasNodes(items).map<LocalFlowVertex>(item => {
    const editor = editors.get(item.id);
    return {
      id: item.id, kind: editor ? 'workflow' : 'media',
      x: item.x, y: item.y, width: item.width, height: item.height,
      sources: editor ? workflowSources(items, editor).map(source => source.id)
        : item.sourceImageId ? [item.sourceImageId]
          : item.generatedByEditorId ? [`${item.generatedByEditorId}:fusion`] : [],
    };
  });
}

// Apply only during a connected addition. Dragging, settings, history and task
// completion keep the geometry recorded by their existing snapshot paths.
export function centerAddedFusionBranches(previous: CanvasImage[], next: CanvasImage[]): CanvasImage[] {
  const positions = centerAddedFlowBranches(verticesOf(previous), verticesOf(next), canvasLayoutGroups(next, previous));
  if (!positions.size) return next;
  return next.map(item => {
    const image = item.nodeOnly ? undefined : positions.get(item.id);
    const editor = item.fusion ? positions.get(`${item.id}:fusion`) : undefined;
    if (!image && !editor) return item;
    return {
      ...item, ...(image ?? (item.nodeOnly ? editor : undefined)),
      // A combined legacy record can still use an implicit editor position.
      // Moving its image must not also move that editor unless layout moves it.
      ...(item.fusion ? { fusion: { ...item.fusion, position: editor ?? fusionPosition(item) } } : {}),
    };
  });
}
