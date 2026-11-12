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
      positionPinned: editor ? editor.fusion?.positionPinned : item.positionPinned,
      sources: editor ? workflowSources(items, editor).map(source => source.id)
        : item.sourceImageId ? [item.sourceImageId]
          : item.generatedByEditorId ? [`${item.generatedByEditorId}:fusion`] : [],
    };
  });
}

// Keep image and editor pins independent even in a legacy combined record.
// Snapshot history retains them along with the object's actual coordinates.
export function pinFusionPositions(items: CanvasImage[], movedIds: Iterable<string>): CanvasImage[] {
  const moved = new Set(movedIds);
  return items.map(item => {
    const pinImage = !item.nodeOnly && moved.has(item.id);
    const pinEditor = !!item.fusion && moved.has(`${item.id}:fusion`);
    if ((!pinImage || item.positionPinned) && (!pinEditor || item.fusion?.positionPinned)) return item;
    return { ...item, ...(pinImage ? { positionPinned: true } : {}),
      ...(pinEditor ? { fusion: { ...item.fusion!, positionPinned: true } } : {}) };
  });
}

// Apply only during a connected addition. Dragging, settings, history and task
// completion keep the geometry recorded by their existing snapshot paths.
export function centerAddedFusionBranches(previous: CanvasImage[], next: CanvasImage[]): CanvasImage[] {
  const state = canvasLayoutGroups(next, previous);
  const before = verticesOf(previous), after = verticesOf(next);
  const positions = centerAddedFlowBranches(before, after, state);
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
