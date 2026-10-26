import type { Locale } from './i18n';
import { materialWorkflowTitle, type MaterialWorkflow } from './material-workflow';
import type { CanvasTask } from './components/CanvasTaskList';
import { videoAssets } from './video-assets';
import { sizeVideoCanvasMedia, type VideoCanvasMedia } from './video-canvas-media';
import { readVideoReference, type UploadedVideo } from './video-reference-upload';

type DemoResult = Omit<VideoCanvasMedia, 'x' | 'y'>;

// Preserve navigation for an already-open demo created before task IDs were
// stored on output media. Legacy batches used a fixed delay and append order.
export function bindCompletedTaskResults(tasks: CanvasTask[], images: VideoCanvasMedia[]): CanvasTask[] {
  const bindings = new Map<string, string[]>();
  const claimed = new Set(tasks.flatMap(task => task.resultIds ?? []));
  for (const task of tasks) {
    if (task.status !== 'completed' || task.resultIds?.length) continue;
    const linked = images.filter(image => !image.generation && image.generatedTaskId === task.id);
    if (linked.length) {
      bindings.set(task.id, linked.map(image => image.id));
      linked.forEach(image => claimed.add(image.id));
    }
  }
  const legacy = tasks.filter(task => task.status === 'completed' && !task.resultIds?.length && !bindings.has(task.id) && task.thumbnailUrl);
  for (const thumbnail of new Set(legacy.map(task => task.thumbnailUrl!))) {
    const records = legacy.filter(task => task.thumbnailUrl === thumbnail)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const results = images.filter(image => !image.generation && image.generatedByEditorId && !image.generatedTaskId && !claimed.has(image.id) && image.url === thumbnail).reverse();
    // Do not assign a different remaining result after deletion, or infer
    // unknown batch sizes. Only migrate a complete one-result-per-task group.
    if (records.length !== results.length) continue;
    records.forEach((task, index) => {
      bindings.set(task.id, [results[index].id]);
      claimed.add(results[index].id);
    });
  }
  return bindings.size ? tasks.map(task => bindings.has(task.id) ? { ...task, resultIds: bindings.get(task.id)! } : task) : tasks;
}

// Reserve the requested output ratio when the task is submitted. Auto follows
// the first input's original dimensions, or a square for text-only generation.
export function demoPlaceholderSize(ratio: string, source?: VideoCanvasMedia) {
  const [requestedWidth, requestedHeight] = ratio.split(':').map(Number);
  const sourceWidth = source?.video?.width ?? source?.naturalWidth ?? source?.width ?? 1;
  const sourceHeight = source?.video?.height ?? source?.naturalHeight ?? source?.height ?? 1;
  const aspect = requestedWidth > 0 && requestedHeight > 0 && Number.isFinite(requestedWidth / requestedHeight)
    ? requestedWidth / requestedHeight
    : sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 1;
  return aspect > 1 ? { width: 320 * aspect, height: 320 }
    : aspect < 1 ? { width: 360, height: 360 / aspect } : { width: 320, height: 320 };
}

const portraitImage = { url: `${import.meta.env.BASE_URL}assets/workflow-examples/fusion-loungewear-result.png`, width: 1792, height: 2400 };
const squareImage = { url: `${import.meta.env.BASE_URL}assets/try-on/history/regular-5.png`, width: 2048, height: 2048 };
const storyboardImage = { url: `${import.meta.env.BASE_URL}assets/storyboard-example/result.webp`, width: 3072, height: 5504 };
const copy = {
  'zh-CN': { image: '演示结果', video: '视频演示结果' },
  en: { image: 'Demo result', video: 'Video demo result' },
  ja: { image: 'デモ結果', video: '動画デモ結果' },
};

// Fixed local examples for generation nodes. Grid cropping uses grid-crop.ts.
export function createMaterialDemoResults(node: MaterialWorkflow, locale: Locale): DemoResult[] {
  if (node.kind === 'gridSplit') return [];
  const count = node.kind === 'storyboard' ? 1
    : Math.max(1, Math.min(4, Number.isFinite(node.count) ? Math.trunc(node.count) : 1));
  // Text-only Auto reserves a square frame; use a genuinely square source so
  // the canvas, task thumbnail, preview and download all share the same ratio.
  const image = node.kind === 'storyboard' ? storyboardImage
    : node.kind === 'quick' && node.references.length === 0 && node.ratio === 'auto' ? squareImage : portraitImage;
  return Array.from({ length: count }, (_, index) => sizeVideoCanvasMedia({
    id: crypto.randomUUID(),
    name: `${materialWorkflowTitle(node.kind, locale)} · ${copy[locale].image}${count > 1 ? ` ${index + 1}` : ''}.${node.kind === 'storyboard' ? 'webp' : 'png'}`,
    ...image,
    naturalWidth: image.width,
    naturalHeight: image.height,
    generatedByEditorId: node.id,
  }));
}

export function createVideoDemoResult(editorId: string, locale: Locale): DemoResult {
  const name = `${copy[locale].video}.mp4`;
  return sizeVideoCanvasMedia({
    id: crypto.randomUUID(),
    name,
    url: videoAssets.portraitPoster,
    width: 1176,
    height: 1756,
    naturalWidth: 1176,
    naturalHeight: 1756,
    generatedByEditorId: editorId,
    video: {
      id: crypto.randomUUID(),
      kind: 'video',
      name,
      url: videoAssets.portraitVideo,
      posterUrl: videoAssets.portraitPoster,
      width: 1176,
      height: 1756,
      duration: 10.04,
    },
  });
}

let fashionVideoExample: Promise<UploadedVideo> | undefined;

// Keep the supplied clip intact; derive its poster and dimensions together so
// the canvas never uses a different video's thumbnail or assumed aspect ratio.
export async function createFashionVideoDemoResult(editorId: string, locale: Locale): Promise<DemoResult> {
  if (!fashionVideoExample) {
    fashionVideoExample = (async () => {
      const url = `${import.meta.env.BASE_URL}assets/fashion-video-example/result.mp4`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Unable to load example video');
      const file = new File([await response.blob()], 'result.mp4', { type: 'video/mp4' });
      const video = await readVideoReference(file, new AbortController().signal);
      URL.revokeObjectURL(video.url);
      return { ...video, url };
    })().catch(error => { fashionVideoExample = undefined; throw error; });
  }
  const source = await fashionVideoExample;
  const name = `${copy[locale].video}.mp4`;
  return sizeVideoCanvasMedia({
    id: crypto.randomUUID(), name, url: source.posterUrl,
    width: source.width, height: source.height,
    naturalWidth: source.width, naturalHeight: source.height,
    generatedByEditorId: editorId,
    video: { ...source, id: crypto.randomUUID(), name },
  });
}

