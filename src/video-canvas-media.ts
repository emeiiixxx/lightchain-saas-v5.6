import { readImage, type CanvasImage } from './canvas';
import { copyCanvasSelection } from './canvas-clipboard';
import { readVideoReference, type UploadedVideo } from './video-reference-upload';

export type VideoCanvasMedia = CanvasImage & {
  video?: UploadedVideo;
  generatedTaskId?: string;
  generation?: { taskId: string; status: 'running' | 'failed' };
};

// Size canvas geometry from intrinsic dimensions before arranging the assets.
// Landscape media cap height at 360px, portrait media use a fixed 360px width,
// and square media use a fixed 360 × 360 canvas box.
export function sizeVideoCanvasMedia<T extends Omit<VideoCanvasMedia, 'x' | 'y'>>(media: T): T {
  const width = media.video?.width ?? media.naturalWidth ?? media.width;
  const height = media.video?.height ?? media.naturalHeight ?? media.height;
  if (width === height) return { ...media, width: 360, height: 360 };
  const scale = width < height ? 360 / width : Math.min(1, 360 / height);
  return { ...media, width: width * scale, height: height * scale };
}

// Reuse the image canvas snapshot rules, retaining the original video rather
// than copying only its poster. Canvas IDs and uploaded-file IDs are separate.
export function copyVideoCanvasSelection(items: VideoCanvasMedia[], selected: string[]): VideoCanvasMedia[] {
  const originals = new Map(items.map(item => [item.id, item]));
  return copyCanvasSelection(items, selected).map(item => {
    const video = originals.get(item.id)?.video;
    return { ...item, projectCover: undefined, coverOrder: undefined, generatedTaskId: undefined, ...(video ? { video: { ...video } } : {}) };
  });
}
export { pasteCanvasSelection as pasteVideoCanvasSelection } from './canvas-clipboard';

export function prepareVideoCanvasMedia(video: UploadedVideo): Omit<VideoCanvasMedia, 'x' | 'y'> {
  return sizeVideoCanvasMedia({ id: crypto.randomUUID(), name: video.name, url: video.posterUrl, width: video.width, height: video.height, video });
}

// The caller owns a successful image URL or video.url. Video posters are data
// URLs, so they need no separate URL lifetime management.
export async function readCanvasMedia(file: File, signal: AbortSignal): Promise<Omit<VideoCanvasMedia, 'x' | 'y'>> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (file.type.startsWith('video/')) {
    const video = await readVideoReference(file, signal);
    if (signal.aborted) {
      URL.revokeObjectURL(video.url);
      throw new DOMException('Aborted', 'AbortError');
    }
    return prepareVideoCanvasMedia(video);
  }
  const image = await readImage(file);
  if (signal.aborted) {
    URL.revokeObjectURL(image.url);
    throw new DOMException('Aborted', 'AbortError');
  }
  return sizeVideoCanvasMedia(image);
}
