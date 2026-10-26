import type { VideoCanvasMedia } from './video-canvas-media';
import { materialReferenceLimit } from './material-workflow';
import { videoReferenceLimits } from './video-workflow';

export type VideoMultiSelection = {
  media: VideoCanvasMedia[];
  imageCount: number;
  videoCount: number;
  showImageActions: boolean;
  showVideoAction: boolean;
};

// Editor nodes and unfinished results do not participate in media actions.
// Preserve selection order, including distinct canvas instances of the same file.
export function videoMultiSelection(images: VideoCanvasMedia[], selected: string[]): VideoMultiSelection | null {
  const ids = [...new Set(selected)];
  if (ids.length < 2) return null;
  const byId = new Map(images.map(image => [image.id, image]));
  const media = ids.flatMap(id => {
    const image = byId.get(id);
    return image && !image.generation ? [image] : [];
  });
  if (media.length !== ids.length) return null;
  const videoCount = media.filter(image => image.video).length;
  const imageCount = media.length - videoCount;
  const withinLimits = imageCount <= videoReferenceLimits.image && videoCount <= videoReferenceLimits.video;
  return { media, imageCount, videoCount,
    showImageActions: withinLimits && videoCount === 0 && imageCount <= materialReferenceLimit('quick'),
    showVideoAction: withinLimits };
}
