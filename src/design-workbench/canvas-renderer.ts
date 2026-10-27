import type { CanvasImage } from './useCanvas';
import { imageBounds } from './canvas-selection';
import { intersectsViewport, screenBounds } from './canvas-toolbar';

type Camera = { x: number; y: number; zoom: number };
type Viewport = { width: number; height: number };
export type CanvasPalette = { background: string; surface: string; text: string; track: string; progress: string; loadingLabel: string; badgeBackground: string; badgeText: string; coverId?: string; coverLabel: string; vectorLabel: string; fontFamily: string };

function paintImageBadges(ctx: CanvasRenderingContext2D, img: CanvasImage, palette: CanvasPalette) {
  const vector = img.mimeType === 'image/svg+xml' || /\.svg(?:[?#]|$)/i.test(img.name) || /\.svg(?:[?#]|$)|^data:image\/svg\+xml/i.test(img.url);
  const labels = [...(img.id === palette.coverId ? [palette.coverLabel] : []), ...(vector ? [palette.vectorLabel] : [])];
  if (!labels.length) return;
  // Figma 139:6732: metadata in image coordinates inherits canvas zoom.
  // Painting in image order preserves occlusion and edit isolation.
  ctx.save(); ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.rect(-img.width / 2, -img.height / 2, img.width, img.height); ctx.clip();
  ctx.translate(-img.width / 2, -img.height / 2);
  ctx.font = `400 12px ${palette.fontFamily}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  let left = 4;
  for (const label of labels) {
    const width = Math.ceil(ctx.measureText(label).width) + 8;
    ctx.fillStyle = palette.badgeBackground;
    ctx.beginPath(); ctx.roundRect(left, 4, width, 20, 4); ctx.fill();
    ctx.fillStyle = palette.badgeText; ctx.fillText(label, left + 4, 14);
    left += width + 4;
  }
  ctx.restore();
}

function visible(image: CanvasImage, camera: Camera, viewport: Viewport) {
  const box = imageBounds(image);
  // Include outside/rotated strokes and antialiasing in the culling bounds.
  const margin = (image.strokeWidth ?? 0) * Math.SQRT2 + 2 / camera.zoom;
  return intersectsViewport(screenBounds({ x: box.x - margin, y: box.y - margin, width: box.width + margin * 2, height: box.height + margin * 2 }, camera), viewport);
}

// Shared native-size image painter; isolation never changes individual alpha values.
export function paintCanvasImage(ctx: CanvasRenderingContext2D, img: CanvasImage, palette: CanvasPalette) {
  if (img.generating || img.generationFailed || !img.image.complete || !img.image.naturalWidth) return;
  ctx.save();
  ctx.translate(img.x + img.width / 2, img.y + img.height / 2);
  ctx.rotate((img.rotation ?? 0) * Math.PI / 180);
  const x = -img.width / 2, y = -img.height / 2;
  const radius = Math.min(img.radius ?? 0, img.width / 2, img.height / 2);
  ctx.globalAlpha = (img.opacity ?? 100) / 100;
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, img.width, img.height, radius); ctx.clip();
  ctx.scale(img.flipX ? -1 : 1, img.flipY ? -1 : 1);
  if (img.fit === 'cover') {
    const scale = Math.max(img.width / img.image.naturalWidth, img.height / img.image.naturalHeight);
    const sw = img.width / scale, sh = img.height / scale;
    ctx.drawImage(img.image, (img.image.naturalWidth - sw) / 2, (img.image.naturalHeight - sh) / 2, sw, sh, x, y, img.width, img.height);
  } else ctx.drawImage(img.image, x, y, img.width, img.height);
  ctx.restore();
  if ((img.strokeWidth ?? 0) > 0 && (img.strokeOpacity ?? 100) > 0) {
    const sw = img.strokeWidth!;
    const offset = img.strokeAlign === 'inside' ? sw / 2 : img.strokeAlign === 'outside' ? -sw / 2 : 0;
    ctx.globalAlpha = (img.opacity ?? 100) / 100 * (img.strokeOpacity ?? 100) / 100;
    ctx.strokeStyle = img.stroke ?? '#DADADA'; ctx.lineWidth = sw;
    ctx.setLineDash(img.strokeStyle === 'dashed' ? [sw * 4, sw * 3] : img.strokeStyle === 'dotted' ? [sw, sw * 2] : []);
    ctx.beginPath(); ctx.roundRect(x + offset, y + offset, Math.max(1, img.width - offset * 2), Math.max(1, img.height - offset * 2), Math.max(0, radius - offset)); ctx.stroke();
  }
  paintImageBadges(ctx, img, palette);
  ctx.restore();
}

function paintPendingTile(ctx: CanvasRenderingContext2D, img: CanvasImage, palette: CanvasPalette, zoom: number) {
  ctx.save();
  ctx.translate(img.x + img.width / 2, img.y + img.height / 2);
  ctx.rotate((img.rotation ?? 0) * Math.PI / 180);
  ctx.beginPath(); ctx.rect(-img.width / 2, -img.height / 2, img.width, img.height); ctx.clip();
  ctx.fillStyle = palette.surface; ctx.fillRect(-img.width / 2, -img.height / 2, img.width, img.height);
  // Static indeterminate marker while isolated. The task itself continues normally.
  const width = Math.max(0, Math.min(Math.max(img.width * .6, 80 / zoom), Math.max(240, 80 / zoom), img.width - 16 / zoom));
  const height = Math.max(8, 4 / zoom), gap = Math.max(8, 4 / zoom);
  const fontSize = Math.max(12, 12 / zoom), lineHeight = Math.max(16, 16 / zoom);
  const top = -(height + gap + lineHeight) / 2;
  ctx.fillStyle = palette.track; ctx.beginPath(); ctx.roundRect(-width / 2, top, width, height, height / 2); ctx.fill();
  ctx.fillStyle = palette.progress; ctx.beginPath(); ctx.roundRect(-width * .15, top, width * .3, height, height / 2); ctx.fill();
  ctx.fillStyle = palette.text; ctx.font = `${fontSize}px ${palette.fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(palette.loadingLabel, 0, top + height + gap);
  ctx.restore();
}

export function paintCanvasScene(ctx: CanvasRenderingContext2D, images: CanvasImage[], camera: Camera, viewport: Viewport, palette: CanvasPalette, excludedId?: string, includePending = false) {
  ctx.save(); ctx.translate(camera.x, camera.y); ctx.scale(camera.zoom, camera.zoom);
  for (const image of images) {
    if (image.id === excludedId || !visible(image, camera, viewport)) continue;
    if (image.generating) { if (includePending) paintPendingTile(ctx, image, palette, camera.zoom); }
    else paintCanvasImage(ctx, image, palette);
  }
  ctx.restore();
}

// One viewport-sized backing store, at most 32 MiB of RGBA pixels (GPU overhead is additional).
const MAX_PIXELS = 8_388_608;
const MAX_EDGE = 8192;
type CacheKey = { images: CanvasImage[]; id: string; camera: Camera; viewport: Viewport; width: number; height: number; theme: string; label: string };
export class CanvasIsolationCache {
  private canvas: HTMLCanvasElement | null = null;
  private key: CacheKey | null = null;
  private unavailable = false;

  get(images: CanvasImage[], id: string, camera: Camera, viewport: Viewport, dpr: number, theme: string, palette: CanvasPalette) {
    if (this.unavailable || viewport.width <= 0 || viewport.height <= 0) return null;
    const scale = Math.min(dpr, 2, Math.sqrt(MAX_PIXELS / viewport.width / viewport.height), MAX_EDGE / viewport.width, MAX_EDGE / viewport.height);
    const width = Math.max(1, Math.floor(viewport.width * scale)), height = Math.max(1, Math.floor(viewport.height * scale));
    const key = this.key;
    const label = [palette.loadingLabel, palette.coverLabel, palette.vectorLabel, palette.coverId].join('|');
    if (key && key.images === images && key.id === id && key.camera.x === camera.x && key.camera.y === camera.y && key.camera.zoom === camera.zoom && key.viewport.width === viewport.width && key.viewport.height === viewport.height && key.width === width && key.height === height && key.theme === theme && key.label === label) return this.canvas;
    try {
      const canvas = this.canvas ??= document.createElement('canvas');
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const ctx = canvas.getContext('2d');
      if (!ctx || (typeof ctx.isContextLost === 'function' && ctx.isContextLost())) throw new Error('Isolation cache unavailable');
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, width, height);
      ctx.setTransform(width / viewport.width, 0, 0, height / viewport.height, 0, 0);
      paintCanvasScene(ctx, images, camera, viewport, palette, id, true);
      this.key = { images, id, camera: { ...camera }, viewport: { ...viewport }, width, height, theme, label };
      return canvas;
    } catch {
      this.dispose(); this.unavailable = true;
      return null;
    }
  }

  dispose() {
    if (this.canvas) { this.canvas.width = 0; this.canvas.height = 0; }
    this.canvas = null; this.key = null; this.unavailable = false;
  }
}
