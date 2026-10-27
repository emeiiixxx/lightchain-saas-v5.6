import type { PromptEntry } from './components/PromptLibrary';

const LEGACY_KEY = 'lc-v56-design-prompts';
const DATABASE = 'lc-v56-design-prompt-library';
const STORE = 'library';
const SNAPSHOT = 'current';
type Snapshot = {
  version: 1;
  entries: (Omit<PromptEntry, 'coverUrl'> & { coverKey?: number })[];
  covers: string[];
};
export type PromptStoreResult = { ok: true } | { ok: false; message: string };

function validate(entries: unknown): PromptEntry[] {
  if (!Array.isArray(entries) || entries.some(entry => !entry || typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.content !== 'string')) {
    throw new Error('Invalid prompt library');
  }
  return entries.map(entry => ({ id: entry.id, name: entry.name, content: entry.content, pinned: entry.pinned === true,
    coverUrl: typeof entry.coverUrl === 'string' && /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(entry.coverUrl) ? entry.coverUrl : undefined }));
}
export function readLegacyPrompts(): PromptEntry[] {
  const raw = localStorage.getItem(LEGACY_KEY);
  return raw === null ? [] : validate(JSON.parse(raw));
}
function pack(entries: PromptEntry[]): Snapshot {
  const covers: string[] = [];
  const indexes = new Map<string, number>();
  return { version: 1, entries: entries.map(({ coverUrl, ...entry }) => {
    if (!coverUrl) return entry;
    let coverKey = indexes.get(coverUrl);
    if (coverKey === undefined) { coverKey = covers.length; indexes.set(coverUrl, coverKey); covers.push(coverUrl); }
    return { ...entry, coverKey };
  }), covers };
}
function unpack(snapshot: Snapshot): PromptEntry[] {
  if (snapshot.version !== 1 || !Array.isArray(snapshot.entries) || !Array.isArray(snapshot.covers)) throw new Error('Invalid prompt library');
  return validate(snapshot.entries.map(({ coverKey, ...entry }) => {
    if (coverKey !== undefined && (!Number.isInteger(coverKey) || typeof snapshot.covers[coverKey] !== 'string')) throw new Error('Invalid cover');
    return { ...entry, coverUrl: coverKey === undefined ? undefined : snapshot.covers[coverKey] };
  }));
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new DOMException('Database upgrade blocked', 'InvalidStateError')); };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
async function transaction(mode: IDBTransactionMode, snapshot?: Snapshot): Promise<Snapshot | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = snapshot ? tx.objectStore(STORE).put(snapshot, SNAPSHOT) : tx.objectStore(STORE).get(SNAPSHOT);
      tx.oncomplete = () => { db.close(); resolve(snapshot ?? request.result); };
      tx.onabort = () => { db.close(); reject(tx.error ?? request.error ?? new Error('Transaction aborted')); };
    } catch (error) { db.close(); reject(error); }
  });
}
let migration: Promise<void> | undefined;
function initialize(): Promise<void> {
  if (!migration) migration = (async () => {
    if (await transaction('readonly') !== undefined) return;
    const entries = readLegacyPrompts();
    const snapshot = pack(entries);
    const db = await openDatabase();
    // Recheck inside the write transaction so concurrent tabs cannot replace an existing library.
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const request = tx.objectStore(STORE).get(SNAPSHOT);
      request.onsuccess = () => { if (request.result === undefined) tx.objectStore(STORE).put(snapshot, SNAPSHOT); };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error ?? request.error); };
    });
    // Only release the old localStorage payload after commit.
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* The database already owns a complete copy. */ }
  })().catch(error => { migration = undefined; throw error; });
  return migration;
}
export async function loadPrompts(): Promise<PromptEntry[]> {
  await initialize();
  const snapshot = await transaction('readonly');
  if (!snapshot) throw new Error('Prompt library is missing');
  return unpack(snapshot);
}
export async function persistPrompts(entries: PromptEntry[]): Promise<void> {
  await initialize();
  await transaction('readwrite', pack(entries));
}
export function promptStorageError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return '浏览器站点储存配额不足，未保存的内容已保留';
  if (error instanceof DOMException && error.name === 'SecurityError') return '浏览器禁止此页面储存数据，请检查隐私设置';
  return '提示词储存失败，内容已保留，请重试';
}
