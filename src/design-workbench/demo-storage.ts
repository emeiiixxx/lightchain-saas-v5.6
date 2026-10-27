// Local Demo persistence only. Production account/project sync still requires its service.
const prefix = 'lc-v56-design-demo:';
export function readDemoState<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(prefix + key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}
export function writeDemoState(key: string, value: unknown) {
  try {
    const serialized = JSON.stringify(value, (key, value) => key === 'image' && typeof value === 'object' ? undefined : typeof value === 'string' ? assetKeys.get(value) ?? value : value);
    if (localStorage.getItem(prefix + key) !== serialized) localStorage.setItem(prefix + key, serialized);
    return true;
  } catch { return false; }
}
const assetKeys = new Map<string, string>();
const assetLoads = new Map<string, Promise<string>>();
let database: Promise<IDBDatabase> | undefined;
function assets() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('lc-v56-design-demo-assets', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
  });
}
export async function rememberDemoAsset(url: string, file: Blob) {
  const db = await assets();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('images', 'readwrite');
    transaction.objectStore('images').put(file, url);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  assetKeys.set(url, url);
}
export function restoreDemoAsset(url: string): Promise<string> {
  if (!url.startsWith('blob:')) return Promise.resolve(url);
  if (assetKeys.has(url)) return Promise.resolve(url);
  if (!assetLoads.has(url)) assetLoads.set(url, (async () => {
    const db = await assets();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const request = db.transaction('images').objectStore('images').get(url);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!blob) throw new Error('missing_demo_asset');
    const restored = URL.createObjectURL(blob); assetKeys.set(restored, url); return restored;
  })());
  return assetLoads.get(url)!;
}
export async function restoreDemoUrls<T>(value: T): Promise<T> {
  if (typeof value === 'string') return await restoreDemoAsset(value) as T;
  if (Array.isArray(value)) return await Promise.all(value.map(restoreDemoUrls)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await restoreDemoUrls(item)]))) as T;
  return value;
}
