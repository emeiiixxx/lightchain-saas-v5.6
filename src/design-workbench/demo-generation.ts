import { prepareMainImage } from './asset-library';
import { rememberDemoAsset } from './demo-storage';

// Existing original Figma images stand in for AI outputs in this interaction demo.
const sources = [
  '/assets/design-workbench/generation-record-imgAsset.png',
  '/assets/design-workbench/generation-record-imgAsset1.png',
  '/assets/design-workbench/generation-record-imgAsset2.png',
  '/assets/design-workbench/generation-record-imgAsset3.png',
];
let cached: ReturnType<typeof loadResults> | undefined;
function loadResults() {
  return Promise.all(sources.map((url, index) => prepareMainImage({ id: url, name: `快捷编辑 · ${index + 1}`, url })));
}
type DemoOutput = {
  ratio?: string;
  resolution?: string;
  sourceSize: { width: number; height: number };
  count: number;
};

export async function prepareDemoResults(options?: DemoOutput) {
  cached ??= loadResults().catch(error => { cached = undefined; throw error; });
  const assets = await cached;
  if (!options) return assets;
  const [rw, rh] = (options.ratio ?? '').split(':').map(Number);
  const ratio = rw > 0 && rh > 0 ? rw / rh : options.sourceSize.width / options.sourceSize.height;
  // Demo-only raster output: honor the requested shape without stretching a
  // square fixture on the canvas. Production uses the service's output file.
  const longEdge = options.resolution === '4K' ? 4096 : options.resolution === '1K' ? 1024 : 2048;
  const width = Math.max(1, Math.round(ratio >= 1 ? longEdge : longEdge * ratio));
  const height = Math.max(1, Math.round(ratio >= 1 ? longEdge / ratio : longEdge));
  const results = [];
  for (let index = 0; index < options.count; index++) {
    const asset = assets[index % assets.length];
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('demo_output_context_unavailable');
    const scale = Math.max(width / asset.image.naturalWidth, height / asset.image.naturalHeight);
    const sw = width / scale, sh = height / scale;
    context.drawImage(asset.image, (asset.image.naturalWidth - sw) / 2, (asset.image.naturalHeight - sh) / 2, sw, sh, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('demo_output_encode_failed')), 'image/png'));
    canvas.width = 0; canvas.height = 0;
    const url = URL.createObjectURL(blob);
    try {
      const result = await prepareMainImage({ id: url, url, name: `快捷编辑 · ${index + 1}`, mimeType: 'image/png' });
      await rememberDemoAsset(url, blob);
      results.push(result);
    } catch (error) { URL.revokeObjectURL(url); throw error; }
  }
  return results;
}
