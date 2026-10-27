import type { CanvasImage } from './useCanvas';

// Keep automatic selection derived from the surviving images. Only an explicit
// user choice is stored in `cover`, so any newly added image can update the default.
export function resolveProjectCover(images: CanvasImage[]): CanvasImage | undefined {
  const ready = images.filter(image => !image.generating && !image.generationFailed);
  const manual = ready.find(image => image.cover);
  if (manual) return manual;
  // A generated image becomes eligible when its result replaces the placeholder;
  // uploads and copies become eligible when they are inserted into the canvas.
  const appearedAt = (image: CanvasImage) => image.generatedAt ?? image.addedAt ?? image.uploadedAt ?? 0;
  return ready.reduce<CanvasImage | undefined>((current, image) => {
    if (!current) return image;
    const delta = appearedAt(image) - appearedAt(current);
    const order = (image.generationIndex ?? 0) - (current.generationIndex ?? 0);
    return delta > 0 || (delta === 0 && (order > 0 || (order === 0 && image.id > current.id))) ? image : current;
  }, undefined);
}
