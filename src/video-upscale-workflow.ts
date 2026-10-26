import type { CanvasImage } from './canvas';
import type { Locale } from './i18n';
import type { VideoCanvasMedia } from './video-canvas-media';
import type { UploadedVideo } from './video-reference-upload';

export const videoUpscaleResolutions = ['540p', '720p', '1080p', '2K', '4K'] as const;
export type VideoUpscaleResolution = typeof videoUpscaleResolutions[number];
export type VideoUpscaleWorkflow = {
  id: string;
  x: number;
  y: number;
  video?: UploadedVideo & { sourceImageId?: string };
  resolution: VideoUpscaleResolution;
};

const titles = { 'zh-CN': '视频高清放大', en: 'Video upscaling', ja: '動画の高画質化' };
export const videoUpscaleWorkflowTitle = (locale: Locale) => titles[locale];

// Figma 175:33379: 80px header, 368px content, 57px action with divider.
// Canvas layout, connections and selection use the same editor dimensions.
export function videoUpscaleWorkflowSize() {
  return { width: 320, height: 505 };
}

export function canGenerateVideoUpscaleWorkflow(node: VideoUpscaleWorkflow): boolean {
  return Boolean(node.video?.url) && videoUpscaleResolutions.includes(node.resolution);
}

export function createVideoUpscaleWorkflow(source?: VideoCanvasMedia): VideoUpscaleWorkflow {
  return {
    id: crypto.randomUUID(),
    x: source ? source.x + source.width + 80 : 0,
    y: source?.y ?? 0,
    video: source?.video ? { ...source.video, sourceImageId: source.id } : undefined,
    resolution: '1080p',
  };
}

export function videoUpscaleWorkflowSourceIds(node: VideoUpscaleWorkflow): string[] {
  return node.video?.sourceImageId ? [node.video.sourceImageId] : [];
}

// Deleting a canvas video clears the bound input. Clearing the input in the
// editor itself leaves the reusable canvas video and its URL ownership intact.
export function removeVideoUpscaleSources(node: VideoUpscaleWorkflow, removed: ReadonlySet<string>): VideoUpscaleWorkflow {
  return node.video?.sourceImageId && removed.has(node.video.sourceImageId) ? { ...node, video: undefined } : node;
}

export function videoUpscaleWorkflowBox(node: VideoUpscaleWorkflow): CanvasImage {
  return { id: node.id, x: node.x, y: node.y, ...videoUpscaleWorkflowSize(),
    name: videoUpscaleWorkflowTitle('zh-CN'), url: node.video?.posterUrl ?? '' };
}
