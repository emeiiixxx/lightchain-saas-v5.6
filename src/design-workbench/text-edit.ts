import type { PaddleOCR, OcrResultItem } from '@paddleocr/paddleocr-js';
import { rememberDemoAsset } from './demo-storage';

export type TextRegion = { x: number; y: number; width: number; height: number };
export type RecognizedLine = TextRegion & { text: string; words: TextRegion[] };
export type TextRecognition = { text: string; lines: RecognizedLine[] };
export type TextEditInput = {
  sourceUrl: string; width: number; height: number; region: TextRegion;
  recognition: TextRecognition;
};

export function cropTextRegion(image: HTMLImageElement, region: TextRegion) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(region.width)); canvas.height = Math.max(1, Math.round(region.height));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas_unavailable');
  context.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function createTextRecognizer() {
  type Engine = Awaited<ReturnType<typeof PaddleOCR.create>>;
  let engine: Promise<Engine> | undefined;
  let instance: Engine | undefined;
  let queue = Promise.resolve();
  let disposed = false;
  let latest = 0;
  const release = () => {
    const previous = instance; instance = undefined; engine = undefined;
    void previous?.dispose().catch(() => {});
  };
  const getEngine = () => engine ??= import('@paddleocr/paddleocr-js').then(async ({ PaddleOCR }) => {
    if (disposed) throw new Error('cancelled');
    const base = new URL('/assets/design-workbench/ocr/', window.location.href).href;
    const runtime = `${base}paddle-0.4.2/`;
    const current = await PaddleOCR.create({
      initialize: false,
      worker: { createWorker: () => new Worker(`${runtime}worker.js`, { type: 'module' }) },
      textDetectionModelName: 'PP-OCRv5_mobile_det',
      textRecognitionModelName: 'PP-OCRv5_mobile_rec',
      textDetectionModelAsset: { url: `${base}PP-OCRv5_mobile_det.tar` },
      textRecognitionModelAsset: { url: `${base}PP-OCRv5_mobile_rec.tar` },
      // Single-thread WASM also works on Pages without cross-origin isolation.
      ortOptions: { backend: 'wasm', wasmPaths: runtime, numThreads: 1, proxy: false },
      textRecognitionBatchSize: 1,
      textRecScoreThresh: .5,
    });
    if (disposed) { await current.dispose(); throw new Error('cancelled'); }
    instance = current;
    await current.initialize();
    if (disposed) throw new Error('cancelled');
    return current;
  }).catch(error => { release(); throw error; });
  return {
    recognize(image: HTMLImageElement, region: TextRegion): Promise<TextRecognition> {
      const request = ++latest;
      const task = queue.then(async () => {
        if (disposed || request !== latest) throw new Error('cancelled');
        const current = await getEngine();
        if (disposed || request !== latest) throw new Error('cancelled');
        const crop = cropTextRegion(image, region);
        const scale = Math.min(3, Math.max(1, 1600 / Math.max(crop.width, crop.height)));
        const padding = 16;
        const canvas = document.createElement('canvas');
        const contentWidth = Math.round(crop.width * scale), contentHeight = Math.round(crop.height * scale);
        canvas.width = contentWidth + padding * 2; canvas.height = contentHeight + padding * 2;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(crop, padding, padding, contentWidth, contentHeight);
        const [result] = await current.predict(canvas, {
          textDetLimitType: 'max', textDetLimitSideLen: Math.min(2048, Math.max(canvas.width, canvas.height)),
          textDetMaxSideLimit: 2048,
        }).catch(error => { release(); throw error; });
        if (disposed || request !== latest) throw new Error('cancelled');
        // OCR coordinates refer to the padded crop; stored coordinates refer to the original image.
        const toOriginal = (item: OcrResultItem): RecognizedLine => {
          const xs = item.poly.map(point => (point[0] - padding) * region.width / contentWidth);
          const ys = item.poly.map(point => (point[1] - padding) * region.height / contentHeight);
          const left = Math.max(0, Math.min(region.width, Math.min(...xs)));
          const top = Math.max(0, Math.min(region.height, Math.min(...ys)));
          const right = Math.max(left, Math.min(region.width, Math.max(...xs)));
          const bottom = Math.max(top, Math.min(region.height, Math.max(...ys)));
          const bounds = { x: region.x + left, y: region.y + top, width: right - left, height: bottom - top };
          return { ...bounds, text: item.text.trim(), words: [bounds] };
        };
        const boxes = (result?.items ?? []).filter(item => item.text.trim() && item.poly.length >= 4 && item.score >= .5)
          .map(toOriginal).filter(box => box.width > 0 && box.height > 0);
        // Keep text on the same visual row together, including adjacent table cells.
        const rows: RecognizedLine[][] = [];
        for (const box of boxes.sort((a, b) => a.y - b.y || a.x - b.x)) {
          const row = rows.find(items => Math.abs(items[0].y + items[0].height / 2 - box.y - box.height / 2) <= Math.min(items[0].height, box.height) * .45);
          if (row) row.push(box); else rows.push([box]);
        }
        const lines = rows.map(row => {
          row.sort((a, b) => a.x - b.x);
          const x = Math.min(...row.map(box => box.x)), y = Math.min(...row.map(box => box.y));
          return {
            x, y, width: Math.max(...row.map(box => box.x + box.width)) - x,
            height: Math.max(...row.map(box => box.y + box.height)) - y,
            text: row.map(box => box.text).join(' '), words: row.flatMap(box => box.words),
          };
        });
        return { text: lines.map(line => line.text).join('\n'), lines };
      });
      queue = task.then(() => {}, () => {});
      return task;
    },
    dispose() { disposed = true; latest++; release(); },
  };
}

async function keepCanvas(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('image_export_failed')), 'image/png'));
  const url = URL.createObjectURL(blob);
  try { await rememberDemoAsset(url, blob); return url; }
  catch (error) { URL.revokeObjectURL(url); throw error; }
}

export async function textSelectionPreview(image: HTMLImageElement, region: TextRegion) {
  return keepCanvas(cropTextRegion(image, region));
}

export function replacementText(prompt: string) {
  const quoted = prompt.match(/(?:改为|改成|替换为|替换成)\s*[“「"]([\s\S]*?)[”」"]\s*[。.]?$/);
  return (quoted?.[1] ?? prompt).trim();
}

/** Local effect simulation, not a generative AI service. Only the selected crop is composited back. */
export async function renderTextEdit(input: TextEditInput, prompt: string): Promise<string> {
  const image = new Image(); image.crossOrigin = 'anonymous'; image.src = input.sourceUrl; await image.decode();
  const { region, recognition } = input;
  const crop = cropTextRegion(image, region);
  const context = crop.getContext('2d')!;
  const pixels = context.getImageData(0, 0, crop.width, crop.height);
  const sample = (x: number, y: number) => {
    const offset = (Math.max(0, Math.min(crop.height - 1, Math.round(y))) * crop.width + Math.max(0, Math.min(crop.width - 1, Math.round(x)))) * 4;
    return [pixels.data[offset], pixels.data[offset + 1], pixels.data[offset + 2]];
  };
  // Sample the surrounding paper/background for each recognized word, keeping table rules intact.
  for (const line of recognition.lines) for (const word of line.words) {
    const x = word.x - region.x, y = word.y - region.y;
    const samples = [sample(x - 2, y), sample(x + word.width + 2, y), sample(x + word.width / 2, y - 2), sample(x + word.width / 2, y + word.height + 2)];
    const color = [0, 1, 2].map(channel => samples.map(item => item[channel]).sort((a, b) => a - b)[2]);
    context.fillStyle = `rgb(${color.join(',')})`; context.fillRect(x - 1, y - 1, word.width + 2, word.height + 2);
  }
  await document.fonts.ready;
  const lines = replacementText(prompt).split('\n');
  const matchingLines = lines.length === recognition.lines.length;
  const padding = Math.max(2, Math.min(8, crop.height * .02));
  const lineHeight = (crop.height - padding * 2) / lines.length;
  context.textBaseline = 'top';
  lines.forEach((line, index) => {
    const target = matchingLines ? recognition.lines[index] : undefined;
    const x = target ? target.x - region.x : padding;
    const y = target ? target.y - region.y : padding + index * lineHeight;
    const maxWidth = Math.max(1, crop.width - x - padding);
    let fontSize = Math.max(2, target ? target.height : Math.min(lineHeight * .78, 48));
    context.font = `${fontSize}px "Noto Sans SC Variable", sans-serif`;
    const measured = context.measureText(line).width;
    if (measured > maxWidth) { fontSize *= maxWidth / measured; context.font = `${fontSize}px "Noto Sans SC Variable", sans-serif`; }
    const background = sample(x, Math.max(0, y - 2));
    context.fillStyle = background.reduce((sum, value) => sum + value, 0) > 380 ? '#171b1c' : '#ffffff';
    context.fillText(line, x, y, maxWidth);
  });
  const output = document.createElement('canvas'); output.width = image.naturalWidth; output.height = image.naturalHeight;
  const result = output.getContext('2d')!; result.drawImage(image, 0, 0);
  result.drawImage(crop, region.x, region.y, region.width, region.height);
  return keepCanvas(output);
}
