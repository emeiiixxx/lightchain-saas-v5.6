import type { Locale } from './i18n';
import type { MaterialWorkflow } from './material-workflow';
import { sizeVideoCanvasMedia, type VideoCanvasMedia } from './video-canvas-media';

export const gridCropExample = {
  id: 'grid-crop-camera-example',
  name: '四宫格参考图.webp',
  url: `${import.meta.env.BASE_URL}assets/grid-crop-example/source.webp`,
};

// Use source pixels without scaling, padding or gaps. Rounded boundaries also
// partition images whose dimensions are not divisible by the grid size.
export async function cropMaterialGrid(node: MaterialWorkflow, locale: Locale): Promise<Omit<VideoCanvasMedia, 'x' | 'y'>[]> {
  const reference = node.references[0];
  if (!reference) throw new Error('Missing grid image');
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = reference.url;
  await image.decode();
  const side = node.grid === 9 ? 3 : 2;
  const results: Omit<VideoCanvasMedia, 'x' | 'y'>[] = [];
  const label = locale === 'zh-CN' ? '裁切' : locale === 'ja' ? '分割' : 'Crop';
  try {
    for (let row = 0; row < side; row++) {
      for (let column = 0; column < side; column++) {
        const x = Math.round(column * image.naturalWidth / side);
        const y = Math.round(row * image.naturalHeight / side);
        const width = Math.round((column + 1) * image.naturalWidth / side) - x;
        const height = Math.round((row + 1) * image.naturalHeight / side) - y;
        if (!width || !height) throw new Error('Image is too small to split');
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas is unavailable');
        context.drawImage(image, x, y, width, height, 0, 0, width, height);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
          value => value ? resolve(value) : reject(new Error('Unable to export crop')), 'image/png'));
        results.push(sizeVideoCanvasMedia({
          id: crypto.randomUUID(),
          name: `${reference.name.replace(/\.[^.]+$/, '')} · ${label} ${results.length + 1}.png`,
          url: URL.createObjectURL(blob), width, height, naturalWidth: width, naturalHeight: height,
          generatedByEditorId: node.id,
        }));
      }
    }
    return results;
  } catch (error) {
    results.forEach(result => URL.revokeObjectURL(result.url));
    throw error;
  }
}
