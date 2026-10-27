import type { CanvasImage } from './canvas';
import type { CanvasTask } from './components/CanvasTaskList';

export type CanvasImageTaskRecord = {
  editorId: string;
  timer: number | null;
  status: CanvasTask['status'];
  results: CanvasImage[];
};

// History stores geometry, while task completion lives outside undo/redo.
// Resolve restored placeholders without reviving a cancelled timer or deleted result.
export function resolveImageTaskSlots(images: CanvasImage[], records: ReadonlyMap<string, CanvasImageTaskRecord>): CanvasImage[] {
  return images.map(image => {
    if (!image.generation) return image;
    const task = records.get(image.generation.taskId);
    const result = task?.status === 'completed' ? task.results.find(result => result.id === image.id) : undefined;
    if (result) return { ...image, url: result.url, name: result.name,
      naturalWidth: result.naturalWidth, naturalHeight: result.naturalHeight, generation: undefined };
    if ((!task || task.status !== 'running') && image.generation.status !== 'failed') {
      return { ...image, generation: { ...image.generation, status: 'failed' as const } };
    }
    return image;
  });
}

export function canvasImageTaskResults(images: CanvasImage[], task: CanvasTask): CanvasImage[] {
  const ids = new Set(task.resultIds ?? []);
  return images.filter(image => !image.nodeOnly && !image.generation
    && (ids.has(image.id) || image.generatedTaskId === task.id));
}
