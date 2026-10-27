import { isMultiInputWorkflow, workflowHeight, workflowWidth, fusionPosition, fusionReferences, type CanvasImage } from './canvas';

// Snapshot visible vertices independently, including legacy image/editor pairs.
// Relationships in this snapshot use snapshot IDs (editor IDs end in :fusion).
// Keep only edges whose two endpoints are copied; never attach to the originals.
// Multi-input editor copies start with empty primary inputs, retaining their prompt/settings.
// Batch shared reference images remain separate from those primary inputs.
export function copyCanvasSelection(items: CanvasImage[], selected: string[]): CanvasImage[] {
  const ids = new Set(selected);
  const imageIds = new Set(items.filter(item => !item.nodeOnly && !item.generation && ids.has(item.id)).map(item => item.id));
  const editorIds = new Set(items.filter(item => item.fusion && ids.has(`${item.id}:fusion`)).map(item => item.id));
  return items.flatMap(item => {
    const copies: CanvasImage[] = [];
    if (imageIds.has(item.id)) {
      // Cutout provenance wins over inherited legacy generation metadata, even
      // when its source is outside the selection. Do not resurrect a stale edge.
      const sourceImageId = item.sourceImageId && imageIds.has(item.sourceImageId) ? item.sourceImageId : undefined;
      const generatedByEditorId = item.sourceImageId == null && item.generatedByEditorId && editorIds.has(item.generatedByEditorId)
        ? `${item.generatedByEditorId}:fusion` : undefined;
      copies.push({ id: item.id, name: item.name, url: item.url, x: item.x, y: item.y, width: item.width, height: item.height,
        naturalWidth: item.naturalWidth, naturalHeight: item.naturalHeight,
        sourceImageId, generatedByEditorId, generatedFromReferenceId: item.generatedFromReferenceId && imageIds.has(item.generatedFromReferenceId) ? item.generatedFromReferenceId : undefined });
    }
    if (item.fusion && editorIds.has(item.id)) {
      const position = { ...fusionPosition(item) };
      const sourceId = item.editorSourceId ?? (!item.nodeOnly ? item.id : undefined);
      copies.push({
        id: `${item.id}:fusion`, name: '', url: '', ...position,
        width: workflowWidth(item.fusion), height: workflowHeight(item.fusion), nodeOnly: true,
        editorSourceId: !isMultiInputWorkflow(item.fusion) && sourceId && imageIds.has(sourceId) ? sourceId : undefined,
        fusion: {
          kind: item.fusion.kind, position, prompt: item.fusion.prompt, ratio: item.fusion.ratio, resolution: item.fusion.resolution,
          batchFlat: item.fusion.batchFlat, flatRegion: item.fusion.flatRegion, flatFace: item.fusion.flatFace,
          drawingGuide: sourceId && imageIds.has(sourceId) ? item.fusion.drawingGuide : undefined,
          mainImages: item.fusion.kind === 'batch' ? [] : undefined,
          references: isMultiInputWorkflow(item.fusion) && item.fusion.kind !== 'batch' ? [] : fusionReferences(item.fusion).map(reference => ({ ...reference,
            sourceImageId: reference.sourceImageId && imageIds.has(reference.sourceImageId) ? reference.sourceImageId : undefined })),
          directedPoints: item.fusion.directedPoints?.map(point => ({ ...point, reference: { ...point.reference } })),
        },
      });
    }
    return copies;
  });
}

export function pasteCanvasSelection(items: CanvasImage[], dx: number, dy: number): CanvasImage[] {
  items = items.filter(item => !item.generation);
  // Allocate all IDs first so forward edges, branches and repeated pastes map
  // exclusively to this batch, regardless of the order of snapshot records.
  const newIds = new Map(items.map(item => [item.id, crypto.randomUUID()]));
  const imageIds = new Set(items.filter(item => !item.nodeOnly).map(item => item.id));
  const editorIds = new Set(items.filter(item => item.fusion).map(item => item.id));
  const remapImage = (id?: string) => id && imageIds.has(id) ? newIds.get(id) : undefined;
  const remapEditor = (id?: string) => id && editorIds.has(id) ? newIds.get(id) : undefined;
  return items.map(item => {
    const position = { x: item.x + dx, y: item.y + dy };
    return {
      ...item, id: newIds.get(item.id)!, ...position,
      generatedTaskId: undefined, generation: undefined,
      editorSourceId: isMultiInputWorkflow(item.fusion) ? undefined : remapImage(item.editorSourceId),
      sourceImageId: remapImage(item.sourceImageId),
      generatedFromReferenceId: remapImage(item.generatedFromReferenceId),
      generatedByEditorId: item.sourceImageId == null ? remapEditor(item.generatedByEditorId) : undefined,
      fusion: item.fusion ? {
        ...item.fusion, position, reference: undefined,
        mainImages: item.fusion.kind === 'batch' ? [] : undefined,
        references: isMultiInputWorkflow(item.fusion) && item.fusion.kind !== 'batch' ? [] : fusionReferences(item.fusion).map(reference => {
          const sourceImageId = remapImage(reference.sourceImageId);
          return { ...reference, id: sourceImageId ?? reference.id, sourceImageId };
        }),
        directedPoints: item.fusion.directedPoints?.map(point => ({ ...point, id: crypto.randomUUID(), reference: { ...point.reference } })),
      } : undefined,
    };
  });
}
