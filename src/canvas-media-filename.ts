export type GeneratedMediaFile = {
  featureKey: string;
  featureLabel: string;
  date: string;
  sequence: number;
  extension: string;
};

type NamedMedia = { name: string; url: string; video?: { name: string; url: string } };
type ExistingMedia = { generatedFile?: GeneratedMediaFile };
const mediaExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'svg', 'heic', 'heif', 'mp4', 'mov', 'webm', 'm4v']);

function filenameExtension(value: string): string | undefined {
  const extension = value.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();
  return extension && mediaExtensions.has(extension) ? extension : undefined;
}

function extensionFrom(value: string): string | undefined {
  return filenameExtension(value.split(/[?#]/, 1)[0]);
}

// Library fixtures may carry a display title rather than a complete filename.
// Only append a known source extension; never guess one for opaque/blob URLs.
export function canvasMediaFilename(name: string, url = ''): string {
  if (filenameExtension(name)) return name;
  const extension = extensionFrom(url);
  return extension ? `${name}.${extension}` : name;
}

function mediaExtension(media: NamedMedia, override?: string): string {
  if (override) return override.replace(/^\./, '').toLowerCase();
  const source = media.video ?? media;
  return extensionFrom(source.url) ?? filenameExtension(source.name) ?? (media.video ? 'mp4' : 'png');
}

// One allocator belongs to one canvas session. Undo and deletion do not reuse
// previously issued numbers; restored media can advance the current counter.
export function createCanvasFileNamer() {
  const counters = new Map<string, number>();
  return {
    assign<T extends NamedMedia>(results: T[], featureKey: string, featureLabel: string, existing: ReadonlyArray<ExistingMedia>, extension?: string): Array<T & { generatedFile: GeneratedMediaFile }> {
      const now = new Date();
      const date = [String(now.getFullYear()).slice(-2), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
      const counterKey = `${featureKey}:${date}`;
      let sequence = counters.get(counterKey) ?? 0;
      for (const item of existing) {
        const file = item.generatedFile;
        if (file?.featureKey === featureKey && file.date === date) sequence = Math.max(sequence, file.sequence);
      }
      return results.map(result => {
        const generatedFile: GeneratedMediaFile = { featureKey, featureLabel, date, sequence: ++sequence, extension: mediaExtension(result, extension) };
        const name = `${featureLabel}-${date}-${String(sequence).padStart(3, '0')}.${generatedFile.extension}`;
        counters.set(counterKey, sequence);
        return { ...result, name, generatedFile, projectCover: undefined, coverOrder: undefined, ...(result.video ? { video: { ...result.video, name } } : {}) };
      });
    },
  };
}
