export const generationRatios = ['auto', '1:1', '3:4', '4:3', '9:16', '16:9'] as const;
export const generationResolutions = ['1K', '2K', '4K'] as const;
export type RememberedWorkflowKind = 'fusion' | 'batch' | 'merge' | 'directed';
export type GenerationSettings = { ratio: string; resolution: string };
type StoredSettings = GenerationSettings & { version: 1; savedAt: number };
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
type WorkflowSettings = GenerationSettings & { kind?: string };

const defaults: GenerationSettings = { ratio: 'auto', resolution: '2K' };
export function rememberedWorkflowKind(kind?: string): RememberedWorkflowKind | null {
  const value = kind ?? 'fusion';
  return value === 'fusion' || value === 'batch' || value === 'merge' || value === 'directed' ? value : null;
}

function browserStorage(): StorageAccess | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function decode(raw: string | null): Partial<GenerationSettings> & { savedAt?: number } | undefined {
  if (!raw) return undefined;
  try {
    const record: unknown = JSON.parse(raw);
    if (!record || typeof record !== 'object' || !('version' in record) || record.version !== 1) return undefined;
    const value = record as Partial<StoredSettings>;
    return {
      ratio: typeof value.ratio === 'string' ? value.ratio : undefined,
      resolution: typeof value.resolution === 'string' ? value.resolution : undefined,
      savedAt: typeof value.savedAt === 'number' && Number.isFinite(value.savedAt) ? value.savedAt : undefined,
    };
  } catch { return undefined; }
}

// Each type has its own account-scoped key. Reading at creation time also sees
// the last change from another tab, without applying it to existing nodes.
export function createGenerationSettingsMemory(accountId: string, storage: () => StorageAccess | null = browserStorage) {
  const fallback = new Map<RememberedWorkflowKind, { record: StoredSettings; storedBefore?: string | null }>();
  const key = (kind: RememberedWorkflowKind) => `lc-v56-generation-settings:${encodeURIComponent(accountId)}:${kind}`;
  return {
    read(kind: RememberedWorkflowKind, originalDefaults: GenerationSettings = defaults): GenerationSettings {
      const pending = fallback.get(kind);
      let record: Partial<GenerationSettings> | undefined = pending?.record;
      try {
        const target = storage();
        if (target) {
          const raw = target.getItem(key(kind));
          const stored = decode(raw);
          // A successful later write from another tab supersedes a failed local
          // write. An unchanged persisted value must not erase the local choice.
          if (!pending || (pending.storedBefore !== undefined ? raw !== pending.storedBefore : (stored?.savedAt ?? 0) > pending.record.savedAt)) {
            record = stored;
            fallback.delete(kind);
          }
        }
      } catch { /* Retain this session's choice while storage is unavailable. */ }
      return {
        ratio: generationRatios.find(value => value === record?.ratio) ?? originalDefaults.ratio,
        resolution: generationResolutions.find(value => value === record?.resolution) ?? originalDefaults.resolution,
      };
    },
    remember(kind: RememberedWorkflowKind, current: GenerationSettings, patch: Partial<GenerationSettings>): boolean {
      const ratioChanged = patch.ratio !== undefined && patch.ratio !== current.ratio;
      const resolutionChanged = patch.resolution !== undefined && patch.resolution !== current.resolution;
      if (!ratioChanged && !resolutionChanged) return false;
      if (patch.ratio !== undefined && !generationRatios.some(value => value === patch.ratio)) return false;
      if (patch.resolution !== undefined && !generationResolutions.some(value => value === patch.resolution)) return false;
      const record: StoredSettings = { version: 1, ratio: patch.ratio ?? current.ratio, resolution: patch.resolution ?? current.resolution, savedAt: Date.now() };
      let storedBefore: string | null | undefined;
      try {
        const target = storage();
        if (!target) throw new Error('storage_unavailable');
        try { storedBefore = target.getItem(key(kind)); } catch { /* Writing may still be available. */ }
        target.setItem(key(kind), JSON.stringify(record));
        fallback.delete(kind);
      } catch {
        // Keep the latest explicit choice for this session if persistence is
        // unavailable. Do not interrupt editing or rewrite any canvas snapshot.
        fallback.set(kind, { record, storedBefore });
      }
      return true;
    },
  };
}

// This static Demo has no sign-in service. Production can supply the signed-in
// account ID and replace storage with its account preferences API.
export const demoGenerationSettingsMemory = createGenerationSettingsMemory('demo-account');

export function rememberGenerationSettingsChange(current: WorkflowSettings, patch: Partial<WorkflowSettings>, memory = demoGenerationSettingsMemory): boolean {
  const kind = rememberedWorkflowKind(current.kind);
  return kind !== null && memory.remember(kind, current, patch);
}
