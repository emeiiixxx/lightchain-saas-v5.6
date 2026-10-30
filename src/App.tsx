import { useCanvasPastePoint } from './useCanvasPastePoint';
import { AiTryOnPage } from './components/AiTryOnPage';
import { VideoWorkspace } from './components/VideoWorkspace';
import { DesignWorkspace } from './components/DesignWorkspace';
import { CanvasBackground } from './components/CanvasBackground';
import { CanvasProjectPanel } from './components/CanvasProjectPanel';
import { ProgressiveImage } from './components/ProgressiveImage';
import { CanvasMediaFilename } from './components/CanvasMediaFilename';
import { CanvasProjectCoverBadge } from './components/CanvasProjectCoverBadge';
import { useRememberProjectCoverUse } from './project-cover-onboarding';
import { notify, ToastHost } from './components/Toast';
import { CutoutEditor } from './components/CutoutEditor';
import { DrawingGuideEditor } from './components/DrawingGuideEditor';
import { isMultiInputWorkflow, fusionReferences, batchMainImages, workflowInputs, workflowReferenceLimit, workflowWidth, workflowHeight, workflowSources, createMergeEditor, createBatchEditor, isWorkflowDescendant, FUSION_GAP, MAX_FUSION_REFERENCES, MAX_BATCH_MAIN_IMAGES, MAX_DIRECTED_POINTS, type WorkflowKind, type FusionReference } from './canvas';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { assets } from './assets';
import { Button, Dialog, Divider, Icon, type IconName } from './components/ui';
import { DEFAULT_VIEW, createFusionEditor, restoreWorkflowMain, relatedCanvasIds, deleteCanvasSelection, canvasSafeArea, GROUP_GAP, canvasNodes, newFusionSettings, fusionPosition, arrangeImages, boundsOf, fitImages, readImage, zoomAt, type CanvasImage, type FusionSettings, type Viewport } from './canvas';
import { locales, messages, type Locale } from './i18n';
import { usePresence } from './usePresence';
import { type SnapGuides } from './canvas-snapping';
import { AssetPicker } from './components/AssetPicker';
import type { LibraryImage } from './asset-library';
import { ResultFeedbackPopover } from './components/ResultFeedbackPopover';
import { ResultFeedbackToolbar, type ResultFeedback } from './components/ResultFeedbackToolbar';
import { SelectionToolbar } from './components/SelectionToolbar';
import { CanvasChrome } from './components/CanvasChrome';
import { syncTaskFilenames, type CanvasTask } from './components/CanvasTaskList';
import { CanvasGenerationPlaceholder } from './components/CanvasGenerationPlaceholder';
import { ReactFlowCanvas } from './components/ReactFlowCanvas';
import { FullImageViewer } from './components/FullImageViewer';
import { FusionNode } from './components/FusionNode';
import { BatchEditNode } from './components/BatchEditNode';
import { DirectedFusionNode } from './components/DirectedFusionNode';
import { FlatLayNode } from './components/FlatLayNode';
import { createWorkflowExample, workflowExampleResult } from './workflow-examples';
import { ImageConnection } from './components/ImageConnection';
import { copyCanvasSelection, pasteCanvasSelection } from './canvas-clipboard';
import { createCanvasClipboard, getCanvasPasteOffset, matchesCanvasClipboard, writeCanvasClipboardEvent, writeCanvasClipboardSystem, type CanvasClipboard } from './canvas-clipboard-session';
import { CanvasContextMenu } from './components/CanvasContextMenu';
import { standaloneTaskInputs } from './canvas-task-layout';
import { createImageResults } from './canvas-image-results';
import { withCanvasOriginOrder } from './canvas-origin-order';
import { withCanvasLayoutGroups } from './canvas-layout-groups';
import { centerAddedFusionBranches } from './fusion-local-centering';
import { rememberGenerationSettingsChange } from './generation-settings-memory';
import { canvasImageTaskResults, resolveImageTaskSlots, type CanvasImageTaskRecord } from './canvas-image-tasks';
import { createCanvasFileNamer } from './canvas-media-filename';
import { isProjectCoverCandidate, projectCoverMessages, resolveProjectCover, toggleProjectCover, withProjectCoverOrder } from './canvas-project-cover';
import { getMotionDurationMs } from './motion';
import { PromptLibraryProvider } from './PromptLibraryContext';

type Theme = 'dark' | 'light' | 'system';
type Page = 'canvas' | 'tryon' | 'video' | 'design';
const currentPage = (): Page => window.location.hash === '#/design-workspace' ? 'design' : window.location.hash === '#/video-workspace' ? 'video' : window.location.hash === '#/ai-try-on' ? 'tryon' : 'canvas';
type Tool = 'cutout' | 'fusion' | 'directed' | 'lingerie' | 'flat';
type Modal = Tool | 'upload' | 'help' | 'support' | 'credits' | 'project' | null;
type PendingImage = Omit<CanvasImage, 'x' | 'y'>;
type ImagePickerTarget = { target: string; role?: 'main' };
const pickerImages = (settings?: FusionSettings, role?: 'main') => role === 'main' ? workflowInputs(settings) : fusionReferences(settings);
const pickerLimit = (settings?: FusionSettings, role?: 'main') => role === 'main' ? MAX_BATCH_MAIN_IMAGES : workflowReferenceLimit(settings);
const tools: { id: Tool; icon: IconName; nodeId: string }[] = [
  { id: 'fusion', icon: 'imgIconBusinessAi', nodeId: '14:3571' },
  { id: 'directed', icon: 'imgIconBusinessApparelDesign', nodeId: '14:3579' },
  { id: 'lingerie', icon: 'lingerieTryOn', nodeId: '136:16942' },
  { id: 'flat', icon: 'imgIconBusinessTryOnModel', nodeId: '14:3610' },
];
function saved(key: string, fallback: string) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
function save(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Storage can be unavailable in private browsing. */ } }
const isField = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"]');

export default function App() {
  const [page, setPage] = useState<Page>(currentPage);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.focusNavigation = 'pointer';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') root.dataset.focusNavigation = 'keyboard';
    };
    const onPointerDown = () => { root.dataset.focusNavigation = 'pointer'; };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      delete root.dataset.focusNavigation;
    };
  }, []);
  const [locale, setLocale] = useState<Locale>(() => { const v = saved('lc-v56-flow-locale', 'zh-CN'); return v === 'en' || v === 'ja' ? v : 'zh-CN'; });
  const [theme, setTheme] = useState<Theme>(() => { const v = saved('lc-v56-flow-theme', 'dark'); return v === 'light' || v === 'system' ? v : 'dark'; });
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [projectName, setProjectName] = useState(() => saved('lc-v56-flow-project-name', 'Untitle'));
  const [menu, setMenu] = useState<'language' | null>(null);
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number; worldX: number; worldY: number; kind?: 'image'; imageId?: string } | null>(null);
  const closeCanvasMenu = useCallback(() => setCanvasMenu(null), []);
  const [modal, setModal] = useState<Modal>(null);
  const [tasks, setTasks] = useState<CanvasTask[]>([]);
  const imageTasks = useRef(new Map<string, CanvasImageTaskRecord>());
  const fileNamer = useRef(createCanvasFileNamer()).current;
  const [images, commitImages] = useState<CanvasImage[]>([]);
  useRememberProjectCoverUse(images);
  function setImages(update: CanvasImage[] | ((previous: CanvasImage[]) => CanvasImage[])) {
    commitImages(previous => {
      const before = withCanvasLayoutGroups(withCanvasOriginOrder(previous));
      const next = typeof update === 'function' ? update(before) : update;
      return withProjectCoverOrder(withCanvasLayoutGroups(withCanvasOriginOrder(resolveImageTaskSlots(next, imageTasks.current), before), before), previous);
    });
  }
  const [referenceTarget, setReferenceTarget] = useState<ImagePickerTarget | null>(null);
  const shownReference = usePresence(referenceTarget);
  const [canvasReference, setCanvasReference] = useState<(ImagePickerTarget & { ids: string[] }) | null>(null);
  const shownCanvasReference = usePresence(canvasReference);
  const canvasReferencePreviews = shownCanvasReference.value?.ids.flatMap(id => images.find(image => image.id === id && !image.nodeOnly && !image.generation) ?? []) ?? [];
  const referencePreviewList = useRef<HTMLDivElement>(null);
  const previousReferenceIds = useRef<string[]>([]);
  useEffect(() => {
    const ids = canvasReference?.ids ?? [];
    if (ids.some(id => !previousReferenceIds.current.includes(id)) && referencePreviewList.current) {
      referencePreviewList.current.scrollLeft = referencePreviewList.current.scrollWidth;
    }
    previousReferenceIds.current = ids;
  }, [canvasReference]);
  const canvasReferenceCount = canvasReference ? pickerImages(images.find(n => n.id === canvasReference.target)?.fusion, canvasReference.role).length + canvasReference.ids.length : 0;
  const [uploads, setUploads] = useState<LibraryImage[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const raisedIds = useMemo(() => relatedCanvasIds(images, canvasReference ? canvasReference.ids : selectedIds), [images, selectedIds, canvasReference]);
  const foregroundIds = useMemo(() => {
    const ids = new Set(canvasReference ? canvasReference.ids : selectedIds);
    if (canvasReference) return ids;
    const editors = images.filter(item => item.fusion && selectedIds.includes(`${item.id}:fusion`));
    const editorIds = new Set(editors.map(item => item.id));
    for (const editor of editors) {
      for (const source of workflowSources(images, editor)) ids.add(source.id);
    }
    for (const image of images) {
      if (!image.nodeOnly && !image.sourceImageId && image.generatedByEditorId && editorIds.has(image.generatedByEditorId)) ids.add(image.id);
    }
    return ids;
  }, [images, selectedIds, canvasReference]);
  const [snapToGrid, setSnapToGrid] = useState(() => localStorage.getItem('lc-v56-flow-grid-snap') !== 'off');
  const [canvasMode, setCanvasMode] = useState<'select' | 'hand'>('select');
  const [snapGuide, setSnapGuide] = useState<SnapGuides | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [mainTarget, setMainTarget] = useState<string | null>(null);
  const shownMainTarget = usePresence(mainTarget);
  const [directedTarget, setDirectedTarget] = useState<{ editorId: string; pointId?: string } | null>(null);
  const shownDirectedTarget = usePresence(directedTarget);
  const [cutoutImage, setCutoutImage] = useState<CanvasImage | null>(null);
  const shownCutout = usePresence(cutoutImage);
  const [drawingImage, setDrawingImage] = useState<CanvasImage | null>(null);
  const shownDrawing = usePresence(drawingImage);
  useEffect(() => { if (page !== 'canvas') setDrawingImage(null); }, [page]);
  const [previewImage, setPreviewImage] = useState<CanvasImage | null>(null);
  const [view, commitView] = useState<Viewport>(DEFAULT_VIEW);
  const cameraFrame = useRef<number | null>(null);
  const setView = useCallback((next: Viewport | ((previous: Viewport) => Viewport)) => {
    if (cameraFrame.current !== null) cancelAnimationFrame(cameraFrame.current);
    cameraFrame.current = null;
    commitView(next);
  }, []);
  useEffect(() => () => {
    if (cameraFrame.current !== null) cancelAnimationFrame(cameraFrame.current);
  }, []);
  const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth, height: window.innerHeight - 48 });
  const measuredCanvasSize = useRef(canvasSize);
  const [reading, setReading] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [initialDropActive, setInitialDropActive] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const t = messages[locale];
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  const canvas = useRef<HTMLDivElement>(null);
  const ownedUrls = useRef(new Set<string>());
  type Snapshot = { images: CanvasImage[]; selectedIds: string[] };
  const history = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const canvasClipboard = useRef<CanvasClipboard<CanvasImage> | null>(null);
  const selectedRef = useRef(selectedIds); selectedRef.current = selectedIds;
  const viewRef = useRef(view); viewRef.current = view;
  const canvasPastePoint = useCanvasPastePoint(canvas, viewRef);
  const animateView = useCallback((target: Viewport) => {
    if (cameraFrame.current !== null) cancelAnimationFrame(cameraFrame.current);
    const duration = getMotionDurationMs();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || duration === 0) { setView(target); return; }
    const from = viewRef.current;
    let started: number | null = null;
    // CSS ease-out = cubic-bezier(0, 0, .58, 1); solve its time axis.
    const frame = (now: number) => {
      started ??= now;
      const progress = Math.min(1, (now - started) / duration);
      let low = 0, high = 1;
      for (let i = 0; i < 20; i++) {
        const t = (low + high) / 2;
        const x = 1.74 * (1 - t) * t * t + t * t * t;
        if (x < progress) low = t; else high = t;
      }
      const t = (low + high) / 2;
      const eased = 3 * (1 - t) * t * t + t * t * t;
      const next = progress === 1 ? target : {
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
        zoom: from.zoom + (target.zoom - from.zoom) * eased,
      };
      viewRef.current = next;
      commitView(next);
      cameraFrame.current = progress < 1 ? requestAnimationFrame(frame) : null;
    };
    cameraFrame.current = requestAnimationFrame(frame);
  }, [setView]);
  const imageRef = useRef(images); imageRef.current = images;
  useEffect(() => () => {
    imageTasks.current.forEach(task => { if (task.timer !== null) window.clearTimeout(task.timer); });
    imageTasks.current.clear();
  }, []);
  useEffect(() => {
    const cancelled = new Set<string>();
    for (const [id, task] of imageTasks.current) {
      if (task.status !== 'running') continue;
      const editorExists = images.some(image => image.id === task.editorId && image.fusion);
      if (editorExists && images.some(image => image.generation?.taskId === id)) continue;
      if (task.timer !== null) window.clearTimeout(task.timer);
      task.timer = null; task.status = 'failed'; cancelled.add(id);
    }
    if (!cancelled.size) return;
    setTasks(previous => previous.map(task => cancelled.has(task.id) ? { ...task, status: 'failed' } : task));
    setImages(previous => previous);
  }, [images]);
  const uploadEpoch = useRef(0);
  const uploadPoint = useRef<{ x: number; y: number } | null>(null);
  const shownMenu = usePresence(menu);
  const shownModal = usePresence(modal);
  const shownPreview = usePresence(previewImage);
  const selection = useMemo(() => {
    const items = canvasNodes(images).filter(n => selectedIds.includes(n.id));
    const hasWorkflow = images.some(n => n.fusion && selectedIds.includes(`${n.id}:fusion`));
    const hasPlaceholder = images.some(n => n.generation && selectedIds.includes(n.id));
    const bounds = boundsOf(items);
    return bounds && (!hasWorkflow || items.length > 1) ? { bounds, count: items.length, showToolbar: !hasWorkflow && !hasPlaceholder } : null;
  }, [images, selectedIds]);
  const shownSelection = usePresence(selection);
  const selectedResult = useMemo(() => selectedIds.length === 1
    ? images.find(image => image.id === selectedIds[0] && !image.nodeOnly && !image.generation && !image.sourceImageId && image.generatedByEditorId) ?? null
    : null, [images, selectedIds]);
  const shownResultFeedback = usePresence(!selecting && !canvasReference ? selectedResult : null);
  const [improveTarget, setImproveTarget] = useState<{ imageId: string; anchor: HTMLElement; kind: 'improve' | 'dislike' } | null>(null);
  const shownImprove = usePresence(improveTarget);
  useEffect(() => {
    if (improveTarget && (selectedResult?.id !== improveTarget.imageId || canvasReference || selecting || page !== 'canvas')) setImproveTarget(null);
  }, [selectedResult?.id, canvasReference, selecting, page, improveTarget]);
  const [resultFeedback, setResultFeedback] = useState<Record<string, ResultFeedback | undefined>>({});
  const shownSnapGuide = usePresence(snapGuide);
  const shownDrop = usePresence(dropActive ? 'drop' : null);
  const navigationNodes = useMemo(() => canvasNodes(images), [images]);
  const nodesOutsideView = images.length > 0 && !navigationNodes.some(image => {
    const left = image.x * view.zoom + view.x;
    const top = image.y * view.zoom + view.y;
    return left < canvasSize.width && top < canvasSize.height && left + image.width * view.zoom > 0 && top + image.height * view.zoom > 0;
  });
  const shownReturnToNodes = usePresence(nodesOutsideView ? 'return' : null);
  const activeTool = tools.find(tool => tool.id === shownModal.value);
  const contextCoverTarget = images.find(image => image.id === canvasMenu?.imageId);
  const projectCover = resolveProjectCover(images);

  useEffect(() => {
    const route = () => {
      uploadPoint.current = null;
      setPage(currentPage());
      setMenu(null); setCanvasMenu(null); setDirectedTarget(null); setSpaceDown(false); setDragging(false); setSelecting(false); setSnapGuide(null); setCanvasReference(null);
      setModal(null); setReferenceTarget(null); setMainTarget(null); setCutoutImage(null); setPreviewImage(null);
      document.dispatchEvent(new CustomEvent('lc-select-open', { detail: 'page-navigation' }));
    };
    window.addEventListener('hashchange', route);
    return () => window.removeEventListener('hashchange', route);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => setSystemDark(media.matches);
    media.addEventListener('change', listener); return () => media.removeEventListener('change', listener);
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = resolvedTheme; document.documentElement.style.colorScheme = resolvedTheme; save('lc-v56-flow-theme', theme); }, [theme, resolvedTheme]);
  useEffect(() => { document.documentElement.lang = locale; save('lc-v56-flow-locale', locale); }, [locale]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const update = () => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      if (!next.width || !next.height) return;
      const previous = measuredCanvasSize.current;
      measuredCanvasSize.current = next;
      if (next.width === previous.width && next.height === previous.height) return;
      setCanvasSize(next);
      // Resize preserves the world point at the viewport center and zoom.
      setView(v => ({ ...v, x: v.x + (next.width - previous.width) / 2, y: v.y + (next.height - previous.height) / 2 }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { save('lc-v56-flow-project-name', projectName); }, [projectName]);
  useEffect(() => () => { for (const url of ownedUrls.current) URL.revokeObjectURL(url); }, []);
  useEffect(() => {
    if (!menu) return;
    const dismiss = (e: PointerEvent) => { if (!(e.target instanceof Element) || !e.target.closest('[data-menu]')) setMenu(null); };
    // Dismiss before canvas gestures stop pointer events from bubbling.
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, [menu]);

  const announce = notify;
  const remember = useCallback((previous: CanvasImage[], selection = selectedRef.current) => { history.current = [...history.current.slice(-39), {images: withCanvasLayoutGroups(withCanvasOriginOrder(previous)), selectedIds: selection}]; future.current = []; setCanUndo(true); setCanRedo(false); }, []);
  const selectFlowNodes = useCallback((ids: string[]) => { selectedRef.current = ids; setSelectedIds(ids); }, []);
  const flowDragging = useRef(false);
  const flowDragRecorded = useRef(false);
  const moveFlowNodes = useCallback((positions: Map<string, { x: number; y: number }>) => {
    const next = imageRef.current.map(image => {
      const point = positions.get(image.id), editor = positions.get(`${image.id}:fusion`);
      if (!point && !editor) return image;
      return { ...image, ...(point ?? (image.nodeOnly ? editor : undefined)), ...(image.fusion ? { fusion: { ...image.fusion, position: editor ?? fusionPosition(image) } } : {}) };
    });
    const changed = next.some((image, index) => {
      const previous = imageRef.current[index];
      return image.x !== previous.x || image.y !== previous.y || (image.fusion && previous.fusion &&
        (fusionPosition(image).x !== fusionPosition(previous).x || fusionPosition(image).y !== fusionPosition(previous).y));
    });
    if (!changed) return;
    if (flowDragging.current && !flowDragRecorded.current) { remember(imageRef.current); flowDragRecorded.current = true; }
    imageRef.current = next; setImages(next);
  }, [remember]);
  const startFlowDrag = useCallback(() => {
    flowDragRecorded.current = false; flowDragging.current = true; setDragging(true);
  }, []);
  const finishFlowDrag = useCallback(() => { flowDragging.current = false; setDragging(false); setSnapGuide(null); }, []);
  const undo = useCallback(() => { const previous = history.current.pop(); if (previous) { future.current.push({ images: imageRef.current, selectedIds: selectedRef.current }); setImages(previous.images); setSelectedIds(previous.selectedIds); } setCanUndo(history.current.length > 0); setCanRedo(future.current.length > 0); }, []);
  const redo = useCallback(() => { const next = future.current.pop(); if (next) { history.current.push({ images: imageRef.current, selectedIds: selectedRef.current }); setImages(next.images); setSelectedIds(next.selectedIds); } setCanUndo(history.current.length > 0); setCanRedo(future.current.length > 0); }, []);
  const fit = useCallback(() => { const rect = canvas.current?.getBoundingClientRect(); if (rect) setView(fitImages(canvasNodes(imageRef.current), rect.width, rect.height)); }, []);
  const navigateMinimap = useCallback((x: number, y: number) => {
    const element = canvas.current;
    if (element) setView(current => ({ ...current, x: element.clientWidth / 2 - x * current.zoom, y: element.clientHeight / 2 - y * current.zoom }));
  }, []);
  const removeSelected = useCallback(() => { if (selectedIds.length) { remember(imageRef.current); setImages(items => deleteCanvasSelection(items, selectedIds)); setSelectedIds([]); } }, [selectedIds, remember]);
  function setCoverFromMenu() {
    const target = imageRef.current.find(image => image.id === canvasMenu?.imageId);
    closeCanvasMenu();
    if (!target || !isProjectCoverCandidate(target)) return;
    remember(imageRef.current);
    setImages(items => toggleProjectCover(items, target.id));
    notify(projectCoverMessages[locale][target.projectCover ? 'resetDone' : 'setDone']);
  }
  const closeModal = useCallback(() => { uploadEpoch.current++; uploadPoint.current = null; setModal(null); setReading(false); }, []);

  const pasteCopiedItems = useCallback((point?: { x: number; y: number }, sourceItems?: CanvasImage[]) => {
    const clipboard = sourceItems ? { items: sourceItems, pastes: 0 } : canvasClipboard.current;
    if (!clipboard || !canvas.current) return;
    const bounds = boundsOf(canvasNodes(clipboard.items));
    if (!bounds) return;
    const offset = getCanvasPasteOffset(bounds, viewRef.current,
      { width: canvas.current.clientWidth, height: canvas.current.clientHeight }, clipboard.pastes, point);
    const created = pasteCanvasSelection(clipboard.items, offset.x, offset.y, { existing: imageRef.current });
    clipboard.pastes++;
    remember(imageRef.current);
    const next = [...imageRef.current, ...created];
    const ids = created.map(item => item.fusion ? `${item.id}:fusion` : item.id);
    imageRef.current = next; selectedRef.current = ids;
    setImages(next); setSelectedIds(ids);
  }, [remember]);

  const renameImage = (id: string, name: string) => {
    const previous = imageRef.current;
    const image = previous.find(item => item.id === id && !item.nodeOnly && !item.generation);
    if (!image || image.name === name) return;
    remember(previous);
    const next = previous.map(item => item.id === id ? { ...item, name } : item);
    imageRef.current = next; setImages(next);
  };
  useEffect(() => { setTasks(previous => syncTaskFilenames(previous, images)); }, [images, tasks]);

  const duplicateSelected = useCallback(() => {
    const items = copyCanvasSelection(imageRef.current, selectedRef.current);
    if (items.length) pasteCopiedItems(undefined, items);
  }, [pasteCopiedItems]);
  const prepareFlowCopyDrag = useCallback((ids: string[]) => {
    const items = copyCanvasSelection(imageRef.current, ids, { preserveSelectedInputs: true });
    if (!items.length) return null;
    return { ids: items.map(item => item.id), commit: (offset: { x: number; y: number }) => {
      const created = pasteCanvasSelection(items, offset.x, offset.y, { preserveSelectedInputs: true, existing: imageRef.current });
      remember(imageRef.current);
      const next = [...imageRef.current, ...created];
      const selected = created.map(item => item.fusion ? `${item.id}:fusion` : item.id);
      imageRef.current = next; selectedRef.current = selected;
      setImages(next); setSelectedIds(selected);
    } };
  }, [remember]);

  async function copySelectedFromMenu() {
    const items = copyCanvasSelection(imageRef.current, selectedRef.current);
    if (!items.length) return;
    const clipboard = createCanvasClipboard(items);
    canvasClipboard.current = clipboard;
    closeCanvasMenu();
    try {
      await writeCanvasClipboardSystem(clipboard, items.map(item => item.name).join('\n'));
    } catch {
      announce(locale === 'zh-CN' ? '已复制，可右键画布选择「粘贴」' : locale === 'ja' ? 'コピーしました。キャンバスを右クリックして貼り付けできます' : 'Copied. Right-click the canvas to paste.');
    }
  }

  useEffect(() => {
    const blocked = (event: ClipboardEvent) => page !== 'canvas' || isField(event.target) || isField(document.activeElement)
      || !!(modal || referenceTarget || mainTarget || canvasReference || menu || previewImage || cutoutImage || drawingImage)
      || !!document.querySelector('dialog[open], [popover]:popover-open:not([data-canvas-context-menu])');
    const copy = (event: ClipboardEvent) => {
      if (canvasMenu || blocked(event) || !event.clipboardData || window.getSelection()?.toString()) return;
      const items = copyCanvasSelection(imageRef.current, selectedRef.current);
      if (!items.length) return;
      const clipboard = createCanvasClipboard(items);
      writeCanvasClipboardEvent(event.clipboardData, clipboard, items.map(item => item.fusion ? item.fusion.prompt : item.name).join('\n'));
      canvasClipboard.current = clipboard;
      event.preventDefault();
    };
    const paste = (event: ClipboardEvent) => {
      const clipboard = canvasClipboard.current;
      if (blocked(event) || !clipboard || !event.clipboardData || !canvas.current) return;
      if (!matchesCanvasClipboard(event.clipboardData, clipboard)) return;
      event.preventDefault();
      pasteCopiedItems(canvasMenu && !canvasMenu.kind ? { x: canvasMenu.worldX, y: canvasMenu.worldY } : canvasPastePoint());
      closeCanvasMenu();
    };
    window.addEventListener('copy', copy);
    window.addEventListener('paste', paste);
    return () => { window.removeEventListener('copy', copy); window.removeEventListener('paste', paste); };
  }, [page, modal, referenceTarget, mainTarget, canvasReference, menu, previewImage, cutoutImage, drawingImage, canvasMenu, closeCanvasMenu, pasteCopiedItems, canvasPastePoint]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (page !== 'canvas') return;
      // Preserve typing and keyboard activation; mouse-focused controls still allow canvas shortcuts.
      if (event.isComposing || isField(event.target)) return;
      if (canvasMenu) { if (event.key === 'Escape') { event.preventDefault(); closeCanvasMenu(); } return; }
      if (event.code === 'Space' && document.documentElement.dataset.focusNavigation === 'keyboard' && event.target instanceof Element && event.target.closest('button, [role="button"]')) return;
      if (event.key === 'Alt' || event.key === 'Escape') { setSnapGuide(null); }
      if (canvasReference) { if (event.key === 'Escape') { setCanvasReference(null); setSpaceDown(false); } else if (event.code === 'Space') { event.preventDefault(); setSpaceDown(true); } return; }
      if (event.key === 'Escape') { if (previewImage) {setPreviewImage(null); return;} if (modal || referenceTarget || document.querySelector('dialog[open]')) return; setSelectedIds([]); setMenu(null); setSpaceDown(false); return; }
      if (isField(event.target) || (event.target instanceof Element && event.target.closest('.fusion-node')) || modal || referenceTarget || menu || previewImage || drawingImage || document.querySelector('dialog[open]')) return;
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'd' && !mainTarget && !cutoutImage && !document.querySelector('[popover]:popover-open')) { event.preventDefault(); duplicateSelected(); }
      if (event.code === 'Space' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); setSpaceDown(true); }
      if (event.key.toLowerCase() === 'v' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); setCanvasMode('select'); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); setSelectedIds(canvasNodes(imageRef.current).map(n => n.id)); }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected(); }
      if (event.key === '0') { event.preventDefault(); fit(); }
    };
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') setSpaceDown(false); };
    const blur = () => { setSpaceDown(false); setDragging(false); setSelecting(false); setSnapGuide(null); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [page, modal, referenceTarget, mainTarget, cutoutImage, drawingImage, canvasReference, menu, previewImage, canvasMenu, closeCanvasMenu, fit, undo, redo, removeSelected, duplicateSelected]);

  function selectReferenceImage(event: ReactPointerEvent, id: string) {
    if (canvasReference && !spaceDown && canvasMode !== 'hand' && event.button === 0 && !(event.target instanceof Element && event.target.closest('[data-overlay]'))) {
      event.preventDefault(); event.stopPropagation(); toggleCanvasReference(id);
    }
  }

  function addImages(items: PendingImage[], point?: { x: number; y: number } | null) {
    const item = items[0];
    if (!item) return;
    const rect = canvas.current!.getBoundingClientRect();
    const v = viewRef.current;
    const created: CanvasImage = { ...item, fusion: item.operation === 'fusion' || item.operation === 'lingerie' || item.operation === 'directed' || item.operation === 'flat' ? newFusionSettings(item.operation) : undefined, role: 'main', x: point?.x ?? (rect.width / 2 - v.x) / v.zoom - item.width / 2, y: point?.y ?? (rect.height / 2 - v.y) / v.zoom - item.height / 2 };
    const previous = imageRef.current;
    const next = [...previous.filter(n => n.role !== 'main' || n.nodeOnly), created];
    remember(previous);
    imageRef.current = created.fusion ? centerAddedFusionBranches(previous, next) : next;
    setImages(imageRef.current); setSelectedIds([created.id]);
    if (created.operation === 'cutout') setCutoutImage(created);
    if (created.fusion) revealFusion(imageRef.current.find(item => item.id === created.id)!);
    else announce(t.mainImageReady);
  }
  function addBatchImages(items: PendingImage[], point?: { x: number; y: number } | null) {
    if (!items.length || items.length > 20) return;
    const rect = canvas.current!.getBoundingClientRect();
    const previous = imageRef.current;
    const startX = point?.x ?? (previous.length ? Math.max(...canvasNodes(previous).map(item => item.x + item.width)) + GROUP_GAP : 0);
    const created = arrangeImages(items.map(item => ({ ...item, role: undefined, operation: undefined, x: 0, y: 0 })), startX, rect, { independentGap: 40, independentColumns: 5 })
      .map(item => ({ ...item, y: item.y + (point?.y ?? 0) }));
    const next = [...previous, ...created];
    remember(previous); setImages(next); setSelectedIds(created.map(n => n.id));
    if (!point) setView(fitImages(canvasNodes(next), rect.width, rect.height));
    announce(t.ready);
  }
  function arrange() {
    const rect = canvas.current!.getBoundingClientRect();
    const next = arrangeImages(imageRef.current, 0, rect, { zoom: viewRef.current.zoom });
    if (!next.length) return;
    remember(imageRef.current); setImages(next);
    setView(fitImages(canvasNodes(next), rect.width, rect.height));
  }
  async function downloadSelected() {
    const items = imageRef.current.filter(n => !n.nodeOnly && !n.generation && selectedRef.current.includes(n.id));
    try {
      for (const item of items) {
        const response = await fetch(item.url); if (!response.ok) throw new Error('download');
        const blob = await response.blob(); const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = /\.[a-z0-9]+$/i.test(item.name) ? item.name : `${item.name}.png`; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch { announce(t.downloadError); }
  }
  function removeSelectedBackgrounds() {
    const current = imageRef.current;
    const sources = current.filter(image => !image.nodeOnly && !image.generation && selectedRef.current.includes(image.id));
    if (!sources.length) return;
    // Background removal remains an immediate local interaction fixture.
    const sample = workflowExampleResult('flat');
    const outputs = createImageResults(current, sources.map(source => ({
      sourceId: source.id, sourceUrl: source.url,
      url: sample.url, width: sample.width, height: sample.height,
      name: `${source.name} · 去底结果 · 演示`,
    })));
    const results = fileNamer.assign(outputs, 'removeBackground', t.removeBackground, current);
    if (!results.length) return;
    remember(current);
    const independent = standaloneTaskInputs(current);
    const taskId = crypto.randomUUID();
    const owned = new Set(sources.filter(source => independent.has(source.id)).map(source => source.id));
    imageRef.current = centerAddedFusionBranches(current, [...current.map(item => owned.has(item.id) ? { ...item, layoutTaskId: taskId } : item), ...results]);
    selectedRef.current = results.map(result => result.id);
    setImages(imageRef.current);
    setSelectedIds(selectedRef.current);
    if (canvas.current && window.location.hash !== '#/ai-try-on') {
      const focusIds = new Set([...sources.map(source => source.id), ...results.map(result => result.id)]);
      setView(fitImages(imageRef.current.filter(item => focusIds.has(item.id)), canvas.current.clientWidth, canvas.current.clientHeight));
      canvas.current.focus({ preventScroll: true });
    }
  }
  function openUpload(point: { x: number; y: number } | null = null) {
    uploadEpoch.current++; uploadPoint.current = point;
    setReading(false); setMenu(null); setModal('upload');
  }
  function rememberUpload(image: LibraryImage) { ownedUrls.current.add(image.url); setUploads(previous => [image, ...previous]); }
  async function loadFiles(files: FileList | File[]) {
    if (!files.length || reading) return;
    if (files.length > 20) { announce(t.batchImageLimit); return; }
    const epoch = ++uploadEpoch.current;
    setReading(true);
    const results = await Promise.allSettled(Array.from(files).map(readImage));
    const successful = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
    if (epoch !== uploadEpoch.current) { successful.forEach(n => URL.revokeObjectURL(n.url)); return; }
    successful.forEach(rememberUpload);
    const failed = results.some(r => r.status === 'rejected');
    setReading(false);
    if (successful.length) addBatchImages(successful);
    if (failed) announce(t.uploadError);

  }
  function openTool(id: Tool) {
    uploadPoint.current = null;
    if (id === 'fusion' || id === 'directed' || id === 'lingerie' || id === 'flat') { void openWorkflowExample(id); return; }
    uploadEpoch.current++; setReading(false); setMenu(null); setModal(id);
  }
  async function openWorkflowExample(kind: Exclude<WorkflowKind, 'merge' | 'batch'>) {
    if (reading || imageRef.current.length) return;
    const epoch = ++uploadEpoch.current;
    setReading(true); setMenu(null);
    const cancel = () => {
      if (epoch === uploadEpoch.current) { uploadEpoch.current++; setReading(false); }
    };
    window.addEventListener('hashchange', cancel, { once: true });
    try {
      const example = await createWorkflowExample(kind);
      if (epoch !== uploadEpoch.current || imageRef.current.length || window.location.hash === '#/ai-try-on' || !canvas.current) return;
      const rect = canvas.current.getBoundingClientRect();
      const namedResults = fileNamer.assign(example.filter(item => !!item.generatedByEditorId), kind, workflowFilenameTitle(kind), imageRef.current);
      const resultsById = new Map(namedResults.map(result => [result.id, result]));
      const next = arrangeImages(example.map(item => resultsById.get(item.id) ?? item), 0, rect);
      remember(imageRef.current);
      imageRef.current = next; selectedRef.current = [];
      setImages(next); setSelectedIds([]);
      setView(fitImages(canvasNodes(next), rect.width, rect.height));
      announce(locale === 'zh-CN' ? '已载入功能示例，可修改节点配置继续体验' : locale === 'ja' ? '機能サンプルを表示しました。設定を変更してお試しください' : 'Example loaded. Edit the node settings to explore.');
    } catch {
      if (epoch === uploadEpoch.current) announce(locale === 'zh-CN' ? '示例图片加载失败，请重试' : locale === 'ja' ? 'サンプル画像を読み込めませんでした。再試行してください' : 'Could not load example images. Please try again.');
    } finally {
      window.removeEventListener('hashchange', cancel);
      if (epoch === uploadEpoch.current) setReading(false);
    }
  }
  function revealFusion(image: CanvasImage) {
    const r = canvas.current!.getBoundingClientRect();
    const current = viewRef.current;
    const bounds = boundsOf(canvasNodes([image]))!;
    const area = canvasSafeArea(r.width, r.height);
    if (bounds.x * current.zoom + current.x < area.x || (bounds.x + bounds.width) * current.zoom + current.x > area.x + area.width || bounds.y * current.zoom + current.y < area.y || (bounds.y + bounds.height) * current.zoom + current.y > area.y + area.height) {
      setView(fitImages(canvasNodes([image]), r.width, r.height));
    }
  }
  function openFusion(kind: WorkflowKind = 'fusion') {
    if (kind === 'flat' && imageRef.current.filter(n => !n.nodeOnly && !n.generation && selectedRef.current.includes(n.id)).length > 1) { openMerge(true); return; }
    const image = imageRef.current.find(n => !n.nodeOnly && !n.generation && selectedRef.current.includes(n.id));
    if (!image) return;
    const current = imageRef.current;
    const next = createFusionEditor(current, image.id, crypto.randomUUID(), kind);
    if (!next) return;
    remember(current);
    imageRef.current = centerAddedFusionBranches(current, [...current, next]);
    setImages(imageRef.current);
    setSelectedIds([image.id]); revealFusion({...image, fusion: imageRef.current.find(item => item.id === next.id)!.fusion});
  }
  function regenerateResult(resultId: string) {
    const current = imageRef.current;
    const result = current.find(image => image.id === resultId && !image.generation);
    const editor = current.find(image => image.id === result?.generatedByEditorId && image.fusion);
    if (!editor?.fusion || (isMultiInputWorkflow(editor.fusion) ? !workflowInputs(editor.fusion).length : !workflowSources(current, editor).length)) { announce(t.resultEditorUnavailable); return; }
    const settings = editor.fusion;
    if (((settings.kind ?? 'fusion') === 'fusion' || settings.kind === 'merge' || settings.kind === 'batch') && !settings.prompt.trim() || (settings.kind === 'directed' && !settings.directedPoints?.length)) {
      announce(t.resultConfigRequired); return;
    }
    generateDemo(editor.id, result?.generatedFromReferenceId);
  }
  function focusImageTask(task: CanvasTask) {
    const element = canvas.current;
    const results = canvasImageTaskResults(imageRef.current, task);
    if (currentPage() !== 'canvas' || !element || task.status !== 'completed' || !results.length) return;
    selectedRef.current = results.map(result => result.id);
    setSelectedIds(selectedRef.current);
    animateView(fitImages(results, element.clientWidth, element.clientHeight));
    element.focus({ preventScroll: true });
  }
  function workflowFilenameTitle(kind: WorkflowKind) {
    return kind === 'batch' ? t.batchEdit : kind === 'merge' ? t.mergeImages : kind === 'directed' ? t.directed
      : kind === 'lingerie' ? t.lingerie : kind === 'flat' ? t.flat : t.fusion;
  }
  function startImageTask(editor: CanvasImage, outputs: CanvasImage[], fitResults = false) {
    if (!outputs.length) return;
    const previous = imageRef.current;
    const kind = editor.fusion?.kind ?? 'fusion';
    const results = fileNamer.assign(outputs, kind, workflowFilenameTitle(kind), previous);
    const id = crypto.randomUUID();
    const record: CanvasImageTaskRecord = { editorId: editor.id, status: 'running', timer: null, results };
    imageTasks.current.set(id, record);
    const slots = results.map(result => ({ ...result, url: '', generatedTaskId: id,
      generation: { taskId: id, status: 'running' as const } }));
    remember(previous);
    imageRef.current = centerAddedFusionBranches(previous, withCanvasOriginOrder([...previous, ...slots], previous));
    selectedRef.current = slots.map(result => result.id);
    setImages(imageRef.current); setSelectedIds(selectedRef.current);
    setTasks(previousTasks => [{ id, status: 'running', createdAt: new Date().toISOString(), resultIds: results.map(result => result.id), resultFiles: results.map(result => ({ id: result.id, name: result.name })) }, ...previousTasks]);
    if (fitResults && canvas.current) {
      const focusIds = new Set([editor.id, ...slots.map(slot => slot.id)]);
      animateView(fitImages(canvasNodes(imageRef.current.filter(item => focusIds.has(item.id))), canvas.current.clientWidth, canvas.current.clientHeight));
    }
    canvas.current?.focus({ preventScroll: true });
    record.timer = window.setTimeout(() => {
      if (record.status !== 'running') return;
      record.timer = null;
      const current = imageRef.current;
      const remaining = current.filter(image => image.generation?.taskId === id);
      const editorExists = current.some(image => image.id === editor.id && image.fusion);
      record.status = editorExists && remaining.length ? 'completed' : 'failed';
      if (record.status === 'completed') record.results = withProjectCoverOrder(record.results, current);
      setImages(items => items);
      const thumbnailUrl = record.status === 'completed'
        ? results.find(result => remaining.some(image => image.id === result.id))?.url : undefined;
      setTasks(previousTasks => previousTasks.map(task => task.id === id ? { ...task, status: record.status, thumbnailUrl } : task));
    }, 3000);
  }
  function generateDemo(editorId: string, referenceId?: string) {
    const current = imageRef.current;
    const editor = current.find(item => item.id === editorId && item.fusion);
    if (!editor) return;
    if (workflowSources(current, editor).some(source => source.generation)) return;
    if (editor.fusion?.batchFlat || editor.fusion?.kind === 'batch') { generateBatchResults(editor, referenceId); return; }
    if (editor.fusion?.kind === 'directed' && !editor.fusion.directedPoints?.length) return;
    if ((editor.fusion?.kind ?? 'fusion') === 'fusion' && !editor.fusion?.prompt.trim()) return;
    if (editor.fusion?.kind === 'merge') {
      if (!fusionReferences(editor.fusion).length || !editor.fusion.prompt.trim()) return;
    } else if (!workflowSources(current, editor).length) return;
    const position = fusionPosition(editor);
    const sample = workflowExampleResult(editor.fusion?.kind ?? 'fusion');
    const x = position.x + workflowWidth(editor.fusion) + FUSION_GAP;
    const y = position.y + (workflowHeight(editor.fusion) - sample.height) / 2;
    const result: CanvasImage = {id: crypto.randomUUID(), ...sample, x, y, generatedByEditorId: editorId};
    startImageTask(editor, [result]);
  }

  function generateBatchResults(editor: CanvasImage, referenceId?: string) {
    const batch = editor.fusion?.kind === 'batch';
    if (batch && !editor.fusion?.prompt.trim()) return;
    const references = workflowInputs(editor.fusion).filter(ref => !referenceId || ref.id === referenceId);
    if (!references.length) { announce(t.resultEditorUnavailable); return; }
    const sample = workflowExampleResult(batch ? 'batch' : 'flat');
    const position = fusionPosition(editor), x = position.x + workflowWidth(editor.fusion) + FUSION_GAP;
    const results: CanvasImage[] = [];
    const resultsHeight = references.length * sample.height + (references.length - 1) * 120;
    let y = position.y + (workflowHeight(editor.fusion) - resultsHeight) / 2;
    for (const reference of references) {
      const result: CanvasImage = { ...sample, id: crypto.randomUUID(), x, y,
        name: `${reference.name} · ${batch ? t.batchEdit : t.flat} · ${locale === 'en' ? 'Demo' : locale === 'ja' ? 'デモ' : '演示'}`,
        generatedByEditorId: editor.id, generatedFromReferenceId: reference.id };
      results.push(result); y += sample.height + 120;
    }
    startImageTask(editor, results, true);
  }

  function updateFusion(id: string, patch: Partial<FusionSettings>) {
    if ('mainImages' in patch || 'references' in patch || 'directedPoints' in patch || 'drawingGuide' in patch || imageRef.current.find(n => n.id === id)?.fusion?.kind === 'flat') remember(imageRef.current);
    const current = imageRef.current;
    const owner = current.find(item => item.id === id);
    if (owner?.fusion) rememberGenerationSettingsChange(owner.fusion, patch);
    const batch = owner?.fusion?.kind === 'batch';
    const multiInputs = isMultiInputWorkflow(owner?.fusion) && (batch ? 'mainImages' in patch : 'references' in patch);
    const independent = multiInputs ? standaloneTaskInputs(imageRef.current) : new Set<string>();
    const nextInputs = new Set(((batch ? patch.mainImages : patch.references) ?? []).flatMap(ref => ref.sourceImageId ? [ref.sourceImageId] : []));
    imageRef.current = current.map(item => {
      if (item.id === id && item.fusion) {
        const fusion = { ...item.fusion, ...patch };
        const height = workflowHeight(fusion);
        const heightChange = height - workflowHeight(item.fusion);
        if (heightChange && !patch.position) {
          // Grow around the existing center, preserving any manual placement.
          const previous = fusionPosition(item);
          const position = { ...previous, y: previous.y - heightChange / 2 };
          return { ...item, ...(item.nodeOnly ? { ...position, height } : {}), fusion: { ...fusion, position } };
        }
        return { ...item, fusion };
      }
      if (multiInputs && nextInputs.has(item.id) && independent.has(item.id)) return { ...item, layoutTaskId: id };
      if (multiInputs && item.layoutTaskId === id && !nextInputs.has(item.id)) return { ...item, layoutTaskId: undefined };
      return item;
    });
    if (multiInputs && owner) {
      const previousSources = new Set(workflowSources(current, owner).map(source => source.id));
      const updated = imageRef.current.find(item => item.id === id)!;
      if (workflowSources(imageRef.current, updated).some(source => !previousSources.has(source.id))) {
        imageRef.current = centerAddedFusionBranches(current, imageRef.current);
      }
    }
    setImages(imageRef.current);
  }
  function openMerge(batchFlat = false) {
    const current = imageRef.current;
    const inputs = current.filter(image => !image.nodeOnly && !image.generation && selectedRef.current.includes(image.id));
    if (inputs.length > (batchFlat ? 20 : MAX_FUSION_REFERENCES)) { announce(batchFlat ? batchFlatLimitMessage() : t.referenceLimit); return; }
    const editor = createMergeEditor(current, selectedRef.current, crypto.randomUUID(), batchFlat);
    if (!editor) return;
    remember(current);
    const independent = standaloneTaskInputs(current);
    const owned = new Set(inputs.filter(input => independent.has(input.id)).map(input => input.id));
    imageRef.current = centerAddedFusionBranches(current, [...current.map(item => owned.has(item.id) ? { ...item, layoutTaskId: editor.id } : item), editor]); selectedRef.current = [`${editor.id}:fusion`];
    setImages(imageRef.current); setSelectedIds(selectedRef.current);
    const rect = canvas.current?.getBoundingClientRect();
    if (rect) {
      const focusIds = new Set([...inputs.map(input => input.id), editor.id]);
      setView(fitImages(canvasNodes(imageRef.current.filter(item => focusIds.has(item.id))), rect.width, rect.height));
    }
  }
  function openBatchEdit() {
    const current = imageRef.current;
    const inputs = current.filter(image => !image.nodeOnly && !image.generation && selectedRef.current.includes(image.id));
    if (inputs.length > MAX_BATCH_MAIN_IMAGES) { announce(batchFlatLimitMessage()); return; }
    const editor = createBatchEditor(current, selectedRef.current, crypto.randomUUID());
    if (!editor) return;
    remember(current);
    const independent = standaloneTaskInputs(current);
    const owned = new Set(inputs.filter(input => independent.has(input.id)).map(input => input.id));
    imageRef.current = centerAddedFusionBranches(current, [...current.map(item => owned.has(item.id) ? { ...item, layoutTaskId: editor.id } : item), editor]);
    selectedRef.current = [`${editor.id}:fusion`];
    setImages(imageRef.current); setSelectedIds(selectedRef.current);
    const rect = canvas.current?.getBoundingClientRect();
    if (rect) {
      const focusIds = new Set([...inputs.map(input => input.id), editor.id]);
      setView(fitImages(canvasNodes(imageRef.current.filter(item => focusIds.has(item.id))), rect.width, rect.height));
    }
  }
  function openImagePicker(target: string, source: 'upload' | 'canvas', role?: 'main') {
    if (source === 'upload') setReferenceTarget({ target, role });
    else { setCanvasMode('select'); setCanvasReference({ target, role, ids: [] }); }
  }
  function addWorkflowMainImages(target: string, additions: PendingImage[]) {
    const current = imageRef.current;
    const owner = current.find(item => item.id === target && (item.fusion?.kind === 'batch' || (item.fusion?.kind === 'flat' && item.fusion.batchFlat)));
    if (!owner?.fusion) return;
    const existing = workflowInputs(owner.fusion);
    const ids = new Set(existing.flatMap(item => item.sourceImageId ? [item.sourceImageId] : []));
    const incoming = additions.filter(item => {
      if (item.generation || current.some(image => image.id === item.id && image.generation)) return false;
      if (ids.has(item.id)) return false;
      ids.add(item.id); return true;
    });
    if (!incoming.length) return;
    if (existing.length + incoming.length > MAX_BATCH_MAIN_IMAGES) { announce(batchFlatLimitMessage()); return; }
    if (incoming.some(item => isWorkflowDescendant(current, target, item.id))) { reportMergeCycle(); return; }
    const occupied = canvasNodes(current);
    const position = fusionPosition(owner);
    const created: CanvasImage[] = [];
    const references = incoming.map(item => {
      const source = current.find(image => image.id === item.id && !image.nodeOnly);
      if (source) return { id: source.id, sourceImageId: source.id, name: source.name, url: source.url };
      const x = position.x - item.width - 80;
      let y = position.y + (workflowHeight(owner.fusion) - item.height) / 2;
      let collisions;
      while ((collisions = occupied.filter(node => x < node.x + node.width + 16 && x + item.width + 16 > node.x && y < node.y + node.height + 16 && y + item.height + 16 > node.y)).length) {
        y = Math.max(...collisions.map(node => node.y + node.height)) + 40;
      }
      const added: CanvasImage = { id: crypto.randomUUID(), name: item.name, url: item.url, width: item.width, height: item.height, x, y, layoutTaskId: target };
      created.push(added); occupied.push(added);
      return { id: added.id, sourceImageId: added.id, name: added.name, url: added.url };
    });
    const independent = standaloneTaskInputs(current);
    const adopted = new Set(references.filter(ref => independent.has(ref.sourceImageId)).map(ref => ref.sourceImageId));
    const fusion: FusionSettings = { ...owner.fusion, ...(owner.fusion.kind === 'batch'
      ? { mainImages: [...existing, ...references] }
      : { references: [...existing, ...references], reference: undefined }) };
    const height = workflowHeight(fusion);
    const nextPosition = { ...position, y: position.y - (height - workflowHeight(owner.fusion)) / 2 };
    remember(current);
    imageRef.current = centerAddedFusionBranches(current, [...current.map(item => item.id === target
      ? { ...item, ...(item.nodeOnly ? { ...nextPosition, height } : {}), fusion: { ...fusion, position: nextPosition } }
      : adopted.has(item.id) ? { ...item, layoutTaskId: target } : item), ...created]);
    setImages(imageRef.current);
  }
  function reportMergeCycle() {
    announce(locale === 'en' ? 'Choose an image outside this node’s downstream results.' : locale === 'ja' ? 'このノードの生成結果以外の画像を選択してください。' : '不能将此节点及其后续步骤的结果用作输入，请选择其他图片。');
  }
  function batchFlatLimitMessage() { return locale === 'en' ? 'Add up to 20 main images.' : locale === 'ja' ? 'メイン画像は最大20枚です。' : '主图最多20张，请减少选择后重试。'; }
  function referenceLimitMessage(target: string, role?: 'main') {
    if (role === 'main') return batchFlatLimitMessage();
    if (imageRef.current.find(n => n.id === target)?.fusion?.batchFlat) return batchFlatLimitMessage();
    return imageRef.current.find(n => n.id === target)?.fusion?.kind === 'lingerie' ? t.modelImageLimit : t.referenceLimit;
  }
  function addReferences(target: string, additions: FusionReference[]) {
    const owner = imageRef.current.find(n => n.id === target);
    if (!owner?.fusion) return;
    additions = additions.filter(reference => !imageRef.current.some(image => image.id === reference.id && image.generation));
    if (!additions.length) return;
    const merge = isMultiInputWorkflow(owner.fusion) && owner.fusion.kind !== 'batch';
    if (merge && additions.some(item => isWorkflowDescendant(imageRef.current, target, item.id))) { reportMergeCycle(); return; }
    const incoming = additions.map(item => ({ id: item.id, name: item.name, url: item.url,
      sourceImageId: merge && imageRef.current.some(image => !image.nodeOnly && image.id === item.id && image.url === item.url) ? item.id : undefined }));
    const references = [...new Map([...fusionReferences(owner.fusion), ...incoming].map(item => [merge ? item.id : item.url, item])).values()];
    if (references.length > workflowReferenceLimit(owner.fusion)) { announce(referenceLimitMessage(target)); return; }
    updateFusion(target, { references, reference: undefined });
  }
  function toggleCanvasReference(id: string) {
    if (!canvasReference) return;
    const candidate = images.find(n => n.id === id);
    const settings = images.find(n => n.id === canvasReference.target)?.fusion;
    const merge = canvasReference.role === 'main' || (isMultiInputWorkflow(settings) && settings?.kind !== 'batch');
    const existing = pickerImages(settings, canvasReference.role);
    if (!candidate || candidate.nodeOnly || candidate.generation || existing.some(n => merge ? n.sourceImageId === candidate.id : n.url === candidate.url)) return;
    const picked = canvasReference.ids.includes(id);
    if (!picked && canvasReferenceCount >= pickerLimit(settings, canvasReference.role)) { announce(referenceLimitMessage(canvasReference.target, canvasReference.role)); return; }
    if (!picked && merge && isWorkflowDescendant(images, canvasReference.target, id)) { reportMergeCycle(); return; }
    if (!merge && !picked && canvasReference.ids.some(other => images.find(n => n.id === other)?.url === candidate.url)) return;
    setCanvasReference({ ...canvasReference, ids: picked ? canvasReference.ids.filter(n => n !== id) : [...canvasReference.ids, id] });
  }
  function changeZoom(factor: number, animated = false) { const r = canvas.current!.getBoundingClientRect(); if (animated) animateView(zoomAt(viewRef.current, factor, r.width / 2, r.height / 2)); else setView(v => zoomAt(v, factor, r.width / 2, r.height / 2)); }

  return <PromptLibraryProvider uploads={uploads} onUpload={rememberUpload} locale={locale}><div className="app-shell" data-library="Lightchain SaaS v5.1 libraries Beta" data-node-id="12:3127">
    <header className="topbar flex items-center justify-between gap-2 px-6" data-node-id="12:3148">
      <div className="flex items-center gap-6 min-w-0">
        <div className="brand flex items-center gap-2 shrink-0" aria-label="Lightchain">
          <img src={assets.imgContainerLightchainLogo01} alt="" width="24" height="24" />
          <Icon name="imgContainerLightchainLogo02" size={113} className="wordmark" />
        </div>
        {page !== 'canvas' && <a className="demo-page-link canvas-return-link" href="#/canvas" aria-label={t.workspace}><Icon name="imgIcon1" size={16} /><span>{t.workspace}</span></a>}
        <a className="demo-page-link video-workspace-link" href="#/video-workspace" aria-current={page === 'video' ? 'page' : undefined}>{locale === 'en' ? 'Video workspace' : locale === 'ja' ? '動画ワークスペース' : '视频工作台'}</a>
        <a className="demo-page-link design-workspace-link" href="#/design-workspace" aria-current={page === 'design' ? 'page' : undefined}>{locale === 'en' ? 'Design workspace' : locale === 'ja' ? 'デザインワークスペース' : '设计生产工作台'}</a>
        <div className="flex items-center gap-2">
        <div className="relative" data-menu>
          <button className="language-trigger flex items-center gap-2 h-8 px-2 rounded-lg" aria-label={t.language} aria-expanded={menu === 'language'} onClick={() => setMenu(menu === 'language' ? null : 'language')}>
            <Icon name="imgIconSystem" /><span className="language-label">{locales.find(l => l.value === locale)?.label}</span><Icon name="imgChevron" size={16} />
          </button>
          {shownMenu.value === 'language' && <div className="popover language-menu" data-phase={shownMenu.phase} inert={shownMenu.phase === 'exit'} aria-label={t.language}>
            {locales.map(l => <button key={l.value} className="menu-option" aria-pressed={locale === l.value} onClick={() => { setLocale(l.value); setMenu(null); }}>{l.label}<Icon name="check" size={16} className={locale === l.value ? 'option-check is-selected' : 'option-check'} /></button>)}
          </div>}
        </div>
        <Button
          className="theme-toggle !w-8 !p-0"
          aria-label={resolvedTheme === 'dark' ? t.switchLight : t.switchDark}
          title={resolvedTheme === 'dark' ? t.switchLight : t.switchDark}
          onClick={() => { setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'); setMenu(null); }}
        >
          <Icon name={resolvedTheme === 'dark' ? 'themeMoon' : 'themeSun'} size={18} />
        </Button>
        </div>
      </div>
      <div className="topbar-actions flex items-center gap-4 shrink-0">
        <Button icon="imgIconSystem1" className="help-button" onClick={() => setModal('help')} title={t.help}><span className="header-action-label">{t.help}</span></Button>
        <Button icon="imgIconSystem2" className="support-button" onClick={() => setModal('support')} title={t.support}><span className="header-action-label">{t.support}</span></Button>
        <button className="purchase-button" onClick={() => setModal('credits')} data-node-id="35:6267">
          <span>{t.credits}</span><Divider vertical /><span className="purchase-cost"><Icon name="imgIconSystem3" size={16} /><span className="purchase-balance">99999</span></span>
        </button>
        <span className="avatar"><img src={assets.imgImageFill} alt="" width="32" height="32" /></span>
      </div>
    </header>

    <main hidden={page !== 'canvas'} inert={page !== 'canvas'} ref={canvas} tabIndex={-1} className={`canvas ${spaceDown || canvasMode === 'hand' ? 'is-panning' : ''} ${dragging ? 'is-dragging' : ''}`} aria-label={t.canvas}
      onDoubleClick={e => {
        if (canvasReference || !(e.target instanceof Element) || e.target.closest('[data-overlay], [data-image], .fusion-position, .selection-overlay')) return;
        e.preventDefault(); closeCanvasMenu();
        const rect = e.currentTarget.getBoundingClientRect();
        animateView(zoomAt(viewRef.current, 1.25, e.clientX - rect.left, e.clientY - rect.top));
      }}
      onContextMenu={e => {
        if (canvasReference || !(e.target instanceof Element) || e.target.closest('[data-overlay], [data-image], .fusion-position, .selection-overlay')) return;
        e.preventDefault();
        setDragging(false); setSelecting(false); setSnapGuide(null);
        const rect = e.currentTarget.getBoundingClientRect(), v = viewRef.current;
        document.dispatchEvent(new CustomEvent('lc-select-open', { detail: 'canvas-context' }));
        setCanvasMenu({ x: e.clientX, y: e.clientY, worldX: (e.clientX - rect.left - v.x) / v.zoom, worldY: (e.clientY - rect.top - v.y) / v.zoom });
      }}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropActive(true); } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(false); }}
      onDrop={e => { e.preventDefault(); setDropActive(false); void loadFiles(e.dataTransfer.files); }}>

      <CanvasBackground view={view} />
      <CanvasProjectPanel title={t.workspace} projectLabel={t.project} nameLabel={t.projectName} projectName={projectName}
        onProjectNameChange={setProjectName} onBack={() => setModal('project')} backLabel={t.back} renameLabel={t.rename} nodeId="12:3128"
        icon={<><img src={assets.img} alt="" width="20" height="20" /><img className="workspace-artwork" src={assets.imgIcon} alt="" width="20" height="20" /></>} />

      {images.length === 0 && <section className="empty-state flex flex-col items-center gap-8" data-overlay data-node-id="14:3674">
        <p className="empty-intro font-medium text-base leading-6 text-muted text-center">{t.intro}</p>
        <div className="tool-grid flex items-center gap-4" data-node-id="14:3688">
          {tools.map(tool => <Button key={tool.id} variant="outline" size="l" icon={tool.icon} className="entry-tool" disabled={reading} onClick={() => openTool(tool.id)} data-node-id={tool.nodeId}>
            {t[tool.id]}
            {tool.id === 'lingerie' && <span className="entry-tool-badge" data-node-id="136:18786">NEW</span>}
          </Button>)}
        </div>
        <button type="button" className={`asset-upload empty-upload ${initialDropActive ? 'is-over' : ''}`} data-node-id="62:27018"
          aria-label={t.addImagesPrompt} disabled={reading} onClick={() => openUpload()}
          onDragOver={event => { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer.types.includes('Files')) { setDropActive(false); setInitialDropActive(true); } }}
          onDragLeave={event => { event.stopPropagation(); if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInitialDropActive(false); }}
          onDrop={event => { event.preventDefault(); event.stopPropagation(); setInitialDropActive(false); setDropActive(false); void loadFiles(event.dataTransfer.files); }}>
          <Icon name="upload" size={32} />
          <span className="asset-upload-title">{reading ? t.reading : initialDropActive ? t.dropImagesHere : t.addImagesPrompt}</span>
          <span className="asset-upload-hint">{initialDropActive && !reading ? t.releaseToUpload : t.initialUploadFormats}</span>
        </button>
      </section>}

      <ReactFlowCanvas view={view} selectedIds={selectedIds} hand={spaceDown || canvasMode === 'hand'} referenceMode={!!canvasReference}
        snap={snapToGrid} onView={setView} onSelection={selectFlowNodes} onPositions={moveFlowNodes}
        onPrepareCopyDrag={prepareFlowCopyDrag}
        onDragStart={startFlowDrag} onDragEnd={finishFlowDrag} onGuides={setSnapGuide} onSelecting={setSelecting}>
        {images.filter(result => !result.nodeOnly && !result.sourceImageId && result.generatedByEditorId).map(result => {
          const editor = images.find(item => item.id === result.generatedByEditorId && item.fusion);
          if (!editor) return null;
          return <ImageConnection zoom={view.zoom} key={`generation:${result.id}`} image={{...editor, ...fusionPosition(editor), id:`${editor.id}:fusion`, width:workflowWidth(editor.fusion), height:workflowHeight(editor.fusion)}} target={result} active={selectedIds.includes(result.id) || selectedIds.includes(`${editor.id}:fusion`) || workflowSources(images, editor).some(source => selectedIds.includes(source.id))} />;
        })}
        {images.filter(result => !result.nodeOnly && result.sourceImageId).map(result => {
          const source = images.find(item => !item.nodeOnly && item.id === result.sourceImageId);
          return source ? <ImageConnection zoom={view.zoom} key={`cutout:${result.id}`} image={source} target={result} active={selectedIds.includes(source.id) || selectedIds.includes(result.id)} /> : null;
        })}
        {images.filter(n => !n.nodeOnly).map(n => <div key={n.id} data-image data-canvas-id={n.id} className={`canvas-image ${(canvasReference ? canvasReference.ids.includes(n.id) : selectedIds.includes(n.id)) ? 'selected' : ''}`} style={{ left: n.x, top: n.y, width: n.width, height: n.height, opacity: canvasReference && n.generation ? .35 : undefined, zIndex: foregroundIds.has(n.id) ? 3 : raisedIds.has(n.id) ? 2 : undefined } as React.CSSProperties}
          tabIndex={canvasReference && n.generation ? -1 : 0} role="button" aria-label={`${t.image}: ${n.name}`} aria-disabled={!!canvasReference && !!n.generation} aria-pressed={canvasReference ? canvasReference.ids.includes(n.id) : selectedIds.includes(n.id)}
          onFocus={e => { if (document.documentElement.dataset.focusNavigation === 'keyboard' && !canvasReference && e.target === e.currentTarget && !selectedRef.current.includes(n.id)) setSelectedIds([n.id]); }} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || (e.key === ' ' && document.documentElement.dataset.focusNavigation === 'keyboard'))) { e.preventDefault(); if (canvasReference) { toggleCanvasReference(n.id); return; } setSelectedIds(e.shiftKey ? selectedIds.includes(n.id) ? selectedIds.filter(id => id !== n.id) : [...selectedIds, n.id] : [n.id]); } }}
          onPointerDown={e => selectReferenceImage(e, n.id)}
          onContextMenu={e => {
            e.preventDefault(); e.stopPropagation();
            if (canvasReference || n.generation || !canvas.current) return;
            const ids = selectedRef.current.includes(n.id)
              ? [...selectedRef.current]
              : [n.id];
            selectedRef.current = ids; setSelectedIds(ids);
            setDragging(false); setSelecting(false); setSnapGuide(null);
            const rect = canvas.current.getBoundingClientRect(), v = viewRef.current;
            document.dispatchEvent(new CustomEvent('lc-select-open', { detail: 'canvas-context' }));
            setCanvasMenu({ kind: 'image', imageId: n.id, x: e.clientX, y: e.clientY, worldX: (e.clientX - rect.left - v.x) / v.zoom, worldY: (e.clientY - rect.top - v.y) / v.zoom });
          }}>
          {!n.generation && <CanvasMediaFilename name={n.name} url={n.url} onRename={name => renameImage(n.id, name)} />}
          {n.projectCover && isProjectCoverCandidate(n) && <CanvasProjectCoverBadge locale={locale} />}
          <Button hidden={!!canvasReference || !!n.generation} variant="tonal" className="image-preview-button nodrag nopan" aria-label={`${t.viewFull} · ${n.name}`} title={t.viewFull} data-overlay onClick={event => { event.stopPropagation(); if (!n.generation) setPreviewImage(n); }}><Icon name="viewFull" size={20} /></Button>
          {n.generation ? <CanvasGenerationPlaceholder locale={locale} failed={n.generation.status === 'failed'} />
            : <ProgressiveImage src={n.url} alt={n.name} width={n.width} height={n.height} fit="contain" />}
        </div>)}
        {images.filter(n => n.fusion).map(n => {
          const sources = workflowSources(images, n), source = sources[0];
          const editorImage = source && !isMultiInputWorkflow(n.fusion) ? {...source, id: n.id, fusion: n.fusion, nodeOnly: false}
            : n.fusion?.kind === 'batch' ? { ...n, fusion: { ...n.fusion, mainImages: batchMainImages(n.fusion).map(main => {
              const current = sources.find(image => image.id === main.sourceImageId);
              return current ? { ...main, name: current.name, url: current.url } : main;
            }) } } : n;
          return <div key={`${n.id}:fusion`}>
          {sources.map(input => <ImageConnection key={input.id} zoom={view.zoom} image={input} target={{...fusionPosition(n),id:`${n.id}:fusion`,width:workflowWidth(n.fusion),height:workflowHeight(n.fusion)}} active={selectedIds.includes(input.id) || selectedIds.includes(`${n.id}:fusion`)} />)}
          <div className="fusion-position" data-workflow-kind={n.fusion?.kind} data-fusion-id={n.id} data-selected={selectedIds.includes(`${n.id}:fusion`)} tabIndex={0} role="group" aria-label={`${n.fusion?.kind === 'batch' ? t.batchEdit : n.fusion?.kind === 'directed' ? t.directed : n.fusion?.kind === 'lingerie' ? t.lingerie : n.fusion?.kind === 'flat' ? t.flat : n.fusion?.kind === 'merge' ? t.mergeImages : t.fusion} · ${n.name}`}
            style={{ left: fusionPosition(n).x, top: fusionPosition(n).y, width: workflowWidth(n.fusion), height: workflowHeight(n.fusion), zIndex: foregroundIds.has(`${n.id}:fusion`) ? 3 : raisedIds.has(n.id) ? 2 : undefined } as React.CSSProperties}
            onFocus={() => { if (document.documentElement.dataset.focusNavigation === 'keyboard' && !canvasReference && !selectedRef.current.includes(`${n.id}:fusion`)) setSelectedIds([`${n.id}:fusion`]); }}
            >
            {n.fusion?.kind === 'batch'
              ? <BatchEditNode image={editorImage} locale={locale} onChange={patch => updateFusion(n.id, patch)} onMainImages={source => openImagePicker(n.id, source, 'main')} onReference={source => openImagePicker(n.id, source)} onGenerate={() => generateDemo(n.id)} />
              : n.fusion?.kind === 'flat'
              ? <FlatLayNode image={editorImage} locale={locale} onAddMain={() => setMainTarget(n.id)} onReference={source => openImagePicker(n.id, source, n.fusion?.batchFlat ? 'main' : undefined)} onChange={patch => updateFusion(n.id, patch)} onGenerate={() => generateDemo(n.id)} />
              : n.fusion?.kind === 'directed'
              ? <DirectedFusionNode image={editorImage} locale={locale} onAddMain={() => setMainTarget(n.id)} onChange={patch => updateFusion(n.id, patch)} onChoosePoint={pointId => setDirectedTarget({ editorId: n.id, pointId })} onGenerate={() => generateDemo(n.id)} onNotify={announce} />
              : <FusionNode image={editorImage} locale={locale} onAddMain={() => setMainTarget(n.id)} onChange={patch => updateFusion(n.id, patch)} onReference={source => openImagePicker(n.id, source)} onEditGuide={() => setDrawingImage(editorImage)} onGenerate={() => generateDemo(n.id)} />}
          </div>
        </div>;})}
      </ReactFlowCanvas>

      {shownSelection.value && !selecting && !canvasReference && <div className="selection-overlay" data-phase={shownSelection.phase} aria-label={t.groupSelection} style={{
        left: shownSelection.value.bounds.x * view.zoom + view.x, top: shownSelection.value.bounds.y * view.zoom + view.y,
        width: shownSelection.value.bounds.width * view.zoom, height: shownSelection.value.bounds.height * view.zoom,
      }}>
        {shownSelection.value.count > 1 && <div className="group-selection-frame" data-selection-count={shownSelection.value.count} />}
        {shownSelection.value.showToolbar && <div className="media-toolbar-anchor" data-overlay inert={shownSelection.phase === 'exit'} style={{ bottom: `calc(100% + ${16 + 24 * view.zoom}px)` }}>
          <SelectionToolbar locale={locale} multiple={shownSelection.value.count > 1} onAction={action => action === 'batchEdit' ? openBatchEdit() : action === 'multiFlat' ? openMerge(true) : action === 'fusion' || action === 'lingerie' || action === 'directed' || action === 'flat' ? openFusion(action) : action === 'cutout' ? setCutoutImage(imageRef.current.find(n => !n.generation && selectedRef.current.includes(n.id)) ?? null) : action === 'removeBackground' ? removeSelectedBackgrounds() : action === 'mergeImages' ? openMerge() : announce(t.noBackend)} onDownload={() => void downloadSelected()} />
        </div>}
      </div>}
      {shownResultFeedback.value && <div className="result-feedback-anchor" data-overlay data-phase={shownResultFeedback.phase} inert={shownResultFeedback.phase === 'exit'} style={{
        left: (shownResultFeedback.value.x + shownResultFeedback.value.width / 2) * view.zoom + view.x,
        top: (shownResultFeedback.value.y + shownResultFeedback.value.height) * view.zoom + view.y + 16,
      }}>
        <ResultFeedbackToolbar locale={locale} value={resultFeedback[shownResultFeedback.value.id]}
          onFeedback={(value, anchor) => {
            const id = shownResultFeedback.value!.id;
            const cancelled = resultFeedback[id] === value;
            if (value === 'dislike' && !cancelled) {
              setImproveTarget(previous => previous?.imageId === id && previous.kind === 'dislike' ? null : { imageId: id, anchor, kind: 'dislike' });
              return;
            }
            setResultFeedback(previous => ({ ...previous, [id]: cancelled ? undefined : value }));
            setImproveTarget(null);
            if (!cancelled && value === 'like') notify(t.resultLikeThanks);
          }}
          onImprove={anchor => setImproveTarget({ imageId: shownResultFeedback.value!.id, anchor, kind: 'improve' })}
          onRegenerate={() => regenerateResult(shownResultFeedback.value!.id)} />
      </div>}
      {shownSnapGuide.value && <div className="canvas-snap-guides" aria-hidden="true" data-phase={shownSnapGuide.phase}>
        {shownSnapGuide.value.x !== undefined && <span className="canvas-snap-guide canvas-snap-guide--vertical" style={{ left: shownSnapGuide.value.x * view.zoom + view.x }} />}
        {shownSnapGuide.value.y !== undefined && <span className="canvas-snap-guide canvas-snap-guide--horizontal" style={{ top: shownSnapGuide.value.y * view.zoom + view.y }} />}
      </div>}
      {shownReturnToNodes.value && !canvasReference && <div className="canvas-return-hint" data-overlay data-phase={shownReturnToNodes.phase} inert={shownReturnToNodes.phase === 'exit'}>
        <p role="status">{t.noNodesInView}</p>
        <Button variant="primary" size="s" onClick={fit}>{t.returnToNodes}</Button>
      </div>}
      {shownCanvasReference.value && <div className={`canvas-return-hint canvas-reference-hint${canvasReferencePreviews.length ? ' has-selection' : ''}`} data-overlay data-phase={shownCanvasReference.phase} inert={shownCanvasReference.phase === 'exit'}>
        {!!canvasReferencePreviews.length && <div ref={referencePreviewList} className="canvas-reference-previews" data-canvas-scroll role="list" aria-label={locale === 'en' ? 'Selected images' : locale === 'ja' ? '選択した画像' : '本次已选图片'} onWheel={event => {
          event.stopPropagation();
          if (!event.ctrlKey && !event.metaKey && !event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY;
        }}>
          {canvasReferencePreviews.map(image => <div className="canvas-reference-preview" role="listitem" key={image.id}>
            <ProgressiveImage src={image.url} alt={image.name} width={56} height={56} fit="contain" />
            <Button variant="tonal" className="canvas-reference-remove" title={locale === 'en' ? 'Remove from selection' : locale === 'ja' ? '選択を解除' : '取消选择'} aria-label={`${locale === 'en' ? 'Remove from selection' : locale === 'ja' ? '選択を解除' : '取消选择'}：${image.name}`} onClick={() => {
              setCanvasReference(current => current ? { ...current, ids: current.ids.filter(id => id !== image.id) } : null);
            }}><Icon name="close" size={12} /></Button>
          </div>)}
        </div>}
        <div className="canvas-reference-footer">
          <p role="status"><span>{shownCanvasReference.value.role === 'main' || images.find(n => n.id === shownCanvasReference.value!.target)?.fusion?.batchFlat ? (locale === 'en' ? 'Select main images from the canvas' : locale === 'ja' ? 'キャンバスからメイン画像を選択' : '请选择画布中的图片作为主图') : images.find(n => n.id === shownCanvasReference.value!.target)?.fusion?.kind === 'lingerie' ? t.modelImagePickHint : t.referencePickHint}</span>{' '}<span className="canvas-reference-count">{pickerImages(images.find(n => n.id === shownCanvasReference.value!.target)?.fusion, shownCanvasReference.value.role).length + shownCanvasReference.value.ids.length} / {pickerLimit(images.find(n => n.id === shownCanvasReference.value!.target)?.fusion, shownCanvasReference.value.role)}</span></p>
          <div className="canvas-reference-actions">
            <Button variant="secondary" onClick={() => setCanvasReference(null)}>{t.cancel}</Button>
            <Button variant="primary" disabled={!canvasReference?.ids.length} onClick={() => {
              if (canvasReference) {
                const additions = canvasReference.ids.flatMap(id => imageRef.current.find(n => n.id === id && !n.nodeOnly && !n.generation) ?? []);
                if (canvasReference.role === 'main') addWorkflowMainImages(canvasReference.target, additions);
                else addReferences(canvasReference.target, additions);
              }
              setCanvasReference(null);
            }}>{t.confirm}</Button>
          </div>
        </div>
      </div>}
      {(images.length > 0 || tasks.length > 0) && <CanvasChrome locale={locale} mode={spaceDown ? 'hand' : canvasMode} onMode={setCanvasMode} zoom={view.zoom} view={view} canvasSize={canvasSize} images={navigationNodes}
        tasks={tasks} onRenameMedia={renameImage} onSelectTask={task => { if (!canvasReference) focusImageTask(task); }} canSelectTask={task => !canvasReference && canvasImageTaskResults(images, task).length > 0}
        snapToGrid={snapToGrid} onToggleSnap={() => { setSnapGuide(null); setSnapToGrid(current => { localStorage.setItem('lc-v56-flow-grid-snap', current ? 'off' : 'on'); return !current; }); }}
        onNavigateMinimap={navigateMinimap} onMinimapInteraction={setDragging}
        canUndo={canUndo && !canvasReference} canRedo={canRedo && !canvasReference} onUndo={() => { if (!canvasReference) undo(); }} onRedo={() => { if (!canvasReference) redo(); }} onUpload={() => { if (!canvasReference) openUpload(); }} onZoom={changeZoom} onFit={fit} onArrange={() => { if (!canvasReference) arrange(); }}
        onHelp={() => setModal('help')} onDemo={() => announce(t.noBackend)} />}
      <span className="sr-only" role="status">{images.filter(n => !n.nodeOnly).length} {t.image} · {selectedIds.length} {t.selected}</span>
      {shownDrop.value && <div className="drop-overlay flex items-center justify-center pointer-events-none" data-phase={shownDrop.phase}><span>{t.drop}</span></div>}
      {reading && !modal && <div className="canvas-message" role="status">{t.reading}</div>}
    </main>

    <AiTryOnPage active={page === 'tryon'} locale={locale} uploads={uploads} onUpload={rememberUpload} />
    <VideoWorkspace active={page === 'video'} locale={locale} onBack={() => { window.location.hash = '#/canvas'; }} />
    <DesignWorkspace active={page === 'design'} locale={locale} theme={resolvedTheme} />

    <CanvasContextMenu point={canvasMenu} canPaste={!!canvasClipboard.current} locale={locale} onClose={closeCanvasMenu}
      onDownload={() => { closeCanvasMenu(); void downloadSelected(); }}
      onCopy={() => { void copySelectedFromMenu(); }}
      onDuplicate={() => { duplicateSelected(); closeCanvasMenu(); }}
      onSetCover={contextCoverTarget && isProjectCoverCandidate(contextCoverTarget) ? setCoverFromMenu : undefined}
      isProjectCover={contextCoverTarget?.projectCover}
      onDelete={() => { removeSelected(); closeCanvasMenu(); }}
      onUpload={() => { if (!canvasMenu) return; openUpload({ x: canvasMenu.worldX, y: canvasMenu.worldY }); closeCanvasMenu(); }}
      onPaste={() => { if (canvasMenu) pasteCopiedItems({ x: canvasMenu.worldX, y: canvasMenu.worldY }); closeCanvasMenu(); }} />
    <ToastHost />


    {shownDrawing.value && <DrawingGuideEditor key={`${shownDrawing.value.id}:${shownDrawing.value.url}`} image={shownDrawing.value} locale={locale} phase={shownDrawing.phase} onClose={() => setDrawingImage(null)} onSave={drawingGuide => {
      const opened = shownDrawing.value!;
      const owner = imageRef.current.find(item => item.id === opened.id && item.fusion);
      const source = owner ? workflowSources(imageRef.current, owner)[0] : undefined;
      if (!owner || !source || source.url !== opened.url) {
        setDrawingImage(null);
        announce(locale === 'en' ? 'The main image has changed. Reopen the guide to continue.' : locale === 'ja' ? 'メイン画像が変更されました。ガイドを開き直してください。' : '主图已变更，请重新打开示意编辑。');
        return;
      }
      updateFusion(owner.id, { drawingGuide });
      setDrawingImage(null);
    }} />}
    {shownCutout.value && <CutoutEditor key={shownCutout.value.id} image={shownCutout.value} phase={shownCutout.phase} onClose={() => setCutoutImage(null)} onApply={url => {
      const source = shownCutout.value!;
      ownedUrls.current.add(url);
      const output: CanvasImage = {...source, id: crypto.randomUUID(), name: `${source.name}-cutout.png`, sourceImageId: source.id, generatedByEditorId: undefined, generatedTaskId: undefined, generation: undefined, editorSourceId: undefined, url, x: source.x + source.width + 80, role: undefined, fusion: undefined, operation: undefined};
      const [result] = fileNamer.assign([output], 'cutout', t.cutout, imageRef.current, 'png');
      remember(imageRef.current); setImages(previous => centerAddedFusionBranches(previous, [...previous, result])); setSelectedIds([result.id]); setCutoutImage(null);
    }} />}
    {shownImprove.value && <ResultFeedbackPopover key={`${shownImprove.value.imageId}:${shownImprove.value.kind}`} kind={shownImprove.value.kind} anchor={shownImprove.value.anchor} locale={locale} phase={shownImprove.phase}
      onClose={() => setImproveTarget(null)} onSubmit={(text, reasons) => {
        try {
          const raw: unknown = JSON.parse(localStorage.getItem('lc-v56-result-feedback') || '[]');
          const records = Array.isArray(raw) ? raw : [];
          const imageId = shownImprove.value!.imageId;
          const editorId = imageRef.current.find(image => image.id === imageId)?.generatedByEditorId;
          localStorage.setItem('lc-v56-result-feedback', JSON.stringify([...records, { id: crypto.randomUUID(), imageId, editorId, kind: shownImprove.value!.kind, text, reasons, createdAt: new Date().toISOString() }]));
          if (shownImprove.value!.kind === 'dislike') setResultFeedback(previous => ({ ...previous, [imageId]: 'dislike' }));
          announce(t.resultFeedbackSaved); return true;
        } catch { announce(t.resultFeedbackFailed); return false; }
      }} />}
    {shownPreview.value && <FullImageViewer key={shownPreview.value.id} image={shownPreview.value} locale={locale} phase={shownPreview.phase} onClose={() => setPreviewImage(null)} />}
    {shownMainTarget.value && <AssetPicker key={`main:${shownMainTarget.value}`} locale={locale} phase={shownMainTarget.phase} uploads={uploads} onUpload={rememberUpload} onClose={() => setMainTarget(null)} onConfirm={item => {
      const target = imageRef.current.find(n => n.id === mainTarget && n.nodeOnly && n.fusion);
      if (!target) { setMainTarget(null); return; }
      const id = crypto.randomUUID();
      remember(imageRef.current);
      setImages(previous => centerAddedFusionBranches(previous, restoreWorkflowMain(previous, target.id, item, id)));
      setSelectedIds([`${target.id}:fusion`]); setMainTarget(null);
    }} />}
    {shownReference.value && <AssetPicker key={`reference:${shownReference.value.target}:${shownReference.value.role ?? 'reference'}`} locale={locale} phase={shownReference.phase} uploads={uploads} onUpload={rememberUpload} onClose={() => setReferenceTarget(null)}
      maxCount={pickerLimit(images.find(n => n.id === shownReference.value!.target)?.fusion, shownReference.value.role) - pickerImages(images.find(n => n.id === shownReference.value!.target)?.fusion, shownReference.value.role).length}
      excludedUrls={pickerImages(images.find(n => n.id === shownReference.value!.target)?.fusion, shownReference.value.role).map(n => n.url)} limitMessage={referenceLimitMessage(shownReference.value.target, shownReference.value.role)}
      onConfirm={image => {
        const picker = shownReference.value!;
        if (picker.role === 'main') addWorkflowMainImages(picker.target, [image]);
        else addReferences(picker.target, [image]);
        setReferenceTarget(null);
      }}
      onConfirmBatch={images.find(n => n.id === shownReference.value!.target)?.fusion?.kind === 'lingerie' ? undefined : items => {
        const picker = shownReference.value!;
        if (picker.role === 'main') addWorkflowMainImages(picker.target, items);
        else addReferences(picker.target, items);
        setReferenceTarget(null);
      }} />}

    {shownDirectedTarget.value && <AssetPicker key={`directed:${shownDirectedTarget.value.editorId}:${shownDirectedTarget.value.pointId ?? 'new'}`} locale={locale} phase={shownDirectedTarget.phase} uploads={uploads} onUpload={rememberUpload}
      onClose={() => setDirectedTarget(null)} onConfirm={item => {
        if (!directedTarget) return;
        const editor = imageRef.current.find(n => n.id === directedTarget.editorId && n.fusion?.kind === 'directed');
        if (!editor?.fusion) { setDirectedTarget(null); return; }
        const points = editor.fusion.directedPoints ?? [];
        const reference = { id: item.id, name: item.name, url: item.url };
        const next = directedTarget.pointId
          ? points.map(point => point.id === directedTarget.pointId ? { ...point, reference, maskPreviewUrl: undefined, maskSourceUrl: undefined } : point)
          : points.length < MAX_DIRECTED_POINTS ? [...points, { id: crypto.randomUUID(), reference }] : points;
        updateFusion(editor.id, { directedPoints: next });
        setDirectedTarget(null);
      }} />}

    {activeTool && <AssetPicker key={activeTool.id} locale={locale} phase={shownModal.phase} uploads={uploads} onUpload={rememberUpload}
      onClose={closeModal} onConfirm={image => { addImages([{ ...image, operation: activeTool.id }]); closeModal(); }} />}
    {shownModal.value === 'upload' && <AssetPicker key="upload" locale={locale} phase={shownModal.phase} uploads={uploads} onUpload={rememberUpload}
      onClose={closeModal} onConfirm={image => { addBatchImages([image], uploadPoint.current); closeModal(); }} onConfirmBatch={items => { addBatchImages(items, uploadPoint.current); closeModal(); }} />}
    {shownModal.value && shownModal.value !== 'upload' && !activeTool && <Dialog title={t[shownModal.value as 'help' | 'support' | 'credits' | 'project']} onClose={closeModal} closeLabel={t.close} phase={shownModal.phase}>
      {shownModal.value === 'help' ? <div className="text-sm leading-6"><p className="font-medium mb-3">{t.helpIntro}</p><ul className="help-list space-y-3 text-muted"><li>{t.helpUpload}</li><li>{t.shortcutSelect}</li><li>{t.helpPan}</li><li>{t.helpZoom}</li><li>{t.helpKeys}</li></ul><p className="text-xs text-muted mt-6">{t.localNote}</p></div>
        : shownModal.value === 'project' ? <><div className="project-summary p-4 rounded-xl mb-4">{projectCover && <img className="project-summary-cover" src={projectCover.url} alt={projectCover.name} />}<p className="font-medium mb-1">{projectName}</p><p className="text-xs text-muted">{t.workspace} · {images.filter(n => !n.nodeOnly).length} {t.image}</p></div><p className="text-xs leading-5 text-muted">{t.localNote}</p><div className="flex justify-end mt-6"><Button variant="outline" size="m" onClick={closeModal}>{t.returnCanvas}</Button></div></>
        : <p className="text-sm leading-6 text-muted">{shownModal.value === 'support' ? t.supportNote : t.creditsNote}</p>}
    </Dialog>}
  </div></PromptLibraryProvider>;
}
