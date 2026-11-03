import aliases from './asset-aliases.json';

const paths: Record<string, string> = aliases;

// Only image requests are canonicalized. Names, source identities and persisted
// URLs stay intact; old public paths also remain valid for downloads/bookmarks.
export function assetDisplayUrl(url: string, locationHref = window.location.href, basePath = import.meta.env.BASE_URL): string {
  try {
    const location = new URL(locationHref);
    const resource = new URL(url, location);
    if (resource.origin !== location.origin || !/^https?:$/.test(resource.protocol)) return url;
    const base = new URL(basePath, location.origin);
    const key = resource.pathname.startsWith(base.pathname)
      ? resource.pathname.slice(base.pathname.length) : resource.pathname.replace(/^\//, '');
    const target = paths[key];
    return target ? new URL(target, base).href + resource.search + resource.hash : url;
  } catch { return url; }
}
