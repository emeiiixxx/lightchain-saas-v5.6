import { batchMainImages, fusionReferences, isMultiInputWorkflow, workflowInputs, workflowSources, type CanvasImage } from './canvas';

export type FusionCanvasReferenceTarget = { target: string; role?: 'main' };

// Use canvas identity for the node's inputs and outputs. Different results can
// share a demo asset URL, so URL equality does not establish output ownership.
export function fusionCanvasReferenceCandidates(items: CanvasImage[], target: FusionCanvasReferenceTarget): CanvasImage[] {
  const owner = items.find(item => item.id === target.target);
  if (!owner?.fusion) return [];
  const settings = owner.fusion;
  const excluded = new Set(workflowSources(items, owner).map(image => image.id));
  const inputs = [
    ...fusionReferences(settings),
    ...batchMainImages(settings),
    ...(settings.directedPoints ?? []).map(point => point.reference),
  ];
  for (const reference of inputs) excluded.add(reference.sourceImageId ?? reference.id);
  for (const image of items) {
    if (image.generatedByEditorId === owner.id) excluded.add(image.id);
  }

  // Retain the existing per-field duplicate rule for ordinary reference lists.
  const linkedInputs = target.role === 'main' || (isMultiInputWorkflow(settings) && settings.kind !== 'batch');
  const currentReferences = target.role === 'main' ? workflowInputs(settings) : fusionReferences(settings);
  const existingUrls = new Set(linkedInputs ? [] : currentReferences.map(reference => reference.url));
  return items.filter(image => !image.nodeOnly && !image.generation && !excluded.has(image.id) && !existingUrls.has(image.url));
}
