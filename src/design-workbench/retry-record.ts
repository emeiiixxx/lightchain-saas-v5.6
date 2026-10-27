import type { GenerationRecord } from './components/CanvasLeftPanel';

/** Deleted results stay deleted; a new canvas retry gets its own single-result task. */
export function retryRecordTarget(records: GenerationRecord[], original: GenerationRecord, result: GenerationRecord['images'][number], id: string, now: Date) {
  const existing = records.find(record => record.id === original.id && record.images.some(image => image.id === result.id));
  if (existing) return { record: existing, isNew: false };
  const time = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const record: GenerationRecord = { ...original, id, time, count: 1, generating: false, pending: false, failed: false,
    tags: original.tags.map(tag => ({ ...tag })), images: [{ ...result, status: 'generating' }] };
  return { record, isNew: true };
}
