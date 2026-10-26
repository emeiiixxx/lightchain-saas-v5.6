import type { CanvasImage, FusionReference } from './canvas';
import type { Locale } from './i18n';

export type VideoFrameReference = FusionReference;
export type VideoReference = VideoFrameReference & { kind: 'image' | 'video' };
export type VideoWorkflow = {
  id: string;
  x: number;
  y: number;
  mode: 'frames' | 'references';
  generationMode: 'fast' | 'professional';
  main?: VideoFrameReference;
  endFrame?: VideoReference;
  references: VideoReference[];
  referenceOrder?: string[];
  prompt: string;
  smartExpand?: boolean;
  resolution: string;
  duration: string;
  ratio: string;
  audio: 'auto' | 'mute';
};

export function videoWorkflowTitle(mode: VideoWorkflow['mode'], locale: Locale): string {
  const titles = {
    'zh-CN': { frames: '服装短视频', references: '专业服装视频' },
    en: { frames: 'Fashion short video', references: 'Professional fashion video' },
    ja: { frames: 'ファッション短編動画', references: 'プロ向けファッション動画' },
  };
  return titles[locale][mode];
}

// Figma configuration menus: fast 113:8633, professional 113:8634.
export const videoGenerationConfig = {
  fast: { nodeId: '113:8633', resolutions: ['768p', '2K'], defaultResolution: '768p', audioOptions: ['auto'], maxDuration: 15 },
  professional: { nodeId: '113:8634', resolutions: ['480p', '720p', '1080p'], defaultResolution: '480p', audioOptions: ['auto', 'mute'], maxDuration: 30 },
} as const;

export function videoWorkflowSize(value: VideoWorkflow['mode'] | VideoWorkflow) {
  const mode = typeof value === 'string' ? value : value.mode;
  if (mode === 'frames') return { width: 320, height: 641 };
  const references = typeof value === 'string' ? [] : videoWorkflowReferences(value);
  const extraRows = (['image', 'video'] as const).reduce((total, kind) => {
    const count = references.filter(reference => reference.kind === kind).length;
    const slots = count + (count < videoReferenceLimits[kind] ? 1 : 0);
    return total + Math.max(0, Math.ceil(slots / 4) - 1);
  }, 0);
  return { width: 320, height: 661 + extraRows * 72 };
}

export function videoDurationLimit(mode: VideoWorkflow['generationMode']) {
  return videoGenerationConfig[mode].maxDuration;
}

export function clampVideoDuration(duration: string, mode: VideoWorkflow['generationMode']) {
  const seconds = Number.parseInt(duration, 10);
  const stepped = Number.isFinite(seconds) ? Math.round(seconds / 5) * 5 : 5;
  return `${Math.max(5, Math.min(videoDurationLimit(mode), stepped))}s`;
}

// Apply mode changes atomically so undo restores the complete configuration.
export function normalizeVideoWorkflowSettings(node: VideoWorkflow): VideoWorkflow {
  const generationMode = node.generationMode === 'professional' ? 'professional' : 'fast';
  const config = videoGenerationConfig[generationMode];
  const resolutions: readonly string[] = config.resolutions;
  const resolution = resolutions.includes(node.resolution) ? node.resolution : config.defaultResolution;
  const audio = generationMode === 'professional' && node.audio === 'mute' ? 'mute' : 'auto';
  const duration = clampVideoDuration(node.duration, generationMode);
  if (generationMode === node.generationMode && resolution === node.resolution && audio === node.audio && duration === node.duration) return node;
  return { ...node, generationMode, resolution, audio, duration };
}

export const videoReferenceLimits = { image: 9, video: 3 } as const;

// Main-image identity stays separate from its visual position and business link.
export function videoWorkflowReferences(node: VideoWorkflow): VideoReference[] {
  const seen = new Set<string>();
  const references = [...(node.main ? [{ ...node.main, kind: 'image' as const }] : []), ...node.references].filter(reference => {
    // Multi-selection binds each canvas instance, even when files share a URL.
    // Picker uploads still enforce their own URL reuse before creating references.
    const identity = `${reference.kind}:${reference.sourceImageId ?? (reference.kind === 'image' ? reference.id : reference.url)}`;
    if (seen.has(identity)) return false;
    seen.add(identity); return true;
  });
  const byId = new Map(references.map(reference => [reference.id, reference]));
  const ordered: VideoReference[] = [];
  for (const id of node.referenceOrder ?? []) {
    const reference = byId.get(id);
    if (reference) { ordered.push(reference); byId.delete(id); }
  }
  return [...ordered, ...byId.values()];
}

export function canGenerateVideoWorkflow(node: VideoWorkflow): boolean {
  const hasSource = node.mode === 'frames' ? Boolean(node.main?.url)
    : videoWorkflowReferences(node).some(reference => Boolean(reference.url));
  return hasSource && node.prompt.trim().length > 0;
}

// sourceImageId is the shared reference field; in this workspace it identifies
// either an image or a video on the canvas. Multiple slots can share one source.
export function videoWorkflowSourceIds(node: VideoWorkflow): string[] {
  const references = node.mode === 'frames' ? [node.main, node.endFrame] : videoWorkflowReferences(node);
  return [...new Set(references.flatMap(reference => reference?.sourceImageId ? [reference.sourceImageId] : []))];
}

// Canvas deletion clears every bound slot, including values in an inactive mode.
// Removing an editor slot itself does not remove the reusable canvas material.
export function removeVideoWorkflowSources(node: VideoWorkflow, removed: ReadonlySet<string>): VideoWorkflow {
  const isRemoved = (reference?: VideoFrameReference) => Boolean(reference?.sourceImageId && removed.has(reference.sourceImageId));
  const main = isRemoved(node.main) ? undefined : node.main;
  const endFrame = isRemoved(node.endFrame) ? undefined : node.endFrame;
  const references = node.references.filter(reference => !isRemoved(reference));
  if (main === node.main && endFrame === node.endFrame && references.length === node.references.length) return node;
  const next = { ...node, main, endFrame, references };
  const remainingIds = new Set(videoWorkflowReferences(next).map(reference => reference.id));
  return { ...next, referenceOrder: node.referenceOrder?.filter(id => remainingIds.has(id)) };
}

// Move within one media section; other kinds retain their positions. The caller
// commits this array as referenceOrder in one undoable node update.
export function reorderVideoReferences(node: VideoWorkflow, kind: VideoReference['kind'], sourceId: string, targetId: string): string[] {
  const references = videoWorkflowReferences(node);
  const section = references.filter(reference => reference.kind === kind);
  const source = section.findIndex(reference => reference.id === sourceId);
  const target = section.findIndex(reference => reference.id === targetId);
  if (source < 0 || target < 0 || source === target) return references.map(reference => reference.id);
  section.splice(target, 0, ...section.splice(source, 1));
  let index = 0;
  return references.map(reference => reference.kind === kind ? section[index++].id : reference.id);
}

export function createVideoWorkflow(x: number, y: number, source?: CanvasImage, mode: VideoWorkflow['mode'] = 'frames'): VideoWorkflow {
  const longVideo = mode === 'references';
  return { id: crypto.randomUUID(), x, y, mode, generationMode: longVideo ? 'professional' : 'fast',
    main: source ? { id: source.id, sourceImageId: source.id, name: source.name, url: source.url } : undefined,
    references: [], prompt: '', smartExpand: false, resolution: videoGenerationConfig[longVideo ? 'professional' : 'fast'].defaultResolution, duration: longVideo ? '30s' : '5s', ratio: 'auto', audio: 'auto' };
}

// Canvas navigation and React Flow share the same geometry for images and nodes.
export function videoWorkflowBox(node: VideoWorkflow): CanvasImage {
  return { id: node.id, x: node.x, y: node.y, ...videoWorkflowSize(node),
    name: videoWorkflowTitle(node.mode, 'zh-CN'), url: node.main?.url ?? videoWorkflowReferences(node).find(reference => reference.kind === 'image')?.url ?? '' };
}
