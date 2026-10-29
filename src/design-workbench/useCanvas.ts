import { readDemoState, writeDemoState, restoreDemoUrls, rememberDemoAsset } from './demo-storage';
import { resolveProjectCover } from './project-cover';
import type { Notify } from './notification';
import { CanvasIsolationCache, IMAGE_FILENAME_TOP_SPACE, paintCanvasImage, paintCanvasImageFilename, paintCanvasScene, type CanvasPalette } from './canvas-renderer';
import { nextCanvasTime, orderArrangementUnits } from './canvas-order';
import { MOTION_DURATION, easeOut } from './motion';
import { downloadSelection } from './download-selection';
import { arrangeBoxes, type CanvasLayout } from './canvas-arrangement';
import { exportImage } from './download-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { expandGroups, imageBounds, selectionBounds, type Alignment, type Bounds } from './canvas-selection';
import { intersectsViewport, screenBounds } from './canvas-toolbar';
import { placeAgentImageBatch } from './agent-image-placement';
import { placeToolbarImageBatch } from './toolbar-image-placement';
import { imageBatchFitZoom, placeAddedImages, restoreCanvasContentGroups } from './canvas-image-additions';
import { createDesignCanvasFileNamer } from './canvas-image-filename';
import { CANVAS_IMAGE_GAP } from './canvas-spacing';
import { canvasMediaFilename, type GeneratedMediaFile } from '../canvas-media-filename';
import { hitShape, shapeSvg, type CanvasShape, type ShapeKind } from './canvas-shapes';

export type CanvasImage = { shape?: CanvasShape; id: string; name: string; image: HTMLImageElement; url: string; mimeType?: string; generatedFile?: GeneratedMediaFile; x: number; y: number; width: number; height: number; addedAt?: number; additionBatchId?: string; contentGroupId?: string; agentConversationId?: string; generatedAt?: number; uploadedAt?: number; origin?: 'upload' | 'generated' | 'copy'; generationParentId?: string; generationRootId?: string; generationRootAddedAt?: number; generationBatchId?: string; generationIndex?: number; groupId?: string; groupedAt?: number; generating?: boolean; generationFailed?: boolean; taskResultId?: string; generationPlacement?: 'agent'; fit?: 'cover'; rotation?: number; radius?: number; opacity?: number; flipX?: boolean; flipY?: boolean; stroke?: string; strokeWidth?: number; strokeOpacity?: number; strokeStyle?: 'solid' | 'dashed' | 'dotted'; strokeAlign?: 'inside' | 'center' | 'outside'; favorite?: boolean; cover?: boolean };
function refreshShapeAsset(item: CanvasImage, patch?: Partial<CanvasImage>): CanvasImage {
  if (!item.shape || (patch && !['shape', 'width', 'height', 'stroke', 'strokeWidth', 'strokeOpacity', 'strokeStyle', 'radius', 'flipX', 'flipY'].some(key => key in patch))) return item;
  const url = shapeSvg(item.shape, item.width, item.height, item.stroke, item.strokeWidth, item);
  const image = new Image(); image.src = url;
  return { ...item, image, url, mimeType: 'image/svg+xml' };
}
type Camera = { x: number; y: number; zoom: number };
type Point = { x: number; y: number };
function movableImageAt(images: CanvasImage[], point: Point, camera: Camera) {
  const world = { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
  return [...images].reverse().find(image => {
    if (image.generating) return false;
    if (image.shape) return hitShape(image, world, camera.zoom);
    const angle = -(image.rotation ?? 0) * Math.PI / 180;
    const dx = world.x - image.x - image.width / 2, dy = world.y - image.y - image.height / 2;
    return Math.abs(dx * Math.cos(angle) - dy * Math.sin(angle)) <= image.width / 2
      && Math.abs(dx * Math.sin(angle) + dy * Math.cos(angle)) <= image.height / 2;
  });
}
// Manual zoom has a 10% minimum; C01 batch focus can fit larger result batches.
const MIN_ZOOM = 0.1;
function fittedCanvasZoom(bounds: Bounds, viewport: { width: number; height: number }) {
  return Math.max(MIN_ZOOM, Math.min(Math.max(1, viewport.width) / bounds.width,
    Math.max(1, viewport.height - IMAGE_FILENAME_TOP_SPACE) / bounds.height, 1));
}
const clamp = (n: number) => Math.min(4, Math.max(MIN_ZOOM, n));
const editing = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable],dialog');

export function useCanvas(notify: Notify, theme: 'dark' | 'light', locale = 'zh-CN') {
  const [fileNamer] = useState(createDesignCanvasFileNamer);
  const lookupImageFilename = useCallback((resultId: string) => fileNamer.lookup(resultId), [fileNamer]);
  const [filenameIcon, setFilenameIcon] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let active = true;
    const image = new Image(); image.src = '/assets/design-workbench/canvas-image-name.svg';
    void image.decode().then(() => { if (active) setFilenameIcon(image); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lock = useRef(false);
  const [locked, setLocked] = useState(false);
  const quickEditing = useRef<string | null>(null);
  const setQuickEditing = useCallback((id: string | null) => { quickEditing.current = id; }, []);
  const [blankClickVersion, setBlankClickVersion] = useState(0);
  const [isolatedImageId, setIsolatedImageId] = useState<string | null>(null);
  const [isolation, setIsolation] = useState({ id: null as string | null, amount: 0 });
  const isolationFrame = useRef(isolation);
  const isolationCache = useRef<CanvasIsolationCache | null>(null);
  useEffect(() => () => { isolationCache.current?.dispose(); isolationCache.current = null; }, []);
  useEffect(() => {
    const start = isolationFrame.current;
    const id = isolatedImageId ?? start.id;
    const target = isolatedImageId ? 1 : 0;
    const from = isolatedImageId && isolatedImageId !== start.id ? 0 : start.amount;
    const apply = (amount: number) => {
      const next = { id: amount === 0 ? null : id, amount };
      isolationFrame.current = next; setIsolation(next);
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || from === target) { apply(target); return; }
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / MOTION_DURATION);
      apply(from + (target - from) * easeOut(progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isolatedImageId]);
  const [images, setImages] = useState<CanvasImage[]>([]);
  const projectCover = useMemo(() => resolveProjectCover(images), [images]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string | null; worldPoint?: Point } | null>(null);
  const copied = useRef<CanvasImage[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selected = selectedIds.length === 1 ? selectedIds[0] : null;
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [panning, setPanning] = useState(false);
  const [mode, setMode] = useState<'select' | 'hand'>('select');
  const [shapeTool, setShapeTool] = useState<ShapeKind | null>(null);
  const [shapePreview, setShapePreview] = useState<CanvasImage | null>(null);
  const shapeDraft = useRef<{ pointer: number; start: Point; point: Point; camera: Camera; item: CanvasImage; moved: boolean } | null>(null);
  const cancelShape = useCallback(() => { shapeDraft.current = null; setShapePreview(null); }, []);
  const chooseMode = useCallback((next: 'select' | 'hand') => {
    cancelShape(); setShapeTool(null); setMode(next);
  }, [cancelShape]);
  const [spacePressed, setSpacePressed] = useState(false);
  const effectiveMode = spacePressed ? 'hand' : mode;
  const [historyVersion, setHistoryVersion] = useState(0);
  const future = useRef<CanvasImage[][]>([]);
  const live = useRef({ images, selected, selectedIds, camera, size, mode, shapeTool });
  live.current = { images, selected, selectedIds, camera, size, mode, shapeTool };
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    let active = true;
    const saved = readDemoState<{ images: Omit<CanvasImage, 'image'>[]; camera: Camera } | null>('canvas', null);
    void (async () => {
      try {
        if (saved) {
          const items = await restoreDemoUrls(saved.images);
          const loaded = await Promise.all(items.map(async item => { const image = new Image(); image.src = item.url; await image.decode(); return { ...item, image }; }));
          if (active && !live.current.images.length) { const named = restoreCanvasContentGroups(fileNamer.restore(loaded)); live.current.images = named; setImages(named); setCamera(saved.camera); }
        }
      } catch { /* Keep the current session usable if stored Demo data cannot load. */ }
      if (active) setRestored(true);
    })();
    return () => { active = false; };
  }, [fileNamer]);
  useEffect(() => {
    if (!restored) return;
    // Serialization and synchronous localStorage writes must not compete with
    // camera or placement frames. Save once interaction has settled.
    let timer: ReturnType<typeof setTimeout>;
    const save = () => {
      if (focusAnimation.current || placementAnimation.current) { timer = setTimeout(save, MOTION_DURATION); return; }
      writeDemoState('canvas', { images: live.current.images, camera: live.current.camera });
    };
    timer = setTimeout(save, MOTION_DURATION);
    return () => clearTimeout(timer);
  }, [restored, images, camera]);
  useEffect(() => {
    if (!restored) return;
    const save = () => writeDemoState('canvas', { images: live.current.images, camera: live.current.camera });
    const hidden = () => { if (document.visibilityState === 'hidden') save(); };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', hidden); save(); };
  }, [restored]);
  const placementAnimation = useRef<((finish: boolean) => void) | null>(null);
  const finishPlacement = useCallback(() => placementAnimation.current?.(true), []);
  useEffect(() => () => placementAnimation.current?.(false), []);
  const selectMany = useCallback((ids: string[]) => {
    if (lock.current) return;
    const valid = [...new Set(ids)].filter(id => live.current.images.some(item => item.id === id && !item.generating));
    live.current.selectedIds = valid; live.current.selected = valid.length === 1 ? valid[0] : null;
    setSelectedIds(valid);
  }, []);
  const setSelected = useCallback((id: string | null) => selectMany(id ? [id] : []), [selectMany]);
  const history = useRef<CanvasImage[][]>([]);
  const urls = useRef<string[]>([]);
  const space = useRef(false);
  const gesture = useRef<{ mode: 'pan' | 'move' | 'marquee'; point: Point; camera: Camera; ids: string[]; baseIds: string[]; snapshot: CanvasImage[]; moved: boolean; blank: boolean; primary: boolean } | null>(null);
  const hoverPoint = useRef<Point | null>(null);
  const updateMoveCursor = useCallback(() => {
    const state = live.current, drag = gesture.current;
    const movable = !lock.current && !state.shapeTool && state.mode === 'select' && !space.current
      && (drag ? drag.mode === 'move' && drag.ids.length > 0
        : !!hoverPoint.current && !!movableImageAt(state.images, hoverPoint.current, state.camera));
    canvasRef.current?.toggleAttribute('data-movable', movable);
  }, []);
  useEffect(updateMoveCursor, [images, camera, mode, shapeTool, locked, panning, spacePressed, updateMoveCursor]);
  const animatePlacement = useCallback((next: CanvasImage[], onComplete?: () => void) => {
    finishPlacement();
    const previous = new Map(live.current.images.map(image => [image.id, image]));
    const moving = new Map(next.flatMap(image => {
      const from = previous.get(image.id);
      return from && (from.x !== image.x || from.y !== image.y) ? [[image.id, { from, to: image }] as const] : [];
    }));
    if (!moving.size || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      live.current.images = next; setImages(next); onComplete?.(); return;
    }
    const initial = next.map(image => {
      const pair = moving.get(image.id);
      return pair ? { ...image, x: pair.from.x, y: pair.from.y } : image;
    });
    live.current.images = initial; setImages(initial);
    const started = performance.now();
    let frame = 0;
    const apply = (progress: number) => {
      const amount = easeOut(progress);
      const value = live.current.images.map(image => {
        const pair = moving.get(image.id);
        return pair ? { ...image, x: pair.from.x + (pair.to.x - pair.from.x) * amount, y: pair.from.y + (pair.to.y - pair.from.y) * amount } : image;
      });
      live.current.images = value; setImages(value);
    };
    const cancel = (finish: boolean) => {
      cancelAnimationFrame(frame);
      if (finish) apply(1);
      if (placementAnimation.current === cancel) placementAnimation.current = null;
    };
    placementAnimation.current = cancel;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / MOTION_DURATION);
      apply(progress);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else { placementAnimation.current = null; onComplete?.(); }
    };
    frame = requestAnimationFrame(tick);
  }, [finishPlacement]);
  const focusAnimation = useRef<(() => void) | null>(null);
  useEffect(() => () => focusAnimation.current?.(), []);
  const setInteractionLocked = useCallback((value: boolean) => {
    if (!value) focusAnimation.current?.();
    lock.current = value; setLocked(value);
    cancelShape(); setShapeTool(null);
    gesture.current = null; space.current = false;
    setSpacePressed(false); setPanning(false); setMarquee(null); setContextMenu(null);
  }, [cancelShape]);
  const editingViewport = useCallback((ignorePanels = false) => {
    // Local tools stay centered in the full canvas; sidebars overlay this editing view.
    if (ignorePanels) return { left: 16, right: live.current.size.width - 16 };
    const canvas = canvasRef.current, rect = canvas?.getBoundingClientRect();
    const stage = canvas?.parentElement;
    const leftPanel = stage?.querySelector<HTMLElement>('#canvas-left-sidebar:not([data-phase="exit"])');
    const rightPanel = stage?.querySelector<HTMLElement>('#canvas-right-sidebar:not([data-phase="exit"])');
    let left = leftPanel && rect ? leftPanel.offsetLeft + leftPanel.offsetWidth + 24 : 80;
    let right = rightPanel && rect ? rightPanel.offsetLeft - 24 : live.current.size.width - 80;
    if (right - left < 240) { left = 16; right = live.current.size.width - 16; }
    return { left, right };
  }, []);
  const focusImage = useCallback((id: string, bottomInset: number, options?: { animate?: boolean; staged?: boolean; ignorePanels?: boolean; onComplete?: () => void }) => {
    focusAnimation.current?.();
    const item = live.current.images.find(image => image.id === id); if (!item) return;
    const bounds = imageBounds(item), { left, right } = editingViewport(options?.ignorePanels ?? true);
    const viewport = live.current.size;
    const compact = viewport.width <= 1024 || viewport.height <= 800;
    // Fit to the composer overlap edge, with less top clearance on compact screens.
    const top = compact ? 48 : 112;
    const bottom = Math.max(top + 1, viewport.height - bottomInset);
    const zoom = clamp(Math.min((right - left) / bounds.width, (bottom - top) / bounds.height));
    // Anchor the camera to this image, independently of other canvas elements and sidebars.
    const center = { x: item.x + item.width / 2, y: item.y + item.height / 2 };
    const target = { x: (left + right) / 2, y: bottom - bounds.height * zoom / 2 };
    const next = { zoom, x: target.x - center.x * zoom, y: target.y - center.y * zoom };
    const apply = (camera: Camera) => { live.current.camera = camera; setCamera(camera); };
    if (!options?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      apply(next); options?.onComplete?.(); return;
    }
    const start = { ...live.current.camera };
    const origin = { x: center.x * start.zoom + start.x, y: center.y * start.zoom + start.y };
    const duration = MOTION_DURATION;
    const started = performance.now();
    let frame = 0, cancelled = false;
    const cancel = () => {
      cancelled = true; cancelAnimationFrame(frame);
      if (focusAnimation.current === cancel) focusAnimation.current = null;
    };
    focusAnimation.current = cancel;
    const tick = (now: number) => {
      if (cancelled) return;
      const elapsed = now - started;
      const progress = Math.min(1, elapsed / duration);
      const pan = easeOut(progress), scale = pan;
      const currentZoom = Math.exp(Math.log(start.zoom) + Math.log(zoom / start.zoom) * scale);
      apply({ zoom: currentZoom, x: origin.x + (target.x - origin.x) * pan - center.x * currentZoom, y: origin.y + (target.y - origin.y) * pan - center.y * currentZoom });
      if (elapsed < duration) frame = requestAnimationFrame(tick);
      else { apply(next); focusAnimation.current = null; options.onComplete?.(); }
    };
    frame = requestAnimationFrame(tick);
    return cancel;
  }, [editingViewport]);
  const remember = useCallback((snapshot: CanvasImage[]) => { history.current.push(snapshot); future.current = []; setHistoryVersion(v => v + 1); if (history.current.length > 40) history.current.shift(); }, []);
  const worldPoint = useCallback((point: Point, cam = live.current.camera) => ({ x: (point.x - cam.x) / cam.zoom, y: (point.y - cam.y) / cam.zoom }), []);
  const transitionCamera = useCallback((next: Camera, animate = false, point?: Point, duration = MOTION_DURATION, delay = 0) => {
    focusAnimation.current?.();
    const apply = (value: Camera) => { live.current.camera = value; setCamera(value); };
    if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(next); return; }
    const start = { ...live.current.camera };
    const anchor = point ?? { x: live.current.size.width / 2, y: live.current.size.height / 2 };
    const from = worldPoint(anchor, start), to = worldPoint(anchor, next);
    // Adding images can make the first render expensive. Start the clock on
    // the first frame, so that work cannot consume the visible transition.
    let started: number | null = null;
    let frame = 0, cancelled = false;
    const cancel = () => {
      cancelled = true; cancelAnimationFrame(frame);
      if (focusAnimation.current === cancel) focusAnimation.current = null;
    };
    focusAnimation.current = cancel;
    const tick = (now: number) => {
      if (cancelled) return;
      started ??= now;
      const elapsed = now - started - delay;
      if (elapsed < 0) { frame = requestAnimationFrame(tick); return; }
      const progress = Math.min(1, elapsed / Math.max(1, duration));
      if (progress === 1) { apply(next); focusAnimation.current = null; return; }
      const eased = easeOut(progress);
      const zoom = start.zoom * Math.pow(next.zoom / start.zoom, eased);
      apply({ zoom, x: anchor.x - (from.x + (to.x - from.x) * eased) * zoom, y: anchor.y - (from.y + (to.y - from.y) * eased) * zoom });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }, [worldPoint]);
  const zoomAt = useCallback((zoom: number, point?: Point, options?: { animate?: boolean; duration?: number }) => {
    if (lock.current) return;
    finishPlacement();
    const p = point ?? { x: live.current.size.width / 2, y: live.current.size.height / 2 };
    // After a large C01 batch fitted below 10%, zooming out must not jump in.
    const z = Math.min(4, Math.max(Math.min(MIN_ZOOM, live.current.camera.zoom), zoom)), world = worldPoint(p);
    transitionCamera({ x: p.x - world.x * z, y: p.y - world.y * z, zoom: z }, options?.animate, p, options?.duration);
  }, [worldPoint, transitionCamera]);
  const navigateMinimap = useCallback((x: number, y: number) => {
    if (lock.current) return;
    finishPlacement();
    focusAnimation.current?.();
    const state = live.current;
    const next = { ...state.camera, x: state.size.width / 2 - x * state.camera.zoom, y: state.size.height / 2 - y * state.camera.zoom };
    live.current.camera = next; setCamera(next);
  }, []);
  const arrangementViewport = useCallback(() => {
    const viewport = live.current.size;
    // Keep the arranged content inside the actual visible canvas, clear of both sidebars.
    const canvas = canvasRef.current, stage = canvas?.parentElement;
    const canvasRect = canvas?.getBoundingClientRect();
    const leftPanel = stage?.querySelector<HTMLElement>('#canvas-left-sidebar:not([data-phase="exit"])');
    const rightPanel = stage?.querySelector<HTMLElement>('#canvas-right-sidebar:not([data-phase="exit"])');
    let left = leftPanel && canvasRect ? leftPanel.offsetLeft + leftPanel.offsetWidth + 32 : 80;
    let right = rightPanel && canvasRect ? rightPanel.offsetLeft - 32 : viewport.width - 80;
    if (right - left < 120) { left = 24; right = viewport.width - 24; }
    const top = 80, bottom = Math.max(top + 1, viewport.height - 112);
    return { left, right, top, bottom };
  }, []);
  const agentViewport = useCallback(() => {
    const canvas = canvasRef.current, stage = canvas?.parentElement;
    const rect = canvas?.getBoundingClientRect(), size = live.current.size;
    let left = 16, right = size.width - 16, top = 16;
    // Reserve fixed controls even on the empty canvas, where they appear with
    // the first result. Include their actual position when compact UI stacks.
    let bottom = size.height - (size.width <= 1300 ? 144 : 80);
    if (stage && rect) {
      const bounds = (selector: string) => {
        const element = stage.querySelector<HTMLElement>(selector);
        const box = element?.getBoundingClientRect();
        return box && box.width > 0 && box.height > 0 ? box : null;
      };
      const leftPanel = bounds('#canvas-left-sidebar:not([data-phase="exit"])') ?? bounds('.left-tools');
      const rightPanel = bounds('#canvas-right-sidebar:not([data-phase="exit"])');
      if (leftPanel) left = Math.max(left, leftPanel.right - rect.left + 16);
      if (rightPanel) right = Math.min(right, rightPanel.left - rect.left - 16);
      const project = bounds('.project-panel');
      if (project && project.right - rect.left > left && project.left - rect.left < right) top = Math.max(top, project.bottom - rect.top + 16);
      for (const selector of ['.bottom-tools', '.zoom-tools']) {
        const toolbar = bounds(selector);
        if (toolbar && toolbar.right - rect.left > left && toolbar.left - rect.left < right) bottom = Math.min(bottom, toolbar.top - rect.top - 16);
      }
    }
    return { left, right: Math.max(left + 1, right), top, bottom: Math.max(top + 1, bottom) };
  }, []);
  const focusAgentImages = useCallback((items: CanvasImage[]) => {
    if (!items.length) return;
    const bounds = selectionBounds(items), viewport = agentViewport();
    // Only this batch determines scale, even when other objects are far away.
    // Do not impose the manual zoom floor: a tall batch must remain fully visible.
    const zoom = imageBatchFitZoom(bounds, { width: viewport.right - viewport.left, height: viewport.bottom - viewport.top }, IMAGE_FILENAME_TOP_SPACE);
    const center = { x: (viewport.left + viewport.right) / 2, y: (viewport.top + viewport.bottom) / 2 };
    transitionCamera({ x: center.x - (bounds.x + bounds.width / 2) * zoom, y: center.y + IMAGE_FILENAME_TOP_SPACE / 2 - (bounds.y + bounds.height / 2) * zoom, zoom }, true, center);
  }, [agentViewport, transitionCamera]);
  const focusAgentResults = useCallback((resultIds: string[]) => {
    if (lock.current || !resultIds.length) return false;
    finishPlacement();
    const items = resultIds.map(id => live.current.images.find(item => item.taskResultId === id));
    if (items.some(item => !item)) return false;
    focusAgentImages(items as CanvasImage[]);
    return true;
  }, [finishPlacement, focusAgentImages]);
  const addAgentImages = useCallback((items: (Omit<CanvasImage, 'x' | 'y'> & { taskResultId: string })[], options?: { agentConversationId?: string; appendAfter?: CanvasImage; focus?: boolean; acceptedTask?: boolean }) => {
    if ((lock.current && !options?.acceptedTask) || !items.length) return { images: [], addedCount: 0 };
    finishPlacement();
    const state = live.current, viewport = agentViewport();
    const seen = new Set(state.images.flatMap(item => item.taskResultId ? [item.taskResultId] : []));
    const conversationId = options?.agentConversationId ?? items[0].agentConversationId ?? 'agent-demo-20261028';
    const contentGroupId = `agent:${conversationId}`;
    const pending = items.filter(item => {
      if (seen.has(item.taskResultId)) return false;
      seen.add(item.taskResultId); return true;
    }).map(item => ({ ...fileNamer.assign(item, 'AI助手', state.images), addedAt: nextCanvasTime(), cover: false,
      contentGroupId, agentConversationId: conversationId, origin: 'generated' as const, generationPlacement: 'agent' as const }));
    const start = worldPoint({ x: viewport.left, y: viewport.top });
    const width = pending.reduce((sum, item) => sum + item.width, 0) + Math.max(0, pending.length - 1) * CANVAS_IMAGE_GAP;
    const height = Math.max(1, ...pending.map(item => item.height));
    const targetZoom = options?.focus === false ? state.camera.zoom : imageBatchFitZoom({ width, height }, { width: viewport.right - viewport.left, height: viewport.bottom - viewport.top }, IMAGE_FILENAME_TOP_SPACE);
    const additions = placeAgentImageBatch(pending, state.images, { ...start, width: (viewport.right - viewport.left) / state.camera.zoom, height: (viewport.bottom - viewport.top) / state.camera.zoom }, {
      appendAfter: options?.appendAfter, filenameTopSpace: IMAGE_FILENAME_TOP_SPACE / Math.max(0.0001, targetZoom),
    });
    if (additions.length) {
      if (options?.acceptedTask) {
        // Later outputs belong to the already accepted operation. Keep that
        // batch atomic in undo, including edits made while it was generating.
        const batchIds = new Set(additions.map(item => item.generationBatchId));
        const extend = (snapshot: CanvasImage[]) => snapshot.some(item => batchIds.has(item.generationBatchId))
          ? [...snapshot, ...additions.filter(item => !snapshot.some(existing => existing.id === item.id))] : snapshot;
        history.current = history.current.map(extend);
        future.current = future.current.map(extend);
        if (gesture.current) gesture.current.snapshot = extend(gesture.current.snapshot);
      } else remember(state.images);
      const next = [...state.images, ...additions];
      // Commit before React paints so concurrent accepted tasks see reserved space.
      live.current.images = next; setImages(next);
      if (options?.focus !== false) {
        selectMany(additions.filter(item => !item.generating).map(item => item.id));
        focusAgentImages(additions);
      }
    } else if (options?.focus !== false) {
      focusAgentResults(items.map(item => item.taskResultId));
    }
    return { images: additions, addedCount: additions.length };
  }, [agentViewport, worldPoint, remember, selectMany, finishPlacement, focusAgentImages, focusAgentResults, fileNamer]);
  const fit = useCallback((options?: { animate?: boolean }) => {
    if (lock.current) return;
    finishPlacement();
    const items = live.current.images;
    if (!items.length) { transitionCamera({ x: 0, y: 0, zoom: 1 }, options?.animate); return; }
    const bounds = selectionBounds(items);
    const { left, right, top, bottom } = arrangementViewport();
    const zoom = fittedCanvasZoom(bounds, { width: right - left, height: bottom - top });
    const next = { x: (left + right) / 2 - (bounds.x + bounds.width / 2) * zoom, y: (top + IMAGE_FILENAME_TOP_SPACE + bottom) / 2 - (bounds.y + bounds.height / 2) * zoom, zoom };
    transitionCamera(next, options?.animate);
  }, [arrangementViewport, transitionCamera]);
  const returnToContent = useCallback(() => {
    if (lock.current) return;
    finishPlacement();
    fit();
    const state = live.current;
    // At the 10% limit, widely separated images can leave the fitted center empty.
    if (!state.images.length || state.images.some(item => intersectsViewport(screenBounds(imageBounds(item), state.camera), state.size))) return;
    const item = state.images.find(image => image.id === state.selected) ?? state.images[0];
    const { left, right, top, bottom } = arrangementViewport();
    const next = { ...state.camera, x: (left + right) / 2 - (item.x + item.width / 2) * state.camera.zoom, y: (top + bottom) / 2 - (item.y + item.height / 2) * state.camera.zoom };
    live.current.camera = next; setCamera(next);
  }, [fit, arrangementViewport, finishPlacement]);
  const removeSelected = useCallback(() => {
    if (lock.current) return;
    finishPlacement();
    const { images: items, selectedIds: ids } = live.current;
    if (!ids.length) return;
    remember(items);
    const next = items.filter(item => !ids.includes(item.id));
    live.current.images = next; setImages(next); setSelected(null);
  }, [remember, setSelected, finishPlacement]);
  const undo = useCallback(() => { if (lock.current || live.current.images.some(image => image.generating)) return; finishPlacement(); const snapshot = history.current.pop(); if (snapshot) { future.current.push(live.current.images); live.current.images = snapshot; setImages(snapshot); setSelected(null); setHistoryVersion(v => v + 1); } }, [finishPlacement, setSelected]);
  const redo = useCallback(() => { if (lock.current || live.current.images.some(image => image.generating)) return; finishPlacement(); const snapshot = future.current.pop(); if (snapshot) { history.current.push(live.current.images); live.current.images = snapshot; setImages(snapshot); setSelected(null); setHistoryVersion(v => v + 1); } }, [finishPlacement, setSelected]);
  const beginEdit = useCallback(() => { finishPlacement(); remember(live.current.images); }, [remember, finishPlacement]);
  const updateSelected = useCallback((patch: Partial<CanvasImage>, record = true) => {
    if (lock.current) return;
    finishPlacement();
    const state = live.current; if (!state.selected) return; if (record) remember(state.images);
    const next = state.images.map(item => item.id === state.selected ? refreshShapeAsset({ ...item, ...patch }, patch) : item);
    live.current.images = next; setImages(next);
  }, [remember, finishPlacement]);
  const insertCopies = useCallback((items: CanvasImage[], center?: Point) => {
    if (lock.current) return;
    finishPlacement();
    if (!items.length) return;
    const state = live.current, groups = new Map<string, { id: string; time: number }>();
    const bounds = selectionBounds(items);
    const offset = center
      ? { x: center.x - bounds.x - bounds.width / 2, y: center.y - bounds.y - bounds.height / 2 }
      : { x: 32, y: 32 };
    const clones = items.map(item => {
      if (item.groupId && !groups.has(item.groupId)) groups.set(item.groupId, { id: crypto.randomUUID(), time: nextCanvasTime() });
      return { ...item, cover: false, origin: 'copy' as const, taskResultId: undefined, uploadedAt: undefined, id: crypto.randomUUID(), addedAt: nextCanvasTime(), generatedAt: undefined, generationParentId: undefined, generationRootId: undefined, generationRootAddedAt: undefined, generationBatchId: undefined, generationIndex: undefined, groupId: item.groupId ? groups.get(item.groupId)!.id : undefined, groupedAt: item.groupId ? groups.get(item.groupId)!.time : undefined, x: item.x + offset.x, y: item.y + offset.y };
    });
    remember(state.images); const next = [...state.images, ...clones]; live.current.images = next; setImages(next);
    selectMany(clones.map(item => item.id)); return clones;
  }, [remember, selectMany, finishPlacement]);
  const duplicate = useCallback(() => { finishPlacement(); insertCopies(live.current.images.filter(item => live.current.selectedIds.includes(item.id) && !item.generating && !item.generationFailed)); }, [insertCopies, finishPlacement]);
  const copySelected = useCallback(() => {
    finishPlacement();
    const items = live.current.images.filter(item => live.current.selectedIds.includes(item.id) && !item.generating && !item.generationFailed);
    if (items.length) { copied.current = items.map(item => ({ ...item })); notify('已复制，可在画布中粘贴', 'success'); }
  }, [notify, finishPlacement]);
  const paste = useCallback(() => {
    const { size } = live.current;
    const pointer = hoverPoint.current;
    const { left, right } = editingViewport();
    const point = pointer && pointer.x >= 0 && pointer.x <= size.width && pointer.y >= 0 && pointer.y <= size.height
      ? pointer : { x: (left + right) / 2, y: size.height / 2 };
    insertCopies(copied.current, worldPoint(point));
  }, [insertCopies, editingViewport, worldPoint]);
  const updateImages = useCallback((patches: (Partial<CanvasImage> & { id: string })[], record = false) => {
    if (lock.current) return;
    finishPlacement();
    const state = live.current; if (record) remember(state.images);
    const lookup = new Map(patches.map(patch => [patch.id, patch]));
    const next = state.images.map(item => lookup.has(item.id) ? refreshShapeAsset({ ...item, ...lookup.get(item.id) }, lookup.get(item.id)!) : item);
    live.current.images = next; setImages(next);
  }, [remember, finishPlacement]);
  const groupSelection = useCallback((ungroup = false) => {
    finishPlacement();
    const state = live.current;
    if (state.selectedIds.length < 2 && !ungroup) return;
    const ids = expandGroups(state.images, state.selectedIds);
    const groupId = ungroup ? undefined : crypto.randomUUID();
    const groupedAt = ungroup ? undefined : nextCanvasTime();
    updateImages(ids.map(id => ({ id, groupId, groupedAt })), true); selectMany(ids);
  }, [selectMany, updateImages, finishPlacement]);
  const alignSelection = useCallback((alignment: Alignment) => {
    finishPlacement();
    const state = live.current, items = state.images.filter(item => state.selectedIds.includes(item.id));
    if (items.length < 2) return;
    const bounds = selectionBounds(items);
    updateImages(items.map(item => {
      const box = imageBounds(item);
      const dx = alignment === 'left' ? bounds.x - box.x : alignment === 'center' ? bounds.x + bounds.width / 2 - box.x - box.width / 2 : alignment === 'right' ? bounds.x + bounds.width - box.x - box.width : 0;
      const dy = alignment === 'top' ? bounds.y - box.y : alignment === 'middle' ? bounds.y + bounds.height / 2 - box.y - box.height / 2 : alignment === 'bottom' ? bounds.y + bounds.height - box.y - box.height : 0;
      return { id: item.id, x: item.x + dx, y: item.y + dy };
    }), true);
  }, [updateImages, finishPlacement]);
  const reorder = useCallback((direction: 'front' | 'up' | 'down' | 'back') => {
    if (lock.current) return;
    finishPlacement();
    const state = live.current, index = state.images.findIndex(i => i.id === state.selected);
    if (index < 0) return;
    const target = direction === 'front' ? state.images.length - 1 : direction === 'back' ? 0 : Math.max(0, Math.min(state.images.length - 1, index + (direction === 'up' ? 1 : -1)));
    if (target === index) return;
    remember(state.images); const next = [...state.images]; const [item] = next.splice(index, 1); next.splice(target, 0, item);
    live.current.images = next; setImages(next);
  }, [remember, finishPlacement]);
  const setCover = useCallback((imageId: string) => {
    finishPlacement();
    const state = live.current;
    const target = state.images.find(item => item.id === imageId);
    if (!target || target.shape || target.generating || target.generationFailed) return false;
    if (!target.cover) {
      remember(state.images);
      const next = state.images.map(item => ({ ...item, cover: item.id === imageId }));
      live.current.images = next; setImages(next);
    }
    notify('已设为项目封面', 'success');
    return true;
  }, [remember, notify, finishPlacement]);
  const resetCover = useCallback((imageId: string) => {
    finishPlacement();
    const state = live.current;
    if (!state.images.some(item => item.id === imageId && item.cover)) return false;
    remember(state.images);
    const next = state.images.map(item => item.cover ? { ...item, cover: false } : item);
    live.current.images = next; setImages(next);
    notify('已恢复默认封面', 'success');
    return true;
  }, [remember, notify, finishPlacement]);
  const downloadImage = useCallback(async (format: 'PNG' | 'JPG' | 'WebP' | 'AVIF') => {
    const state = live.current;
    const items = state.images.filter(item => state.selectedIds.includes(item.id) && !item.generating && !item.generationFailed);
    if (!items.length) return;
    try {
      if (items.length > 1) await downloadSelection(items, format);
      else { if (items[0].shape) await items[0].image.decode(); await exportImage(items[0].image, items[0].name, format); }
    } catch (error) { notify(error instanceof Error && error.message === '当前浏览器不支持此格式导出，请选择其他格式' ? error.message : '下载失败，请重试。', 'error'); }
  }, [notify]);
  const arrange = useCallback((layout: CanvasLayout = 'compact', scope: 'canvas' | 'selection' = 'canvas') => {
    if (lock.current) return;
    finishPlacement();
    focusAnimation.current?.();
    const state = live.current;
    const selectedIds = new Set(expandGroups(state.images, state.selectedIds));
    const targets = scope === 'selection' ? state.images.filter(item => selectedIds.has(item.id)) : state.images;
    if (!targets.length) return;
    // Each group occupies one layout cell; move all members by the same delta.
    const units = new Map<string, CanvasImage[]>();
    targets.forEach(item => {
      const key = item.groupId ? `group:${item.groupId}` : `image:${item.id}`;
      const members = units.get(key);
      if (members) members.push(item);
      else units.set(key, [item]);
    });
    // Both new and legacy items follow the current top-to-bottom layer order.
    const itemsByUnit = orderArrangementUnits([...units.values()], state.images);
    if (itemsByUnit.length === 1) {
      if (scope === 'canvas') fit({ animate: true });
      return;
    }
    const boxes = itemsByUnit.map(selectionBounds);
    const viewport = arrangementViewport();
    const viewportSize = { width: viewport.right - viewport.left, height: viewport.bottom - viewport.top };
    const aspectRatio = viewportSize.width / viewportSize.height;
    // Names occupy 16px + an 8px gap in screen space. Reserve that height in
    // each layout cell, in addition to the shared world-pixel spacing.
    // Whole-canvas arrangement subsequently fits the view, so solve against
    // that destination zoom instead of using the pre-arrangement camera.
    let labelZoom = scope === 'canvas' ? 1 : state.camera.zoom;
    let positions: Point[] = [];
    for (let pass = 0; ; pass++) {
      const filenameHeight = IMAGE_FILENAME_TOP_SPACE / labelZoom;
      positions = arrangeBoxes(boxes.map(box => ({ ...box, height: box.height + filenameHeight })), layout, aspectRatio);
      if (scope === 'selection') break;
      const arrangedBounds = {
        x: 0, y: 0,
        width: Math.max(...positions.map((point, index) => point.x + boxes[index].width)),
        height: Math.max(...positions.map((point, index) => point.y + boxes[index].height)),
      };
      const fitZoom = fittedCanvasZoom(arrangedBounds, viewportSize);
      if (fitZoom >= labelZoom) break;
      // Round downward to avoid a floating-point convergence loop. If packing
      // keeps changing, the normal fit floor provides a safe bounded fallback.
      labelZoom = pass < 20 ? Math.max(MIN_ZOOM, Math.floor(fitZoom * 1000) / 1000) : MIN_ZOOM;
    }
    const origin = selectionBounds(targets);
    const offsets = new Map<string, Point>();
    itemsByUnit.forEach((members, index) => {
      const offset = {
        x: origin.x + positions[index].x - boxes[index].x,
        y: origin.y + positions[index].y - boxes[index].y,
      };
      members.forEach(item => offsets.set(item.id, offset));
    });
    const next = state.images.map(item => {
      const offset = offsets.get(item.id);
      return offset ? { ...item, x: item.x + offset.x, y: item.y + offset.y } : item;
    });
    remember(state.images);
    // Show the movement in the current view before fitting the arranged canvas.
    // Local arrangement keeps the current viewport and the unselected canvas in place.
    animatePlacement(next, scope === 'canvas' ? () => fit({ animate: true }) : undefined);
  }, [remember, fit, arrangementViewport, finishPlacement, animatePlacement]);

  const addImages = useCallback((items: Omit<CanvasImage, 'x' | 'y'>[], options?: { point?: Point; panDelay?: number }) => {
    if (lock.current || !items.length) return;
    finishPlacement();
    const state = live.current, viewport = agentViewport();
    const start = worldPoint({ x: viewport.left, y: viewport.top });
    const additionBatchId = crypto.randomUUID();
    const pending = items.map(item => ({ ...item, name: canvasMediaFilename(item.name, item.url), generatedFile: undefined,
      width: item.image.naturalWidth || item.width, height: item.image.naturalHeight || item.height,
      cover: false, origin: 'upload' as const, uploadedAt: item.uploadedAt ?? nextCanvasTime(), id: crypto.randomUUID(),
      addedAt: nextCanvasTime(), additionBatchId, contentGroupId: `added:${additionBatchId}`, agentConversationId: undefined,
      generatedAt: undefined, generationParentId: undefined, generationRootId: undefined, generationRootAddedAt: undefined,
      generationBatchId: undefined, generationIndex: undefined, taskResultId: undefined, generationPlacement: undefined,
      generating: false, generationFailed: false, groupId: undefined, groupedAt: undefined }));
    const additions = placeAddedImages(pending, state.images,
      { ...start, width: (viewport.right - viewport.left) / state.camera.zoom, height: (viewport.bottom - viewport.top) / state.camera.zoom },
      { point: options?.point, filenameTopSpace: IMAGE_FILENAME_TOP_SPACE / state.camera.zoom });
    remember(state.images);
    const next = [...state.images, ...additions]; live.current.images = next;
    setImages(next); selectMany(additions.map(item => item.id));
    if (!options?.point) {
      const bounds = selectionBounds(additions), zoom = state.camera.zoom;
      // Pan only. If the batch exceeds the viewport, show its beginning instead
      // of shrinking it or centering an off-screen gap between large images.
      const left = viewport.left + Math.max(0, (viewport.right - viewport.left - bounds.width * zoom) / 2);
      const top = viewport.top + Math.max(0, (viewport.bottom - viewport.top - bounds.height * zoom - IMAGE_FILENAME_TOP_SPACE) / 2);
      transitionCamera({ x: left - bounds.x * zoom, y: top + IMAGE_FILENAME_TOP_SPACE - bounds.y * zoom, zoom }, true, undefined, MOTION_DURATION, options?.panDelay);
    }
  }, [agentViewport, transitionCamera, remember, worldPoint, finishPlacement, selectMany]);

  // Toolbar tasks reserve a complete row below all current content; Agent
  // rounds reserve each image only as that image starts.
  const beginGeneration = useCallback((sourceId: string | undefined, count: number, fallback?: {
    name?: string; taskRecordId?: string; sourceSize?: { width: number; height: number };
    outputSize?: { width: number; height: number }; outputSizes?: { width: number; height: number }[];
    placement?: 'agent'; agentConversationId?: string; generationIndex?: number; sourceIds?: string[];
  }) => {
    const acceptedContinuation = fallback?.placement === 'agent' && (fallback.generationIndex ?? 0) > 0;
    if ((lock.current && !acceptedContinuation) || count < 1) return [];
    finishPlacement();
    if (fallback?.placement === 'agent') {
      const batchId = fallback.taskRecordId ?? crypto.randomUUID();
      const index = fallback.generationIndex ?? 0;
      const output = fallback.outputSize ?? fallback.sourceSize;
      // No speculative placeholder until the Demo workflow resolves real pixels.
      if (!output || output.width <= 0 || output.height <= 0) return [];
      const image = new Image();
      image.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E';
      const previous = live.current.images.filter(item => item.generationBatchId === batchId)
        .sort((a, b) => (b.generationIndex ?? 0) - (a.generationIndex ?? 0))[0];
      return addAgentImages(Array.from({ length: count }, (_, offset) => {
        const id = crypto.randomUUID();
        return fileNamer.assign({
          id, taskResultId: `${batchId}:${id}`, agentConversationId: fallback.agentConversationId,
          name: `${fallback.name ?? 'AI助手'} · ${index + offset + 1}.png`, image, url: image.src,
          width: output.width, height: output.height,
          generating: true, generationBatchId: batchId, generationIndex: index + offset,
        }, fallback.name ?? 'AI助手', live.current.images);
      }), { agentConversationId: fallback.agentConversationId, appendAfter: index > 0 ? previous : undefined,
        focus: index === 0, acceptedTask: acceptedContinuation }).images;
    }
    const state = live.current;
    const normalized = restoreCanvasContentGroups(state.images);
    const requestedIds = new Set([sourceId, ...(fallback?.sourceIds ?? [])].filter(Boolean));
    const sources = normalized.filter(item => requestedIds.has(item.id) && !item.generating && !item.generationFailed);
    const existingSource = normalized.find(item => item.id === sourceId);
    if (existingSource?.generating || existingSource?.generationFailed || (!existingSource && !fallback)) return [];
    const viewport = agentViewport();
    const start = worldPoint({ x: viewport.left, y: viewport.top });
    const source = existingSource;
    const defaultSize = fallback?.outputSize ?? fallback?.sourceSize
      ?? { width: source?.image.naturalWidth || source?.width || 1024, height: source?.image.naturalHeight || source?.height || 1024 };
    const sizes = Array.from({ length: count }, (_, index) => fallback?.outputSizes?.[index] ?? defaultSize);
    if (sizes.some(size => size.width <= 0 || size.height <= 0)) return [];
    const batchId = fallback?.taskRecordId ?? crypto.randomUUID();
    const groupIds = new Set(sources.map(item => item.contentGroupId!));
    const contentGroupId = groupIds.size === 1 ? [...groupIds][0] : `tool:${batchId}`;
    const image = source?.image ?? new Image();
    const pending = sizes.map((size, index): Omit<CanvasImage, 'x' | 'y'> => {
      const result: Omit<CanvasImage, 'x' | 'y'> = {
        id: crypto.randomUUID(), addedAt: nextCanvasTime(), name: `${source?.name ?? '生成结果'} · ${index + 1}`, image, url: source?.url ?? '',
        generationParentId: source?.id, generationRootId: source?.generationRootId ?? source?.id,
        generationRootAddedAt: source?.generationRootAddedAt ?? source?.addedAt ?? 0,
        generationBatchId: batchId, generationIndex: index, contentGroupId, origin: 'generated',
        width: size.width, height: size.height, generating: true, fit: 'cover',
      };
      if (fallback?.taskRecordId) result.taskResultId = `${fallback.taskRecordId}:${result.id}`;
      return fileNamer.assign(result, fallback?.name ?? '快捷编辑', state.images);
    });
    const batchSize = { width: sizes.reduce((sum, size) => sum + size.width, 0) + (count - 1) * CANVAS_IMAGE_GAP,
      height: Math.max(...sizes.map(size => size.height)) };
    const targetZoom = imageBatchFitZoom(batchSize, {
      width: viewport.right - viewport.left, height: viewport.bottom - viewport.top,
    }, IMAGE_FILENAME_TOP_SPACE);
    const filenameTopSpace = IMAGE_FILENAME_TOP_SPACE / Math.min(state.camera.zoom, targetZoom);
    const additions = placeToolbarImageBatch(pending, normalized,
      { ...start, width: (viewport.right - viewport.left) / state.camera.zoom, height: (viewport.bottom - viewport.top) / state.camera.zoom }, filenameTopSpace);
    remember(state.images);
    const next = [...normalized, ...additions]; live.current.images = next; setImages(next);
    selectMany([]); focusAgentImages(additions);
    return additions;
  }, [remember, finishPlacement, agentViewport, worldPoint, selectMany, focusAgentImages, addAgentImages, fileNamer]);

  // Single-image retry is available only on an existing failed canvas tile.
  const beginResultRetry = useCallback((resultId: string, targetResultId = resultId) => {
    finishPlacement();
    const existing = live.current.images.find(item => item.taskResultId === resultId || item.id === resultId);
    if (!existing || existing.generating || !existing.generationFailed) return null;
    const placeholder = fileNamer.assign({ ...existing, generating: true, generationFailed: false, taskResultId: targetResultId }, existing.generatedFile?.featureLabel ?? '快捷编辑');
    const next = live.current.images.map(item => item.id === existing.id ? placeholder : item);
    live.current.images = next; setImages(next);
    return placeholder;
  }, [finishPlacement, fileNamer]);

  const finishGeneration = useCallback((ids: string[], results: (Omit<CanvasImage, 'x' | 'y'> | null)[] | null, preserveFailure = false) => {
    finishPlacement();
    const resultById = new Map(ids.map((id, index) => {
      const result = results?.[index];
      return [id, result ? { ...result, generatedAt: nextCanvasTime() } : undefined] as const;
    }));
    const settle = (items: CanvasImage[]) => items.flatMap(item => {
      if (!resultById.has(item.id)) return [item];
      const result = resultById.get(item.id);
      return result ? [{ ...item, ...fileNamer.complete(item, result), url: result.url, image: result.image, width: result.image.naturalWidth, height: result.image.naturalHeight, mimeType: result.mimeType, generatedAt: result.generatedAt, generating: false, generationFailed: false }] : preserveFailure ? [{ ...item, generating: false, generationFailed: true }] : [];
    });
    // Undo/redo must never bring back a placeholder whose task has already finished.
    history.current = history.current.map(settle); future.current = future.current.map(settle);
    if (gesture.current) gesture.current.snapshot = settle(gesture.current.snapshot);
    const next = settle(live.current.images); live.current.images = next; setImages(next);
  }, [finishPlacement, fileNamer]);

  const upload = useCallback(async (files: FileList | File[], point?: Point) => {
    if (lock.current) return;
    finishPlacement();
    const dropPoint = point ? worldPoint(point) : undefined;
    const accepted = Array.from(files).filter(file => ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'].includes(file.type) && file.size <= 20 * 1024 * 1024);
    if (accepted.length !== files.length) notify('支持 JPG、PNG、WebP、SVG、GIF，单张图片不超过 20 MB', 'error');
    if (!accepted.length) return;
    const results = await Promise.allSettled(accepted.map(file => new Promise<Omit<CanvasImage, 'x' | 'y'>>((resolve, reject) => {
      const url = URL.createObjectURL(file), image = new Image(); urls.current.push(url);
      image.onload = async () => { try { await rememberDemoAsset(url, file); } catch (error) { reject(error); return; } resolve({ id: crypto.randomUUID(), name: file.name, mimeType: file.type, origin: 'upload', uploadedAt: nextCanvasTime(), image, url, width: image.naturalWidth, height: image.naturalHeight }); };
      image.onerror = reject; image.src = url;
    })));
    const loaded = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
    if (loaded.length !== accepted.length) notify('部分图片无法读取，请重新选择', 'error');
    if (!loaded.length || lock.current) return;
    addImages(loaded, dropPoint ? { point: dropPoint } : undefined);
  }, [notify, worldPoint, finishPlacement, addImages]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(canvas); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current!, ctx = canvas.getContext('2d');
    if (!ctx || size.width <= 0 || size.height <= 0) {
      isolationCache.current?.dispose(); isolationCache.current = null;
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(size.width * dpr) || canvas.height !== Math.round(size.height * dpr)) {
      canvas.width = Math.round(size.width * dpr); canvas.height = Math.round(size.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    const style = getComputedStyle(document.documentElement);
    const palette: CanvasPalette = {
      background: style.getPropertyValue('--background-canvas').trim(),
      surface: style.getPropertyValue('--background-default').trim(),
      text: style.getPropertyValue('--text-secondary').trim(),
      filenameText: style.getPropertyValue('--text-tertiary').trim(),
      filenameIcon,
      foregroundFilenameIds: new Set(selectedIds),
      track: style.getPropertyValue('--border-strong').trim(),
      progress: style.getPropertyValue('--brand-primary-hover').trim(),
      loadingLabel: locale === 'en' ? 'Generating...' : '\u751f\u6210\u4e2d...',
      badgeBackground: style.getPropertyValue('--surface-floating-strong').trim(),
      badgeText: style.getPropertyValue('--text-on-brand-white').trim(),
      coverId: projectCover?.cover ? projectCover.id : undefined,
      coverLabel: locale === 'en' ? 'Cover' : locale === 'ja' ? 'カバー' : '封面',
      vectorLabel: locale === 'en' ? 'Vector' : locale === 'ja' ? 'ベクター' : '矢量图',
      fontFamily: getComputedStyle(document.body).fontFamily,
    };
    ctx.fillStyle = palette.background; ctx.fillRect(0, 0, size.width, size.height);
    const editingImage = isolation.amount > 0 ? images.find(image => image.id === isolation.id && !image.generating) : undefined;
    if (editingImage) {
      const cache = isolationCache.current ??= new CanvasIsolationCache();
      const background = cache.get(images, editingImage.id, camera, size, dpr, theme, palette);
      if (background) {
        ctx.save(); ctx.globalAlpha = 1 - isolation.amount * .7;
        ctx.drawImage(background, 0, 0, size.width, size.height); ctx.restore();
      } else {
        // Equivalent opaque-background composite without an extra buffer if allocation fails.
        paintCanvasScene(ctx, images, camera, size, palette, editingImage.id, true);
        ctx.save(); ctx.globalAlpha = isolation.amount * .7; ctx.fillStyle = palette.background;
        ctx.fillRect(0, 0, size.width, size.height); ctx.restore();
      }
      ctx.save(); ctx.translate(camera.x, camera.y); ctx.scale(camera.zoom, camera.zoom);
      paintCanvasImage(ctx, editingImage, palette);
      if (!palette.foregroundFilenameIds.has(editingImage.id)) paintCanvasImageFilename(ctx, editingImage, palette, camera.zoom);
      ctx.restore();
    } else {
      isolationCache.current?.dispose(); isolationCache.current = null;
      paintCanvasScene(ctx, images, camera, size, palette);
    }
    if (shapePreview) {
      ctx.save(); ctx.translate(camera.x, camera.y); ctx.scale(camera.zoom, camera.zoom);
      paintCanvasImage(ctx, shapePreview, palette); ctx.restore();
    }
  }, [images, selectedIds, camera, size, theme, locale, isolation, projectCover, filenameIcon, shapePreview]);

  useEffect(() => {
    const canvas = canvasRef.current!, stage = canvas.parentElement!;
    const local = (e: { clientX: number; clientY: number }) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const wheel = (e: WheelEvent) => {
      // This capture listener runs before nested editors: modal wheels belong to the dialog.
      if (document.querySelector('dialog[open]')) return;
      if (e.target instanceof Element && e.target.closest('[data-canvas-ui]')) return;
      e.preventDefault(); if (lock.current) return; const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? live.current.size.height : 1;
      focusAnimation.current?.();
      if (shapeDraft.current) return;
      if (e.ctrlKey || e.metaKey || e.altKey) zoomAt(live.current.camera.zoom * Math.exp(-e.deltaY * unit * .006), local(e));
      else setCamera(cam => ({ ...cam, x: cam.x - (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit, y: cam.y - (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit }));
    };
    const context = (e: MouseEvent) => {
      if (lock.current) { e.preventDefault(); return; }
      finishPlacement();
      focusAnimation.current?.();
      cancelShape(); setShapeTool(null);
      const state = live.current;
      const hit = movableImageAt(state.images, local(e), state.camera);
      e.preventDefault(); gesture.current = null; setPanning(false); setMarquee(null);
      if (!hit) { setSelected(null); setContextMenu({ x: e.clientX, y: e.clientY, id: null, worldPoint: worldPoint({ x: e.clientX - canvas.getBoundingClientRect().left, y: e.clientY - canvas.getBoundingClientRect().top }) }); return; }
      live.current.selected = hit.id; setSelected(hit.id); setContextMenu({ x: e.clientX, y: e.clientY, id: hit.id });
    };
    const down = (e: PointerEvent) => {
      if (lock.current) { e.preventDefault(); return; }
      if (e.button !== 0 && e.button !== 1) return;
      finishPlacement();
      focusAnimation.current?.();
      const point = local(e), state = live.current;
      hoverPoint.current = point;
      const hit = movableImageAt(state.images, point, state.camera);
      const pan = state.mode === 'hand' || space.current || e.button === 1 || (!!quickEditing.current && !hit);
      if (state.shapeTool && !pan) {
        const start = worldPoint(point, state.camera);
        const names = { rectangle: '矩形', ellipse: '圆形', triangle: '三角形', line: '线条', arrow: '箭头' };
        const token = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim();
        const channels = token.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
        const color = channels ? '#' + channels.slice(1, 4).map(value => Number(value).toString(16).padStart(2, '0')).join('') : token || '#ADB8B7';
        const item: CanvasImage = { id: crypto.randomUUID(), name: names[state.shapeTool], shape: { kind: state.shapeTool, fill: color },
          image: new Image(), url: '', x: start.x, y: start.y, width: 1, height: 1,
          stroke: color, strokeWidth: ['line', 'arrow'].includes(state.shapeTool) ? 2 / state.camera.zoom : 0, strokeStyle: 'solid', addedAt: nextCanvasTime() };
        shapeDraft.current = { pointer: e.pointerId, start, point, camera: { ...state.camera }, item, moved: false };
        setContextMenu(null); selectMany([]); gesture.current = null;
        canvas.setPointerCapture(e.pointerId); e.preventDefault(); canvas.focus({ preventScroll: true });
        return;
      }
      let ids = state.selectedIds;
      const baseIds = e.shiftKey ? [...ids] : [];
      if (!pan) {
        setContextMenu(null);
        if (hit) {
          const hitIds = e.ctrlKey || e.metaKey ? [hit.id] : expandGroups(state.images, [hit.id]);
          ids = e.shiftKey ? hitIds.every(id => ids.includes(id)) ? ids.filter(id => !hitIds.includes(id)) : [...new Set([...ids, ...hitIds])] : ids.includes(hit.id) && !e.ctrlKey && !e.metaKey ? ids : hitIds;
          selectMany(ids);
        } else { ids = baseIds; selectMany(ids); }
      }
      gesture.current = { mode: pan ? 'pan' : hit ? 'move' : 'marquee', point, camera: state.camera, ids: hit && !ids.includes(hit.id) ? [] : [...ids], baseIds, snapshot: state.images, moved: false, blank: !hit, primary: e.button === 0 };
      updateMoveCursor();
      setPanning(pan); canvas.setPointerCapture(e.pointerId); e.preventDefault(); canvas.focus();
    };
    const move = (e: PointerEvent) => {
      hoverPoint.current = local(e);
      updateMoveCursor();
      const draft = shapeDraft.current;
      if (draft && draft.pointer === e.pointerId && !lock.current) {
        const point = local(e), end = worldPoint(point, draft.camera);
        let dx = end.x - draft.start.x, dy = end.y - draft.start.y;
        const linear = draft.item.shape?.kind === 'line' || draft.item.shape?.kind === 'arrow';
        if (e.shiftKey) {
          if (linear) { const distance = Math.hypot(dx, dy), angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4; dx = Math.cos(angle) * distance; dy = Math.sin(angle) * distance; }
          else { const extent = Math.max(Math.abs(dx), Math.abs(dy)); dx = (dx < 0 ? -1 : 1) * extent; dy = (dy < 0 ? -1 : 1) * extent; }
        }
        draft.moved = Math.hypot(point.x - draft.point.x, point.y - draft.point.y) >= 3;
        draft.item = { ...draft.item, x: draft.start.x + Math.min(0, dx), y: draft.start.y + Math.min(0, dy),
          width: Math.max(1, Math.abs(dx)), height: Math.max(1, Math.abs(dy)), flipX: linear && dx < 0, flipY: linear && dy < 0 };
        setShapePreview(draft.moved ? draft.item : null); return;
      }
      const drag = gesture.current; if (!drag || lock.current) return;
      const point = local(e), dx = point.x - drag.point.x, dy = point.y - drag.point.y;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      if (!drag.moved && drag.mode === 'move' && drag.ids.length) remember(drag.snapshot);
      drag.moved = true;
      if (drag.mode === 'pan') setCamera({ ...drag.camera, x: drag.camera.x + dx, y: drag.camera.y + dy });
      else if (drag.mode === 'marquee') {
        const start = worldPoint(drag.point, drag.camera), end = worldPoint(point, drag.camera);
        const box = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
        setMarquee(box);
        const hits = live.current.images.filter(item => {
          if (item.generating) return false;
          const bounds = imageBounds(item);
          return bounds.x < box.x + box.width && bounds.x + bounds.width > box.x && bounds.y < box.y + box.height && bounds.y + bounds.height > box.y;
        });
        selectMany([...drag.baseIds, ...expandGroups(live.current.images, hits.map(item => item.id))]);
      } else {
        const starts = new Map(drag.snapshot.filter(item => drag.ids.includes(item.id)).map(item => [item.id, item]));
        const next = live.current.images.map(img => { const start = starts.get(img.id); return start ? { ...img, x: start.x + dx / drag.camera.zoom, y: start.y + dy / drag.camera.zoom } : img; });
        live.current.images = next; setImages(next);
      }
    };
    const leave = () => { hoverPoint.current = null; updateMoveCursor(); };
    const up = (event?: PointerEvent) => {
      const draft = shapeDraft.current;
      if (draft) {
        if (event && event.pointerId !== draft.pointer) return;
        if (event?.type === 'pointerup') move(event);
        if (event?.type === 'pointerup' && draft.moved && !lock.current) {
          const item = refreshShapeAsset(draft.item);
          remember(live.current.images);
          const next = [...live.current.images, item]; live.current.images = next; setImages(next);
          selectMany([item.id]);
        }
        cancelShape();
        if (canvas.hasPointerCapture(draft.pointer)) canvas.releasePointerCapture(draft.pointer);
      }
      const drag = gesture.current;
      if (event?.type === 'pointerup' && drag?.blank && drag.primary && !drag.moved) setBlankClickVersion(value => value + 1);
      gesture.current = null; setMarquee(null); setPanning(false); updateMoveCursor();
    };
    const keydown = (e: KeyboardEvent) => {
      if (editing(e.target) || (e.target instanceof Element && e.target.closest('button,a')) || document.querySelector('dialog[open]')) return;
      if (lock.current) { if (e.code === 'Space' || ['Backspace', 'Delete', '+', '-', '='].includes(e.key)) e.preventDefault(); return; }
      if (e.metaKey || e.ctrlKey) {
        const key = e.key.toLowerCase();
        if (key === 'a') { e.preventDefault(); selectMany(live.current.images.filter(item => !item.generating).map(item => item.id)); return; }
        if (key === 'g') { e.preventDefault(); groupSelection(e.shiftKey); return; }
        if (['c', 'd', 'v'].includes(key)) { e.preventDefault(); if (key === 'c') copySelected(); else if (key === 'd') duplicate(); else paste(); setContextMenu(null); return; }
      }
      if (e.code === 'Space') { e.preventDefault(); space.current = true; setSpacePressed(true); }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if (e.key === 'Escape') { up(); setShapeTool(null); setSelected(null); setContextMenu(null); }
      if (e.key.toLowerCase() === 'v') chooseMode('select');
      if (e.key.toLowerCase() === 'h') chooseMode('hand');
      if (e.key === '1') zoomAt(1);
      if (e.key === '2') fit();
      if (e.key === '+' || e.key === '=') zoomAt(live.current.camera.zoom * 1.2);
      if (e.key === '-') zoomAt(live.current.camera.zoom / 1.2);
    };
    const keyup = (e: KeyboardEvent) => { if (e.code === 'Space') { space.current = false; setSpacePressed(false); } };
    const blur = () => { hoverPoint.current = null; space.current = false; setSpacePressed(false); up(); };
    stage.addEventListener('wheel', wheel, { passive: false, capture: true });
    canvas.addEventListener('contextmenu', context);
    canvas.addEventListener('pointerenter', move); canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', blur);
    return () => { canvas.removeEventListener('pointerenter', move); canvas.removeEventListener('pointerleave', leave); canvas.removeEventListener('contextmenu', context); stage.removeEventListener('wheel', wheel, true); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', blur); };
  }, [fit, remember, removeSelected, undo, redo, worldPoint, zoomAt, copySelected, duplicate, paste, selectMany, setSelected, groupSelection, updateMoveCursor, finishPlacement, cancelShape, chooseMode]);
  useEffect(() => () => { urls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  const selectShapeTool = useCallback((kind: ShapeKind) => {
    if (lock.current || !restored) return;
    cancelShape(); finishPlacement(); focusAnimation.current?.();
    setMode('select'); setShapeTool(kind); setSelected(null); setContextMenu(null);
    canvasRef.current?.focus({ preventScroll: true });
  }, [restored, cancelShape, finishPlacement, setSelected]);
  return { shapeTool, selectShapeTool, restored, lookupImageFilename, projectCover, isolationActive: isolation.amount > 0 && images.some(image => image.id === isolation.id && !image.generating), locked, setInteractionLocked, setQuickEditing, blankClickVersion, setIsolatedImageId, editingViewport, focusImage, focusAgentResults, addAgentImages, selectedIds, marquee, selectMany, updateImages, groupSelection, alignSelection, contextMenu, setContextMenu, copySelected, paste, reorder, setCover, resetCover, downloadImage, size, mode, effectiveMode, setMode: chooseMode, beginEdit, updateSelected, duplicate, arrange, redo, canUndo: !images.some(image => image.generating) && history.current.length > 0, canRedo: !images.some(image => image.generating) && future.current.length > 0, historyVersion, canvasRef, images, selected, setSelected, camera, panning, upload, addImages, beginGeneration, beginResultRetry, finishGeneration, zoomAt, navigateMinimap, fit, returnToContent, removeSelected, undo };
}
