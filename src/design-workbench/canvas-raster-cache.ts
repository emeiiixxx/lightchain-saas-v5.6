type Raster = ImageBitmap | HTMLCanvasElement;
type Entry = { source: HTMLImageElement; edge: number; raster: Raster; pixels: number };
type Job = { source: HTMLImageElement; edge: number; width: number; height: number };

// Display-only previews: keep original images and world-space dimensions intact.
// At most 32 MiB of cached RGBA pixels; browser/GPU overhead is additional.
const MAX_PIXELS = 8_388_608;
const MAX_EDGE = 2048;

function release(raster: Raster) {
  if ('close' in raster) raster.close();
  else { raster.width = 0; raster.height = 0; }
}

export class CanvasRasterCache {
  private entries = new Map<HTMLImageElement, Entry>();
  private jobs = new Map<HTMLImageElement, Job>();
  private failed = new WeakSet<HTMLImageElement>();
  private budgetBlocked = new WeakSet<HTMLImageElement>();
  private visible = new Set<HTMLImageElement>();
  private view = '';
  private pixels = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private working = false;
  private epoch = 0;

  constructor(private readonly invalidate: () => void) {}

  beginFrame(view: string) {
    this.visible.clear();
    if (this.view !== view) { this.view = view; this.budgetBlocked = new WeakSet(); }
  }

  endFrame() {
    for (const source of this.jobs.keys()) if (!this.visible.has(source)) this.jobs.delete(source);
  }

  get(source: HTMLImageElement, scale: number): CanvasImageSource {
    this.visible.add(source);
    const longest = Math.max(source.naturalWidth, source.naturalHeight);
    const edge = Math.max(128, 2 ** Math.ceil(Math.log2(Math.max(1, longest * scale))));
    // High zoom uses the original; never stretch a small preview or rasterize SVG/GIF.
    if (!longest || edge > MAX_EDGE || edge >= longest || /(?:\.svg|\.gif)(?:[?#]|$)|^data:image\/(?:svg\+xml|gif)/i.test(source.src)) return source;
    const entry = this.entries.get(source);
    if (entry && entry.edge >= edge) {
      this.entries.delete(source); this.entries.set(source, entry);
      return entry.raster;
    }
    if (!this.failed.has(source) && !this.budgetBlocked.has(source) && !this.jobs.has(source)) {
      this.jobs.set(source, { source, edge, width: Math.max(1, Math.round(source.naturalWidth * edge / longest)),
        height: Math.max(1, Math.round(source.naturalHeight * edge / longest)) });
      this.schedule();
    }
    // Preparing a preview must not block the current frame or make it blurry.
    return source;
  }

  private schedule() {
    if (this.working || this.timer !== null || !this.jobs.size) return;
    this.timer = setTimeout(() => { this.timer = null; void this.buildNext(); }, 32);
  }

  private async buildNext() {
    const job = this.jobs.values().next().value;
    if (!job) return;
    this.working = true;
    const epoch = this.epoch;
    let raster: Raster | null = null;
    try {
      if (typeof createImageBitmap === 'function') {
        raster = await createImageBitmap(job.source, { resizeWidth: job.width, resizeHeight: job.height, resizeQuality: 'high' });
        if (raster.width !== job.width || raster.height !== job.height) throw new Error('Preview resize unavailable');
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = job.width; canvas.height = job.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Preview context unavailable');
        context.imageSmoothingQuality = 'high';
        context.drawImage(job.source, 0, 0, job.width, job.height);
        raster = canvas;
      }
      if (epoch !== this.epoch || this.jobs.get(job.source) !== job) { release(raster); return; }
      const previous = this.entries.get(job.source);
      if (previous) { this.pixels -= previous.pixels; release(previous.raster); this.entries.delete(job.source); }
      const pixels = job.width * job.height;
      while (this.pixels + pixels > MAX_PIXELS && this.entries.size) {
        // Do not churn through previews when a dense viewport exceeds the budget.
        const oldest = [...this.entries.values()].find(entry => !this.visible.has(entry.source));
        if (!oldest) { this.budgetBlocked.add(job.source); release(raster); return; }
        this.entries.delete(oldest.source); this.pixels -= oldest.pixels; release(oldest.raster);
      }
      this.entries.set(job.source, { source: job.source, edge: job.edge, raster, pixels });
      this.pixels += pixels;
      this.invalidate();
    } catch {
      if (raster) release(raster);
      this.failed.add(job.source);
    } finally {
      if (this.jobs.get(job.source) === job) this.jobs.delete(job.source);
      this.working = false;
      this.schedule();
    }
  }

  retain(sources: ReadonlySet<HTMLImageElement>) {
    this.budgetBlocked = new WeakSet();
    for (const [source, entry] of this.entries) {
      if (sources.has(source)) continue;
      this.entries.delete(source); this.pixels -= entry.pixels; release(entry.raster);
    }
    for (const source of this.jobs.keys()) if (!sources.has(source)) this.jobs.delete(source);
  }

  dispose() {
    this.epoch++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.jobs.clear();
    this.visible.clear();
    for (const entry of this.entries.values()) release(entry.raster);
    this.entries.clear(); this.pixels = 0;
  }
}
