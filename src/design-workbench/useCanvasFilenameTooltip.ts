import { useEffect } from 'react';
import type { useCanvas } from './useCanvas';
import { imageBounds, type Bounds } from './canvas-selection';
import { screenBounds, intersectsViewport } from './canvas-toolbar';
import { IMAGE_FILENAME_TOP_SPACE } from './canvas-renderer';
import { hitShape } from './canvas-shapes';
import { showCanvasTooltip } from './components/Tooltip';

type Board = Pick<ReturnType<typeof useCanvas>, 'canvasRef' | 'images' | 'selectedIds' | 'camera' | 'size' | 'isolationActive'>;
const contains = (box: Bounds, point: { x: number; y: number }) => point.x >= box.x && point.x <= box.x + box.width
  && point.y >= box.y && point.y <= box.y + box.height;

export function useCanvasFilenameTooltip({ canvasRef, images, selectedIds, camera, size, isolationActive }: Board) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || isolationActive) return;
    const selected = new Set(selectedIds);
    // Cache visible geometry per scene change, not per mouse movement.
    const entries = images.map(item => {
      const box = screenBounds(imageBounds(item), camera);
      const label = !item.shape && !item.generating && !item.generationFailed && item.name
        ? { x: box.x, y: box.y - IMAGE_FILENAME_TOP_SPACE, width: box.width, height: 16 } : null;
      return { item, box, label };
    }).filter(entry => intersectsViewport(entry.box, size) || (entry.label && intersectsViewport(entry.label, size))).reverse();
    const foreground = entries.filter(entry => selected.has(entry.item.id) && entry.label);
    const hide = () => showCanvasTooltip(null);
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.buttons) { hide(); return; }
      const rect = canvas.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const show = (entry: typeof entries[number]) => showCanvasTooltip({ anchor: canvas, label: entry.item.name, bounds: entry.label! });
      // Selected filenames are painted above every image; other labels retain
      // image stacking order, so covered filenames do not show through images.
      const topLabel = foreground.find(entry => contains(entry.label!, point));
      if (topLabel) { show(topLabel); return; }
      const world = { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
      for (const entry of entries) {
        const { item, label } = entry;
        if (label && !selected.has(item.id) && contains(label, point)) { show(entry); return; }
        if (!contains(entry.box, point)) continue;
        if (item.shape) {
          if (hitShape(item, world, camera.zoom)) break;
        } else {
          const angle = -(item.rotation ?? 0) * Math.PI / 180;
          const dx = world.x - item.x - item.width / 2, dy = world.y - item.y - item.height / 2;
          if (Math.abs(dx * Math.cos(angle) - dy * Math.sin(angle)) <= item.width / 2
            && Math.abs(dx * Math.sin(angle) + dy * Math.cos(angle)) <= item.height / 2) break;
        }
      }
      hide();
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', hide);
    return () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', hide);
      hide();
    };
  }, [canvasRef, images, selectedIds, camera, size, isolationActive]);
}
