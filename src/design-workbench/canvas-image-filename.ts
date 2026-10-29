import { canvasMediaFilename, createCanvasFileNamer, type GeneratedMediaFile } from '../canvas-media-filename';
import { readDemoState, writeDemoState } from './demo-storage';

export type ImageFile = { name: string; url: string; mimeType?: string; generatedFile?: GeneratedMediaFile; taskResultId?: string; generating?: boolean };
type Ledger = { counters: GeneratedMediaFile[]; results: Record<string, GeneratedMediaFile> };
const format = (file: GeneratedMediaFile) => `${file.featureLabel}-${file.date}-${String(file.sequence).padStart(3, '0')}.${file.extension}`;
const featureName = (title: string) => title.replace(/^款式\s*-\s*/, '').trim() || 'AI助手';

function extensionFor(image: ImageFile) {
  const mime = image.mimeType ?? image.url.match(/^data:([^;,]+)/)?.[1];
  const known: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif', 'image/svg+xml': 'svg' };
  if (mime && known[mime]) return known[mime];
  return image.url.split(/[?#]/, 1)[0].match(/\.(png|jpe?g|webp|avif|gif|svg)$/i)?.[1].toLowerCase()
    ?? image.name.match(/\.(png|jpe?g|webp|avif|gif|svg)$/i)?.[1].toLowerCase() ?? 'png';
}

// This Demo has one design canvas. Its ledger stays outside undo history and
// keeps result identities even after deletion, including a later Agent send.
export function createDesignCanvasFileNamer() {
  const allocator = createCanvasFileNamer();
  const saved = readDemoState<Ledger>('image-filenames', { counters: [], results: {} });
  const counters = new Map(saved.counters.map(file => [`${file.featureKey}:${file.date}`, file]));
  const results = new Map(Object.entries(saved.results));
  const remember = (file: GeneratedMediaFile, resultId?: string) => {
    const key = `${file.featureKey}:${file.date}`;
    if ((counters.get(key)?.sequence ?? 0) < file.sequence) counters.set(key, file);
    if (resultId) results.set(resultId, file);
    writeDemoState('image-filenames', { counters: [...counters.values()], results: Object.fromEntries(results) });
  };
  const assign = <T extends ImageFile>(image: T, title: string, existing: ReadonlyArray<{ generatedFile?: GeneratedMediaFile }> = []) => {
    const retained = image.generatedFile ?? (image.taskResultId ? results.get(image.taskResultId) : undefined);
    const feature = featureName(title);
    const generatedFile = retained ?? allocator.assign([image], feature, feature,
      [...existing, ...[...counters.values()].map(generatedFile => ({ generatedFile }))], image.generating ? 'png' : extensionFor(image))[0].generatedFile;
    remember(generatedFile, image.taskResultId);
    return { ...image, name: format(generatedFile), generatedFile };
  };
  return {
    assign,
    lookup(resultId: string) {
      const generatedFile = results.get(resultId);
      return generatedFile ? { name: format(generatedFile), generatedFile } : undefined;
    },
    complete<T extends ImageFile>(image: T, output: ImageFile) {
      const retained = assign(image, image.generatedFile?.featureLabel ?? '快捷编辑');
      const generatedFile = { ...retained.generatedFile, extension: extensionFor(output) };
      remember(generatedFile, image.taskResultId);
      return { name: format(generatedFile), generatedFile };
    },
    restore<T extends ImageFile & { origin?: string; generationPlacement?: string; addedAt?: number; generatedAt?: number }>(images: T[]) {
      // Older Demo snapshots used task display titles. Recover their actual
      // feature/date where recorded, without changing user-added filenames.
      type Task = { id: string; title: string; time: string };
      const tasks = readDemoState<{ records: Task[]; archived: [string, Task][] }>('tasks', { records: [], archived: [] });
      const records = new Map([...tasks.records, ...tasks.archived.map(([, task]) => task)].map(task => [task.id, task]));
      for (const image of images) if (image.generatedFile) remember(image.generatedFile, image.taskResultId);
      return images.map(image => {
        if (image.origin !== 'generated') return { ...image, name: canvasMediaFilename(image.name, image.url) };
        const retained = image.generatedFile ?? (image.taskResultId ? results.get(image.taskResultId) : undefined);
        if (retained) return assign({ ...image, generatedFile: retained }, retained.featureLabel);
        const task = image.taskResultId ? records.get(image.taskResultId.split(':')[0]) : undefined;
        const feature = featureName(task?.title ?? (image.generationPlacement === 'agent' ? 'AI助手' : image.name.match(/^(快捷编辑|文字编辑|局部修改|AI试衣|印花上身)/)?.[1] ?? '快捷编辑'));
        const recordedAt = task?.time ? Date.parse(task.time.replace(' ', 'T')) : image.addedAt ?? image.generatedAt ?? Date.now();
        const time = new Date(Number.isFinite(recordedAt) ? recordedAt : Date.now());
        const date = [String(time.getFullYear()).slice(-2), String(time.getMonth() + 1).padStart(2, '0'), String(time.getDate()).padStart(2, '0')].join('-');
        const generatedFile = { featureKey: feature, featureLabel: feature, date, sequence: (counters.get(`${feature}:${date}`)?.sequence ?? 0) + 1, extension: image.generating ? 'png' : extensionFor(image) };
        return assign({ ...image, generatedFile }, feature);
      });
    },
  };
}
