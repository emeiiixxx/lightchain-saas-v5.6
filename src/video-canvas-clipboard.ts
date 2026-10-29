import type { FusionReference } from './canvas';
import { copyVideoCanvasSelection, type VideoCanvasMedia } from './video-canvas-media';
import type { VideoWorkflow } from './video-workflow';
import type { MaterialWorkflow } from './material-workflow';
import type { VideoUpscaleWorkflow } from './video-upscale-workflow';
import { createCopyFilenameAllocator } from './canvas-copy-filename';

type Scene = { images: VideoCanvasMedia[]; workflows: VideoWorkflow[]; materialWorkflows?: MaterialWorkflow[]; upscaleWorkflows?: VideoUpscaleWorkflow[] };
export type VideoCanvasCopy = Required<Scene>;

// Capture only the requested vertices. Inputs bound to an unselected canvas
// instance are removed; embedded, unbound references remain local to the copy.
export function copyVideoCanvasScene(scene: Scene, selected: string[]): VideoCanvasCopy {
  const selectedIds = new Set(selected);
  const mediaIds = new Set(scene.images.filter(item => selectedIds.has(item.id) && !item.generation).map(item => item.id));
  const editorIds = new Set([...scene.workflows, ...(scene.materialWorkflows ?? []), ...(scene.upscaleWorkflows ?? [])]
    .filter(item => selectedIds.has(item.id)).map(item => item.id));
  const reference = <T extends FusionReference>(item?: T): T | undefined => item && (!item.sourceImageId || mediaIds.has(item.sourceImageId)) ? { ...item } : undefined;
  const list = <T extends FusionReference>(items: T[]): T[] => items.flatMap(item => { const copy = reference(item); return copy ? [copy] : []; });
  const originals = new Map(scene.images.map(item => [item.id, item]));
  const images = copyVideoCanvasSelection(scene.images, [...mediaIds]).map(item => {
    const source = originals.get(item.id)!;
    return { ...item, generatedByEditorId: !source.sourceImageId && source.generatedByEditorId && editorIds.has(source.generatedByEditorId)
      ? source.generatedByEditorId : undefined };
  });
  const workflows = scene.workflows.filter(item => editorIds.has(item.id)).map(item => {
    const main = reference(item.main), endFrame = reference(item.endFrame), references = list(item.references);
    const ids = new Set([main?.id, ...references.map(value => value.id)]);
    return { ...item, main, endFrame, references, referenceOrder: item.referenceOrder?.filter(id => ids.has(id)) };
  });
  const materialWorkflows = (scene.materialWorkflows ?? []).filter(item => editorIds.has(item.id)).map(item => ({ ...item,
    references: list(item.references), back: reference(item.back), view: Array.isArray(item.view) ? [...item.view] : item.view }));
  const upscaleWorkflows = (scene.upscaleWorkflows ?? []).filter(item => editorIds.has(item.id)).map(item => ({ ...item,
    video: item.video && (!item.video.sourceImageId || mediaIds.has(item.video.sourceImageId)) ? { ...item.video } : undefined }));
  return { images, workflows, materialWorkflows, upscaleWorkflows };
}

export function videoCanvasCopyIds(copy: VideoCanvasCopy): string[] {
  return [...copy.images, ...copy.workflows, ...copy.materialWorkflows, ...copy.upscaleWorkflows].map(item => item.id);
}

export function pasteVideoCanvasScene(copy: VideoCanvasCopy, dx: number, dy: number, existing: VideoCanvasMedia[] = copy.images): VideoCanvasCopy {
  const ids = new Map(videoCanvasCopyIds(copy).map(id => [id, crypto.randomUUID()]));
  const mediaIds = new Set(copy.images.map(item => item.id));
  const editorIds = new Set([...copy.workflows, ...copy.materialWorkflows, ...copy.upscaleWorkflows].map(item => item.id));
  const nextFilename = createCopyFilenameAllocator(existing);
  const names = new Map(copy.images.map(item => [item.id, nextFilename(item)]));
  const media = (id?: string) => id && mediaIds.has(id) ? ids.get(id) : undefined;
  const editor = (id?: string) => id && editorIds.has(id) ? ids.get(id) : undefined;
  const position = (item: { id: string; x: number; y: number }) => ({ id: ids.get(item.id)!, x: item.x + dx, y: item.y + dy });
  const images = copy.images.map(item => ({ ...item, ...position(item), name: names.get(item.id)!,
    video: item.video ? { ...item.video, name: names.get(item.id)! } : undefined,
    generation: undefined, generatedTaskId: undefined, projectCover: undefined, coverOrder: undefined,
    sourceImageId: media(item.sourceImageId), generatedFromReferenceId: media(item.generatedFromReferenceId),
    generatedByEditorId: !item.sourceImageId ? editor(item.generatedByEditorId) : undefined,
  }));
  const references = () => {
    const refIds = new Map<string, string>();
    const remap = <T extends FusionReference>(item?: T): T | undefined => {
      if (!item) return undefined;
      if (!refIds.has(item.id)) refIds.set(item.id, media(item.id) ?? crypto.randomUUID());
      return { ...item, name: item.sourceImageId ? names.get(item.sourceImageId) ?? item.name : item.name,
        id: refIds.get(item.id)!, sourceImageId: media(item.sourceImageId) };
    };
    return { remap, refIds };
  };
  const workflows = copy.workflows.map(item => {
    const { remap, refIds } = references();
    const main = remap(item.main), endFrame = remap(item.endFrame), refs = item.references.map(value => remap(value)!);
    return { ...item, ...position(item), main, endFrame, references: refs,
      referenceOrder: item.referenceOrder?.flatMap(id => { const mapped = refIds.get(id); return mapped ? [mapped] : []; }) };
  });
  const materialWorkflows = copy.materialWorkflows.map(item => {
    const { remap } = references();
    return { ...item, ...position(item), references: item.references.map(value => remap(value)!), back: remap(item.back),
      view: Array.isArray(item.view) ? [...item.view] : item.view };
  });
  const upscaleWorkflows = copy.upscaleWorkflows.map(item => ({ ...item, ...position(item),
    video: item.video ? { ...item.video, name: item.video.sourceImageId ? names.get(item.video.sourceImageId) ?? item.video.name : item.video.name,
      sourceImageId: media(item.video.sourceImageId) } : undefined }));
  return { images, workflows, materialWorkflows, upscaleWorkflows };
}
