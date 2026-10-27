export const downloadFormats = ['PNG', 'JPG', 'WebP', 'AVIF'] as const;
export type DownloadFormat = typeof downloadFormats[number];

export async function encodeImage(image: HTMLImageElement, format: DownloadFormat) {
  const output = document.createElement('canvas');
  output.width = image.naturalWidth; output.height = image.naturalHeight;
  const ctx = output.getContext('2d');
  if (!ctx) throw new Error('下载失败，请重试。');
  if (format === 'JPG') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, output.width, output.height); }
  ctx.drawImage(image, 0, 0);
  const mime = format === 'JPG' ? 'image/jpeg' : `image/${format.toLowerCase()}`;
  const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, mime, .95));
  if (!blob || blob.type !== mime) throw new Error('当前浏览器不支持此格式导出，请选择其他格式');
  return blob;
}

export async function exportImage(image: HTMLImageElement, name: string, format: DownloadFormat) {
  const blob = await encodeImage(image, format);
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `${name.replace(/\.[^.]+$/, '')}.${format.toLowerCase()}`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
