import { canvasMediaFilename } from './canvas-media-filename';

export type CopyFilenameSource = {
  name: string;
  url: string;
  video?: { name: string; url: string };
  nodeOnly?: boolean;
  shape?: unknown;
};

function copyFamily(source: CopyFilenameSource) {
  const media = source.video ?? source;
  const filename = canvasMediaFilename(media.name, media.url);
  const extension = filename.match(/^.+(\.[a-z0-9]+)$/i)?.[1] ?? '';
  const stem = extension ? filename.slice(0, -extension.length) : filename;
  const suffix = stem.match(/_副本(\d*)$/);
  const base = stem.replace(/(?:_副本\d*)+$/, '');
  const sequence = suffix ? Math.max(1, Number(suffix[1]) || 1) : 0;
  return { base, extension, sequence, key: `${base}\u0000${extension.toLowerCase()}` };
}

// One allocator per insertion reserves names for the whole batch. Read the
// destination canvas at insertion time so repeated pastes never share a name.
// This numbering is independent of generated-image filename counters.
export function createCopyFilenameAllocator(existing: ReadonlyArray<CopyFilenameSource>) {
  const counters = new Map<string, number>();
  for (const item of existing) {
    if (item.nodeOnly || item.shape) continue;
    const family = copyFamily(item);
    counters.set(family.key, Math.max(counters.get(family.key) ?? 0, family.sequence));
  }
  return (source: CopyFilenameSource) => {
    const family = copyFamily(source);
    const sequence = Math.max(counters.get(family.key) ?? 0, family.sequence) + 1;
    counters.set(family.key, sequence);
    return `${family.base}_副本${sequence === 1 ? '' : sequence}${family.extension}`;
  };
}
