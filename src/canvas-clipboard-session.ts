import { canvasSafeArea, type Bounds, type Viewport } from './canvas';

export type CanvasClipboard<T> = { token: string; items: T[]; pastes: number };

const canvasMime = 'application/x-lightchain-canvas';
const clipboardHtml = (token: string) => `<span data-lightchain-canvas="${token}"></span>`;

export function createCanvasClipboard<T>(items: T[]): CanvasClipboard<T> {
  return { token: crypto.randomUUID(), items, pastes: 0 };
}

export function writeCanvasClipboardEvent<T>(data: DataTransfer, clipboard: CanvasClipboard<T>, text: string): void {
  data.setData(canvasMime, clipboard.token);
  data.setData('text/plain', text);
  data.setData('text/html', clipboardHtml(clipboard.token));
}

export async function writeCanvasClipboardSystem<T>(clipboard: CanvasClipboard<T>, text: string): Promise<void> {
  // Keep readable names in the OS clipboard. The HTML marker identifies only
  // this in-memory snapshot; unrelated external text never restores old media.
  await navigator.clipboard.write([new ClipboardItem({
    'text/plain': new Blob([text], { type: 'text/plain' }),
    'text/html': new Blob([clipboardHtml(clipboard.token)], { type: 'text/html' }),
  })]);
}

export function matchesCanvasClipboard<T>(data: DataTransfer, clipboard: CanvasClipboard<T>): boolean {
  if (data.getData(canvasMime) === clipboard.token) return true;
  const htmlToken = new DOMParser().parseFromString(data.getData('text/html'), 'text/html')
    .querySelector('[data-lightchain-canvas]')?.getAttribute('data-lightchain-canvas');
  return htmlToken === clipboard.token;
}

export function getCanvasPasteOffset(
  bounds: Bounds,
  view: Viewport,
  size: { width: number; height: number },
  pastes: number,
  point?: { x: number; y: number },
): { x: number; y: number } {
  if (point) return { x: point.x - bounds.x, y: point.y - bounds.y };
  const offset = 32 * (pastes + 1) / view.zoom;
  const x = bounds.x + offset, y = bounds.y + offset;
  const area = canvasSafeArea(size.width, size.height);
  const outside = x * view.zoom + view.x > area.x + area.width
    || (x + bounds.width) * view.zoom + view.x < area.x
    || y * view.zoom + view.y > area.y + area.height
    || (y + bounds.height) * view.zoom + view.y < area.y;
  if (!outside) return { x: offset, y: offset };
  return {
    x: (area.x + area.width / 2 - view.x) / view.zoom - bounds.width / 2 - bounds.x,
    y: (area.y + area.height / 2 - view.y) / view.zoom - bounds.height / 2 - bounds.y,
  };
}
