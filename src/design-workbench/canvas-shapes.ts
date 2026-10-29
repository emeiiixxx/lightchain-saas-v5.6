import type { CanvasImage } from './useCanvas';

export type ShapeKind = 'rectangle' | 'ellipse' | 'triangle' | 'line' | 'arrow';
export type CanvasShape = { kind: ShapeKind; fill: string; fillOpacity?: number };
type Point = { x: number; y: number };

function size(value: number) { return Number.isFinite(value) ? Math.max(1, value) : 1; }
function strokeSize(value: number | undefined, line: boolean) {
  return Number.isFinite(value) ? Math.max(0, value!) : line ? 2 : 0;
}
function linePoints(width: number, height: number, strokeWidth: number, arrow: boolean) {
  const insetX = Math.min(strokeWidth / 2, width / 2), insetY = Math.min(strokeWidth / 2, height / 2);
  const start = { x: -width / 2 + insetX, y: -height / 2 + insetY };
  const end = { x: width / 2 - insetX, y: height / 2 - insetY };
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
  if (!arrow || !length) return { start, end, head: [] as Point[] };
  const ux = dx / length, uy = dy / length;
  const depth = Math.min(Math.max(10, strokeWidth * 4), length * .45), halfWidth = depth * .55;
  return { start, end, head: [
    { x: end.x - ux * depth - uy * halfWidth, y: end.y - uy * depth + ux * halfWidth },
    { x: end.x - ux * depth + uy * halfWidth, y: end.y - uy * depth - ux * halfWidth },
  ] };
}
function trace(ctx: CanvasRenderingContext2D, kind: ShapeKind, width: number, height: number, strokeWidth: number, radius = 0) {
  const x = -width / 2, y = -height / 2;
  ctx.beginPath();
  if (kind === 'rectangle') ctx.roundRect(x, y, width, height, Math.max(0, Math.min(radius, width / 2, height / 2)));
  else if (kind === 'ellipse') ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
  else if (kind === 'triangle') {
    ctx.moveTo(0, y); ctx.lineTo(width / 2, height / 2); ctx.lineTo(x, height / 2); ctx.closePath();
  } else {
    const { start, end, head } = linePoints(width, height, strokeWidth, kind === 'arrow');
    ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y);
    if (head.length) { ctx.moveTo(head[0].x, head[0].y); ctx.lineTo(end.x, end.y); ctx.lineTo(head[1].x, head[1].y); }
  }
}

// Caller supplies the object's translation, rotation, flips and overall alpha.
export function paintShape(ctx: CanvasRenderingContext2D, item: CanvasImage) {
  if (!item.shape) return;
  const { kind, fill } = item.shape, line = kind === 'line' || kind === 'arrow';
  const width = size(item.width), height = size(item.height), sw = strokeSize(item.strokeWidth, line);
  ctx.save();
  trace(ctx, kind, width, height, sw, item.radius);
  if (!line && fill !== 'none' && fill !== 'transparent') {
    ctx.save(); ctx.globalAlpha *= Math.max(0, Math.min(100, item.shape.fillOpacity ?? 100)) / 100;
    ctx.fillStyle = fill; ctx.fill(); ctx.restore();
  }
  if (sw && (item.strokeOpacity ?? 100) > 0) {
    ctx.globalAlpha *= Math.max(0, Math.min(100, item.strokeOpacity ?? 100)) / 100;
    ctx.strokeStyle = item.stroke ?? fill; ctx.lineWidth = sw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash(item.strokeStyle === 'dashed' ? [sw * 4, sw * 3] : item.strokeStyle === 'dotted' ? [sw, sw * 2] : []);
    ctx.stroke();
  }
  ctx.restore();
}

function xml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// A local SVG backing also makes layer thumbnails and stored objects loadable.
export function shapeSvg(shape: CanvasShape, originalWidth: number, originalHeight: number, stroke = shape.fill, strokeWidth?: number,
  options: Pick<CanvasImage, 'radius' | 'strokeOpacity' | 'strokeStyle' | 'flipX' | 'flipY'> = {}): string {
  const width = size(originalWidth), height = size(originalHeight);
  const line = shape.kind === 'line' || shape.kind === 'arrow', sw = strokeSize(strokeWidth, line);
  const fill = xml(line ? 'none' : shape.fill), outline = xml(stroke);
  const dash = options.strokeStyle === 'dashed' ? `${sw * 4} ${sw * 3}` : options.strokeStyle === 'dotted' ? `${sw} ${sw * 2}` : 'none';
  const style = `fill="${fill}" fill-opacity="${Math.max(0, Math.min(100, shape.fillOpacity ?? 100)) / 100}" stroke="${outline}" stroke-width="${sw}" stroke-opacity="${Math.max(0, Math.min(100, options.strokeOpacity ?? 100)) / 100}" stroke-dasharray="${dash}" stroke-linecap="round" stroke-linejoin="round"`;
  let viewX = line ? 0 : -sw / 2, viewY = line ? 0 : -sw / 2, viewWidth = line ? width : width + sw, viewHeight = line ? height : height + sw;
  let content: string;
  if (shape.kind === 'rectangle') content = `<rect x="0" y="0" width="${width}" height="${height}" rx="${Math.max(0, Math.min(options.radius ?? 0, width / 2, height / 2))}" ${style}/>`;
  else if (shape.kind === 'ellipse') content = `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" ${style}/>`;
  else if (shape.kind === 'triangle') content = `<polygon points="${width / 2},0 ${width},${height} 0,${height}" ${style}/>`;
  else {
    const { start, end, head } = linePoints(width, height, sw, shape.kind === 'arrow');
    const p = (point: Point) => `${point.x + width / 2} ${point.y + height / 2}`;
    const d = `M ${p(start)} L ${p(end)}${head.length ? ` M ${p(head[0])} L ${p(end)} L ${p(head[1])}` : ''}`;
    content = `<path d="${d}" ${style}/>`;
    // Thin horizontal/vertical arrows need a larger SVG viewBox for the head;
    // their actual on-canvas geometry remains owned by the native painter.
    const points = [start, end, ...head].map(point => ({
      x: point.x * (options.flipX ? -1 : 1) + width / 2,
      y: point.y * (options.flipY ? -1 : 1) + height / 2,
    }));
    viewX = Math.min(0, ...points.map(point => point.x - sw / 2));
    viewY = Math.min(0, ...points.map(point => point.y - sw / 2));
    viewWidth = Math.max(width, ...points.map(point => point.x + sw / 2)) - viewX;
    viewHeight = Math.max(height, ...points.map(point => point.y + sw / 2)) - viewY;
  }
  if (options.flipX || options.flipY) content = `<g transform="translate(${options.flipX ? width : 0} ${options.flipY ? height : 0}) scale(${options.flipX ? -1 : 1} ${options.flipY ? -1 : 1})">${content}</g>`;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${viewWidth}" height="${viewHeight}" viewBox="${viewX} ${viewY} ${viewWidth} ${viewHeight}">${content}</svg>`)}`;
}

function segmentDistance(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x, dy = end.y - start.y, length = dx * dx + dy * dy;
  const amount = length ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length)) : 0;
  return Math.hypot(point.x - start.x - amount * dx, point.y - start.y - amount * dy);
}

// Bounds are centered on the object, including its flipped path and visible stroke.
// The scene can rotate these corners before using them for layout or selection.
export function shapeLocalBounds(item: CanvasImage): { x: number; y: number; width: number; height: number } {
  const width = size(item.width), height = size(item.height);
  const kind = item.shape?.kind, line = kind === 'line' || kind === 'arrow';
  const sw = strokeSize(item.strokeWidth, line), edge = (item.strokeOpacity ?? 100) > 0 ? sw / 2 : 0;
  if (!line) return { x: -width / 2 - edge, y: -height / 2 - edge, width: width + edge * 2, height: height + edge * 2 };
  const { start, end, head } = linePoints(width, height, sw, kind === 'arrow');
  const points = [start, end, ...head].map(point => ({ x: point.x * (item.flipX ? -1 : 1), y: point.y * (item.flipY ? -1 : 1) }));
  const x = Math.min(...points.map(point => point.x)) - edge, y = Math.min(...points.map(point => point.y)) - edge;
  return { x, y, width: Math.max(...points.map(point => point.x)) + edge - x, height: Math.max(...points.map(point => point.y)) + edge - y };
}

export function hitShape(item: CanvasImage, worldPoint: Point, zoom: number): boolean {
  if (!item.shape) return false;
  const width = size(item.width), height = size(item.height), angle = -(item.rotation ?? 0) * Math.PI / 180;
  const dx = worldPoint.x - item.x - item.width / 2, dy = worldPoint.y - item.y - item.height / 2;
  const point = {
    x: (dx * Math.cos(angle) - dy * Math.sin(angle)) * (item.flipX ? -1 : 1),
    y: (dx * Math.sin(angle) + dy * Math.cos(angle)) * (item.flipY ? -1 : 1),
  };
  const kind = item.shape.kind;
  if (kind === 'line' || kind === 'arrow') {
    const sw = strokeSize(item.strokeWidth, true), tolerance = sw / 2 + 6 / Math.max(.001, zoom);
    const { start, end, head } = linePoints(width, height, sw, kind === 'arrow');
    return segmentDistance(point, start, end) <= tolerance || head.some(corner => segmentDistance(point, corner, end) <= tolerance);
  }
  const halfWidth = width / 2, halfHeight = height / 2;
  if (kind === 'ellipse') return (point.x / halfWidth) ** 2 + (point.y / halfHeight) ** 2 <= 1;
  if (kind === 'triangle') return point.y >= -halfHeight && point.y <= halfHeight && Math.abs(point.x) <= halfWidth * (point.y + halfHeight) / height;
  if (Math.abs(point.x) > halfWidth || Math.abs(point.y) > halfHeight) return false;
  const radius = Math.max(0, Math.min(item.radius ?? 0, halfWidth, halfHeight));
  if (!radius || Math.abs(point.x) <= halfWidth - radius || Math.abs(point.y) <= halfHeight - radius) return true;
  return Math.hypot(Math.abs(point.x) - halfWidth + radius, Math.abs(point.y) - halfHeight + radius) <= radius;
}
