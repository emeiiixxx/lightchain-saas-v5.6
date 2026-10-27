import { materialReferenceLimit, materialWorkflowHasBackView, materialWorkflowSourceIds, type MaterialWorkflow } from './material-workflow';
import type { VideoCanvasMedia } from './video-canvas-media';
import { videoUpscaleWorkflowSourceIds, type VideoUpscaleWorkflow } from './video-upscale-workflow';
import { videoReferenceLimits, videoWorkflowReferences, videoWorkflowSourceIds, type VideoReference, type VideoWorkflow } from './video-workflow';

export type WorkflowReferenceTarget =
  | { editor?: 'video'; id: string; field: 'main' | 'endFrame' | 'references'; kind: VideoReference['kind'] }
  | { editor: 'material'; id: string; field: 'references' | 'back'; kind: 'image' }
  | { editor: 'upscale'; id: string; field: 'video'; kind: 'video' };

export type ReferenceScene = {
  images: VideoCanvasMedia[];
  workflows: VideoWorkflow[];
  materialWorkflows?: MaterialWorkflow[];
  upscaleWorkflows?: VideoUpscaleWorkflow[];
};

type ReferenceOptions = { valid: boolean; limit: number; candidates: VideoCanvasMedia[] };

function downstreamIds(state: ReferenceScene, editorId: string): Set<string> {
  const children = new Map<string, Set<string>>();
  const connect = (source: string | undefined, target: string) => {
    if (!source) return;
    const targets = children.get(source) ?? new Set<string>();
    targets.add(target); children.set(source, targets);
  };
  for (const image of state.images) {
    connect(image.sourceImageId, image.id);
    connect(image.generatedByEditorId, image.id);
  }
  for (const node of state.workflows) videoWorkflowSourceIds(node).forEach(source => connect(source, node.id));
  for (const node of state.materialWorkflows ?? []) materialWorkflowSourceIds(node).forEach(source => connect(source, node.id));
  for (const node of state.upscaleWorkflows ?? []) videoUpscaleWorkflowSourceIds(node).forEach(source => connect(source, node.id));
  const reached = new Set([editorId]);
  const queue = [editorId];
  for (let index = 0; index < queue.length; index++) {
    for (const child of children.get(queue[index]) ?? []) {
      if (!reached.has(child)) { reached.add(child); queue.push(child); }
    }
  }
  return reached;
}

export function referenceOptions(state: ReferenceScene, target: WorkflowReferenceTarget): ReferenceOptions {
  const invalid: ReferenceOptions = { valid: false, limit: 0, candidates: [] };
  let limit: number;
  let bound: (string | undefined)[];
  if (target.editor === 'material') {
    const node = state.materialWorkflows?.find(item => item.id === target.id);
    if (!node || target.kind !== 'image') return invalid;
    if (target.field === 'back') {
      if (!materialWorkflowHasBackView(node)) return invalid;
      limit = 1; bound = [node.back?.sourceImageId];
    } else {
      limit = Math.max(0, materialReferenceLimit(node.kind) - node.references.length);
      bound = node.references.map(reference => reference.sourceImageId);
    }
  } else if (target.editor === 'upscale') {
    const node = state.upscaleWorkflows?.find(item => item.id === target.id);
    if (!node || target.kind !== 'video' || target.field !== 'video') return invalid;
    limit = 1; bound = [node.video?.sourceImageId];
  } else {
    const node = state.workflows.find(item => item.id === target.id);
    if (!node) return invalid;
    if (target.field === 'references') {
      if (node.mode !== 'references') return invalid;
      const references = videoWorkflowReferences(node).filter(reference => reference.kind === target.kind);
      limit = Math.max(0, videoReferenceLimits[target.kind] - references.length);
      bound = references.map(reference => reference.sourceImageId);
    } else {
      if (node.mode !== 'frames' || target.kind !== 'image') return invalid;
      limit = 1; bound = [node[target.field]?.sourceImageId];
    }
  }
  const excluded = downstreamIds(state, target.id);
  bound.forEach(id => { if (id) excluded.add(id); });
  const candidates = state.images.filter(image => !image.nodeOnly && !image.generation && !excluded.has(image.id)
    && (target.kind === 'video' ? Boolean(image.video?.url) : !image.video && Boolean(image.url)));
  return { valid: true, limit, candidates };
}

function mediaReference(source: VideoCanvasMedia): VideoReference {
  return source.video
    ? { ...source.video, id: crypto.randomUUID(), sourceImageId: source.id, name: source.name }
    : { id: crypto.randomUUID(), sourceImageId: source.id, name: source.name, url: source.url, kind: 'image' };
}

// Validate against the current scene immediately before the caller commits.
// Only reference fields change: the canvas instances keep their IDs and positions.
export function bindCanvasReferences<T extends ReferenceScene>(state: T, target: WorkflowReferenceTarget, ids: string[]): T | null {
  const options = referenceOptions(state, target);
  if (!options.valid || !ids.length || ids.length > options.limit || new Set(ids).size !== ids.length) return null;
  const candidates = new Map(options.candidates.map(image => [image.id, image]));
  const sources = ids.flatMap(id => candidates.get(id) ?? []);
  if (sources.length !== ids.length) return null;
  if (target.editor === 'upscale') {
    const source = sources[0];
    if (!source.video) return null;
    return { ...state, upscaleWorkflows: state.upscaleWorkflows?.map(node => node.id === target.id
      ? { ...node, video: { ...source.video!, id: crypto.randomUUID(), sourceImageId: source.id, name: source.name } }
      : node) };
  }
  const references = sources.map(mediaReference);
  if (target.editor === 'material') {
    return { ...state, materialWorkflows: state.materialWorkflows?.map(node => node.id === target.id
      ? target.field === 'back' ? { ...node, back: references[0] } : { ...node, references: [...node.references, ...references] }
      : node) };
  }
  return { ...state, workflows: state.workflows.map(node => {
    if (node.id !== target.id) return node;
    if (target.field === 'references') return { ...node, references: [...node.references, ...references] };
    return { ...node, [target.field]: references[0] };
  }) };
}
