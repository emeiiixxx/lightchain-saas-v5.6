export type GuidePoint = { x: number; y: number };
export type GuideTool = 'brush' | 'eraser';
export type GuideStroke = { tool: GuideTool; color: string; size: number; points: GuidePoint[] };
export type DrawingGuide = {
  sourceUrl: string;
  width: number;
  height: number;
  strokes: GuideStroke[];
  previewUrl: string;
};
type GuideProjection = {
  scale: number;
  offsetX: number;
  offsetY: number;
  bounds: { width: number; height: number };
};

// Keep drawing coordinates independent of viewport size, zoom and image pixels.
export function guideDimensions(width: number, height: number) {
  const scale = 1000 / Math.max(1, width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function paintGuide(canvas: HTMLCanvasElement, strokes: GuideStroke[], active?: GuideStroke | null, projection?: GuideProjection) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('drawing_context_unavailable');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  if (projection) {
    ctx.setTransform(projection.scale, 0, 0, projection.scale, projection.offsetX, projection.offsetY);
    ctx.beginPath();
    ctx.rect(0, 0, projection.bounds.width, projection.bounds.height);
    ctx.clip();
  }
  for (const stroke of active ? [...strokes, active] : strokes) {
    const first = stroke.points[0];
    if (!first) continue;
    ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.fillStyle = ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = ctx.lineJoin = 'round';
    if (stroke.points.length === 1) {
      ctx.beginPath();
      ctx.arc(first.x, first.y, stroke.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Composite each round-capped segment independently. Retraced and
      // crossing segments must accumulate, not form one self-crossing path.
      for (let i = 1; i < stroke.points.length; i++) {
        const previous = stroke.points[i - 1], next = stroke.points[i];
        ctx.beginPath();
        ctx.moveTo(previous.x, previous.y);
        ctx.lineTo(next.x, next.y);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  return ctx;
}
