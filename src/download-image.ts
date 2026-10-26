export const downloadFormats = ['PNG', 'JPG', 'AVIF'] as const;
export type DownloadFormat = typeof downloadFormats[number];

export class ImageExportError extends Error {
  readonly reason: 'unsupported' | 'failed';

  constructor(reason: 'unsupported' | 'failed') {
    super(reason === 'unsupported' ? 'Image export format is unsupported' : 'Image export failed');
    this.name = 'ImageExportError';
    this.reason = reason;
  }
}

export async function encodeImage(image: HTMLImageElement, format: DownloadFormat): Promise<Blob> {
  try {
    if (!image.naturalWidth || !image.naturalHeight) throw new ImageExportError('failed');
    const output = document.createElement('canvas');
    output.width = image.naturalWidth;
    output.height = image.naturalHeight;
    const ctx = output.getContext('2d');
    if (!ctx) throw new ImageExportError('failed');
    if (format === 'JPG') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, output.width, output.height);
    }
    ctx.drawImage(image, 0, 0);
    const mime = format === 'JPG' ? 'image/jpeg' : `image/${format.toLowerCase()}`;
    const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, mime, .95));
    if (!blob) throw new ImageExportError('failed');
    if (blob.type !== mime) throw new ImageExportError('unsupported');
    return blob;
  } catch (error) {
    if (error instanceof ImageExportError) throw error;
    throw new ImageExportError('failed');
  }
}

export async function exportImage(image: HTMLImageElement, name: string, format: DownloadFormat): Promise<void> {
  let url: string | undefined;
  let link: HTMLAnchorElement | undefined;
  let downloadStarted = false;
  try {
    const blob = await encodeImage(image, format);
    url = URL.createObjectURL(blob);
    link = document.createElement('a');
    link.href = url;
    link.download = `${name.replace(/\.[^.]+$/, '') || 'image'}.${format.toLowerCase()}`;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    downloadStarted = true;
  } catch (error) {
    if (error instanceof ImageExportError) throw error;
    throw new ImageExportError('failed');
  } finally {
    link?.remove();
    if (url) {
      const objectUrl = url;
      if (downloadStarted) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      else URL.revokeObjectURL(objectUrl);
    }
  }
}
