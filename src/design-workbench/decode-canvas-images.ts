import { assetDisplayUrl } from '../asset-display-url';

// Keep decoded sources scoped to this restore, so deleting a canvas can release
// them. Copies with the same URL share both the image and its display-raster cache.
export async function decodeCanvasImages<T extends { url: string }>(items: readonly T[], signal?: AbortSignal): Promise<(T & { image: HTMLImageElement })[]> {
  const sources = items.map(item => new URL(assetDisplayUrl(item.url), window.location.href).href);
  const urls = [...new Set(sources)];
  const decoded = new Map<string, HTMLImageElement>();
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      signal?.throwIfAborted();
      const url = urls[next++];
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      await image.decode();
      decoded.set(url, image);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, worker));
  signal?.throwIfAborted();
  return items.map((item, index) => ({ ...item, image: decoded.get(sources[index])! }));
}
