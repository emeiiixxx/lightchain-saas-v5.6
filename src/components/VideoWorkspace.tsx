import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { boundsOf, DEFAULT_VIEW, fitImages, zoomAt, type CanvasImage, type Viewport } from '../canvas';
import { prepareMainImage, type LibraryImage } from '../asset-library';
import type { SnapGuides } from '../canvas-snapping';
import { messages, type Locale } from '../i18n';
import { usePresence } from '../usePresence';
import { videoAssets } from '../video-assets';
import { exportImage, ImageExportError, type DownloadFormat } from '../download-image';
import { downloadImages } from '../download-images';
import { videoMultiSelection } from '../video-multi-selection';
import { AssetPicker } from './AssetPicker';
import { CanvasBackground } from './CanvasBackground';
import { CanvasProjectPanel } from './CanvasProjectPanel';
import { CanvasChrome } from './CanvasChrome';
import type { CanvasTask } from './CanvasTaskList';
import { CanvasGenerationPlaceholder } from './CanvasGenerationPlaceholder';
import { CanvasContextMenu } from './CanvasContextMenu';
import { CutoutEditor } from './CutoutEditor';
import { FullImageViewer } from './FullImageViewer';
import { FullVideoViewer } from './FullVideoViewer';
import { ProgressiveImage } from './ProgressiveImage';
import { ReactFlowCanvas } from './ReactFlowCanvas';
import { VideoTemplateDialog } from './VideoTemplateDialog';
import { videoTemplates, type VideoTemplateId, type VideoTemplateReplacements } from '../video-templates';
import { prepareVideoTemplateGeneration } from '../video-template-generation';
import { VideoIcon } from './VideoIcon';
import { VideoSelectionToolbar } from './VideoSelectionToolbar';
import { VideoAssetToolbar } from './VideoAssetToolbar';
import { VideoMultiSelectionToolbar, type VideoMultiAction } from './VideoMultiSelectionToolbar';
import { VideoWorkflowNode } from './VideoWorkflowNode';
import { MaterialWorkflowNode } from './MaterialWorkflowNode';
import { VideoUpscaleWorkflowNode } from './VideoUpscaleWorkflowNode';
import { canGenerateVideoUpscaleWorkflow, createVideoUpscaleWorkflow, videoUpscaleWorkflowBox, videoUpscaleWorkflowSize, videoUpscaleWorkflowSourceIds, removeVideoUpscaleSources, type VideoUpscaleWorkflow } from '../video-upscale-workflow';
import { canGenerateMaterialWorkflow, createMaterialWorkflow, materialReferenceLimit, materialWorkflowBox, materialWorkflowHasBackView, materialWorkflowSize, materialWorkflowSourceIds, materialWorkflowTitle, removeMaterialWorkflowSources, type MaterialWorkflow, type MaterialWorkflowKind } from '../material-workflow';
import { ImageConnection } from './ImageConnection';
import { canGenerateVideoWorkflow, normalizeVideoWorkflowSettings, createVideoWorkflow, removeVideoWorkflowSources, videoReferenceLimits, videoWorkflowBox, videoWorkflowReferences, videoWorkflowSourceIds, videoWorkflowSize, type VideoWorkflow, type VideoReference } from '../video-workflow';
import { arrangeVideoWorkflowMedia, reconcileVideoWorkflowLayout, type VideoLayoutState } from '../video-workflow-layout';
import { bindCompletedTaskResults, createFashionVideoDemoResult, createMaterialDemoResults, createVideoDemoResult, demoPlaceholderSize } from '../video-workspace-demo';
import { cropMaterialGrid, gridCropExample } from '../grid-crop';
import { copyVideoCanvasSelection, pasteVideoCanvasSelection, prepareVideoCanvasMedia, readCanvasMedia, sizeVideoCanvasMedia, type VideoCanvasMedia } from '../video-canvas-media';
import { createCanvasClipboard, getCanvasPasteOffset, matchesCanvasClipboard, writeCanvasClipboardEvent, writeCanvasClipboardSystem, type CanvasClipboard } from '../canvas-clipboard-session';
import { videoReferenceUploadMessages, type UploadedVideo } from '../video-reference-upload';
import { notify } from './Toast';
import { Button, Dialog, Icon } from './ui';
import '../video-workspace.css';

const copy = {
  'zh-CN': { title: '视频工作台', headline: '从一个视频想法开始', intro: '从下方选择一个功能或点击添加素材，开启您的创作', templates: '热门模版', videoTemplates: '视频模版', quickImage: '快捷生图', storyboardImage: '分镜图', fashionVideo: '服装短视频', proFashionVideo: '专业服装视频', pending: '此功能暂未接入，现可添加图片或使用热门模版。', help: '拖动图片移动位置；Shift + 点击或拖动空白处多选。按住空格拖动可平移，滚轮平移画布，按住 Ctrl / ⌘ / Alt 滚轮缩放。Delete 删除选中图片，Ctrl / ⌘ + Z 撤销，Ctrl / ⌘ + Shift + Z 重做，0 适应屏幕。', back: '返回融合画布' },
  en: { title: 'Video workspace', headline: 'Start with a video idea', intro: 'Choose a feature below or add assets to start creating', templates: 'Templates', videoTemplates: 'Video templates', quickImage: 'Quick image', storyboardImage: 'Storyboard image', fashionVideo: 'Fashion video', proFashionVideo: 'Pro fashion video', pending: 'This feature is not connected yet. Add images or explore the templates.', help: 'Drag images to move them. Shift-click or drag the background to select multiple images. Hold Space and drag to pan; scroll to pan, or hold Ctrl / ⌘ / Alt and scroll to zoom. Delete removes selected images. Ctrl / ⌘ + Z undoes, Ctrl / ⌘ + Shift + Z redoes, and 0 fits the canvas.', back: 'Back to outfit canvas' },
  ja: { title: '動画ワークスペース', headline: '動画のアイデアから始めよう', intro: '下から機能を選ぶか、素材を追加して制作を始めましょう', templates: '人気テンプレート', videoTemplates: '動画テンプレート', quickImage: 'クイック画像生成', storyboardImage: '絵コンテ', fashionVideo: 'ファッション動画', proFashionVideo: 'プロ向けファッション動画', pending: 'この機能はまだ接続されていません。画像の追加とテンプレートをお試しいただけます。', help: '画像をドラッグして移動。Shift + クリックまたは背景のドラッグで複数選択。Space を押しながらドラッグして移動、スクロールで移動、Ctrl / ⌘ / Alt + スクロールで拡大・縮小。Delete で削除、Ctrl / ⌘ + Z で取り消し、Ctrl / ⌘ + Shift + Z でやり直し、0 で全体を表示します。', back: 'コーディネート画面に戻る' },
};
const entries = [
  { id: 'templates', label: 'videoTemplates', icon: 'entryTemplates', nodeId: '64:2062' },
  { id: 'quickImage', label: 'quickImage', icon: 'entryQuickImage', nodeId: '64:2063' },
  { id: 'storyboardImage', label: 'storyboardImage', icon: 'entryStoryboardImage', nodeId: '64:2064' },
  { id: 'fashionVideo', label: 'fashionVideo', icon: 'entryFashionVideo', nodeId: '64:2204' },
  { id: 'proFashionVideo', label: 'proFashionVideo', icon: 'entryProFashionVideo', nodeId: '64:2065' },
] as const;
const mediaCopy = {
  'zh-CN': { add: '点击或拖拽到此处添加素材', drop: '将图片或视频拖放到这里', upload: '上传素材', video: '视频', play: '播放', materials: '素材', limit: '每次最多添加20个素材。' },
  en: { add: 'Click or drop assets here', drop: 'Drop images or videos here', upload: 'Upload assets', video: 'Video', play: 'Play', materials: 'Assets', limit: 'Add up to 20 assets at a time.' },
  ja: { add: 'クリック、または素材をドロップして追加', drop: 'ここに画像・動画をドロップ', upload: '素材をアップロード', video: '動画', play: '再生', materials: '素材', limit: '一度に追加できる素材は20点までです。' },
};
const contextCopy = {
  'zh-CN': { materials: '素材生成', videos: '视频生成', multiView: '多视角', gridSplit: '宫格图切分', storyboardVideo: '分镜成片', remake: '视频复刻', upload: '上传图片/视频', upscale: '视频高清放大' },
  en: { materials: 'Asset generation', videos: 'Video generation', multiView: 'Multiple views', gridSplit: 'Split grid image', storyboardVideo: 'Storyboard to video', remake: 'Video remake', upload: 'Upload images/videos', upscale: 'Video upscale' },
  ja: { materials: '素材生成', videos: '動画生成', multiView: 'マルチビュー', gridSplit: 'グリッド画像分割', storyboardVideo: '絵コンテから動画', remake: '動画再現', upload: '画像・動画をアップロード', upscale: '動画高画質化' },
};
type Snapshot = { images: VideoCanvasMedia[]; workflows: VideoWorkflow[]; materialWorkflows?: MaterialWorkflow[]; upscaleWorkflows?: VideoUpscaleWorkflow[]; selected: string[]; layout?: VideoLayoutState };
type DemoResult = Omit<VideoCanvasMedia, 'x' | 'y'>;
type DemoTaskRecord = { editorId?: string; timer: number | null; status: CanvasTask['status']; results: DemoResult[] };
const DEMO_TASK_DURATION = 3000;
type VideoClipboard = CanvasClipboard<VideoCanvasMedia>;
type CopiedMedia = Pick<VideoClipboard, 'items'>;
type VideoWorkflowUpload = { editor?: 'video'; id: string; field: 'main' | 'endFrame' | 'references'; kind: VideoReference['kind'] };
type MaterialWorkflowUpload = { editor: 'material'; id: string; field: 'references' | 'back'; kind: 'image' };
type UpscaleWorkflowUpload = { editor: 'upscale'; id: string; field: 'video'; kind: 'video' };
type WorkflowUpload = VideoWorkflowUpload | MaterialWorkflowUpload | UpscaleWorkflowUpload;
type Modal = 'templates' | 'assets' | 'help';
type Props = { locale: Locale; active: boolean; onBack: () => void };
const connectionHelp = {
  'zh-CN': '通过素材工具栏或节点内添加图片、视频，素材与关联线自动显示在画布。选中素材或编辑器显示流动高亮，取消选择恢复灰色连线。',
  en: 'Use the asset toolbar or add images and videos in the editor to show assets and their connections on the canvas. Selecting the asset or editor highlights its connection; deselecting restores the grey line.',
  ja: '素材ツールバー、またはエディター内から画像・動画を追加すると、素材と接続線がキャンバスに表示されます。素材やエディターを選択すると接続線が強調され、選択を解除すると灰色に戻ります。',
};
const sceneItems = (snapshot: Snapshot) => [...snapshot.images, ...snapshot.workflows.map(videoWorkflowBox), ...(snapshot.materialWorkflows ?? []).map(materialWorkflowBox), ...(snapshot.upscaleWorkflows ?? []).map(videoUpscaleWorkflowBox)];
const isField = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"]');

function fitVideoImages(images: CanvasImage[], width: number, height: number): Viewport {
  if (images.length !== 1) return fitImages(images, width, height);
  const image = images[0];
  const horizontalInset = width <= 680 ? 16 : 80;
  const verticalInset = width <= 680 ? 132 : 80;
  // The 40px toolbar and 16px gap are in screen space, above the image.
  const zoom = Math.min(1, Math.max(.03, Math.min(
    Math.max(1, width - horizontalInset * 2) / image.width,
    Math.max(1, height - verticalInset * 2 - 56) / image.height,
  )));
  return { zoom, x: width / 2 - (image.x + image.width / 2) * zoom,
    y: (height + 56) / 2 - (image.y + image.height / 2) * zoom };
}

export function VideoWorkspace({ locale, active, onBack }: Props) {
  const t = messages[locale], v = copy[locale], m = mediaCopy[locale], c = contextCopy[locale];
  const canvas = useRef<HTMLElement>(null);
  const activeRef = useRef(active); activeRef.current = active;
  const [projectName, setProjectName] = useState(() => {
    try { return localStorage.getItem('lc-v56-video-project-name') || 'Untitle'; } catch { return 'Untitle'; }
  });
  const [snapshot, setSnapshot] = useState<Snapshot>({ images: [], workflows: [], materialWorkflows: [], selected: [] });
  const current = useRef(snapshot); current.current = snapshot;
  const [tasks, setTasks] = useState<CanvasTask[]>([]);
  const demoTaskRecords = useRef(new Map<string, DemoTaskRecord>());
  const history = useRef<{ past: Snapshot[]; future: Snapshot[] }>({ past: [], future: [] });
  const [view, commitView] = useState<Viewport>(DEFAULT_VIEW);
  const viewRef = useRef(view); viewRef.current = view;
  const cameraFrame = useRef<number | null>(null);
  const stopCamera = useCallback(() => {
    if (cameraFrame.current !== null) cancelAnimationFrame(cameraFrame.current);
    cameraFrame.current = null;
  }, []);
  const setView = useCallback((next: Viewport | ((previous: Viewport) => Viewport)) => {
    stopCamera();
    const target = typeof next === 'function' ? next(viewRef.current) : next;
    viewRef.current = target; commitView(target);
  }, [stopCamera]);
  const animateView = useCallback((target: Viewport) => {
    stopCamera();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setView(target); return; }
    const from = viewRef.current, started = performance.now();
    const duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-duration')) || 200;
    // Match the image canvas and CSS ease-out: cubic-bezier(0, 0, .58, 1).
    const frame = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      let low = 0, high = 1;
      for (let index = 0; index < 20; index++) {
        const time = (low + high) / 2;
        const x = 1.74 * (1 - time) * time * time + time * time * time;
        if (x < progress) low = time; else high = time;
      }
      const time = (low + high) / 2;
      const eased = 3 * (1 - time) * time * time + time * time * time;
      const next = progress === 1 ? target : { x: from.x + (target.x - from.x) * eased, y: from.y + (target.y - from.y) * eased, zoom: from.zoom + (target.zoom - from.zoom) * eased };
      viewRef.current = next; commitView(next);
      cameraFrame.current = progress < 1 ? requestAnimationFrame(frame) : null;
    };
    cameraFrame.current = requestAnimationFrame(frame);
  }, [setView, stopCamera]);
  useEffect(() => stopCamera, [stopCamera]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const measured = useRef({ width: 0, height: 0 });
  const [uploads, setUploads] = useState<LibraryImage[]>([]);
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([]);
  const ownedUrls = useRef(new Set<string>());
  const pendingGridCrops = useRef(new Set<string>());
  const pendingVideoExamples = useRef(new Set<string>());
  const pendingMediaRead = useRef<AbortController | null>(null);
  const uploadEpoch = useRef(0), uploadLocked = useRef(false);
  const [reading, setReading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const downloadLocked = useRef(false);
  const [dropActive, setDropActive] = useState(false);
  const [mode, setMode] = useState<'select' | 'hand'>('select');
  const [spaceDown, setSpaceDown] = useState(false);
  const effectiveMode = spaceDown ? 'hand' : mode;
  const [dragging, setDragging] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(() => {
    try { return localStorage.getItem('lc-v56-video-grid-snap') !== 'off'; } catch { return true; }
  });
  const [guides, setGuides] = useState<SnapGuides | null>(null);
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number; worldX: number; worldY: number; kind?: 'image' } | null>(null);
  const canvasClipboard = useRef<VideoClipboard | null>(null);
  const [canPaste, setCanPaste] = useState(false);
  const closeCanvasMenu = useCallback(() => setCanvasMenu(null), []);
  const [modal, setModal] = useState<Modal | null>(null);
  const [preview, setPreview] = useState<CanvasImage | null>(null);
  const [cutout, setCutout] = useState<CanvasImage | null>(null);
  const [workflowUpload, setWorkflowUploadState] = useState<WorkflowUpload | null>(null);
  const workflowUploadRef = useRef<WorkflowUpload | null>(null);
  const setWorkflowUpload = useCallback((target: WorkflowUpload | null) => {
    workflowUploadRef.current = target; setWorkflowUploadState(target);
  }, []);
  const [videoPreview, setVideoPreview] = useState<VideoReference | null>(null);
  const previewEpoch = useRef(0);
  const shownModal = usePresence(active ? modal : null);
  const shownPreview = usePresence(active ? preview : null);
  const shownCutout = usePresence(active ? cutout : null);
  const shownWorkflowUpload = usePresence(active ? workflowUpload : null);
  const shownVideoPreview = usePresence(active ? videoPreview : null);
  const items = useMemo(() => sceneItems(snapshot), [snapshot.images, snapshot.workflows, snapshot.materialWorkflows, snapshot.upscaleWorkflows]);
  const shownDrop = usePresence(dropActive && items.length ? true : null);
  const shownGuides = usePresence(guides);
  const groupBounds = useMemo(() => snapshot.selected.length > 1 ? boundsOf(items.filter(image => snapshot.selected.includes(image.id))) : null, [items, snapshot.selected]);
  const shownGroup = usePresence(groupBounds);
  const multiSelection = useMemo(() => videoMultiSelection(snapshot.images, snapshot.selected), [snapshot.images, snapshot.selected]);
  const singleSelection = useMemo(() => snapshot.selected.length === 1 ? snapshot.images.find(image => image.id === snapshot.selected[0] && !image.generation) ?? null : null, [snapshot.images, snapshot.selected]);
  const shownSingle = usePresence(singleSelection);
  const outsideView = items.length > 0 && !items.some(image => image.x * view.zoom + view.x < canvasSize.width && (image.x + image.width) * view.zoom + view.x > 0 && image.y * view.zoom + view.y < canvasSize.height && (image.y + image.height) * view.zoom + view.y > 0);
  const shownReturn = usePresence(outsideView ? true : null);

  const replace = useCallback((next: Snapshot) => {
    // Task settlement is independent of canvas undo. Restored snapshots resolve
    // old slots to their finished result or failure, never a stranded spinner.
    const images = next.images.map(image => {
      if (!image.generation) return image.video ? sizeVideoCanvasMedia(image) : image;
      const task = demoTaskRecords.current.get(image.generation.taskId);
      if (task?.status === 'completed') {
        const result = task.results.find(item => item.id === image.id);
        if (!result) return image;
        const size = result.video ? sizeVideoCanvasMedia(result) : image;
        return { ...result, x: image.x, y: image.y, width: size.width, height: size.height, generatedByEditorId: image.generatedByEditorId };
      }
      if (task?.status === 'failed' && image.generation.status !== 'failed') return { ...image, generation: { ...image.generation, status: 'failed' as const } };
      return image;
    });
    if (images.some((image, index) => image !== next.images[index])) next = { ...next, images };
    const workflows = next.workflows.map(normalizeVideoWorkflowSettings);
    const normalized = workflows.some((node, index) => node !== next.workflows[index]) ? { ...next, workflows } : next;
    const grouped = { ...normalized, layout: reconcileVideoWorkflowLayout(normalized.images, normalized.workflows, normalized.materialWorkflows, normalized.upscaleWorkflows, normalized.layout) };
    current.current = grouped; setSnapshot(grouped);
  }, []);
  // Apply the current media sizing rule to an already-open preview as well.
  useEffect(() => { replace(current.current); }, [replace]);
  const saveUndo = useCallback(() => {
    history.current.past = [...history.current.past.slice(-99), current.current];
    history.current.future = [];
  }, []);
  const commit = useCallback((next: Snapshot) => { saveUndo(); replace(next); }, [replace, saveUndo]);
  const undo = useCallback(() => {
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push(current.current); replace(previous);
  }, [replace]);
  const redo = useCallback(() => {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(current.current); replace(next);
  }, [replace]);
  const fit = useCallback(() => {
    const element = canvas.current;
    if (element) setView(current.current.workflows.length || current.current.materialWorkflows?.length || current.current.upscaleWorkflows?.length ? fitImages(sceneItems(current.current), element.clientWidth, element.clientHeight) : fitVideoImages(current.current.images, element.clientWidth, element.clientHeight));
  }, [setView]);
  const removeSelected = useCallback(() => {
    const previous = current.current;
    if (!previous.selected.length) return;
    const removed = new Set(previous.selected);
    commit({ ...previous, images: previous.images.filter(image => !removed.has(image.id)).map(image => image.generatedByEditorId && removed.has(image.generatedByEditorId) ? { ...image, generatedByEditorId: undefined } : image),
      workflows: previous.workflows.filter(node => !removed.has(node.id)).map(node => removeVideoWorkflowSources(node, removed)),
      materialWorkflows: (previous.materialWorkflows ?? []).filter(node => !removed.has(node.id)).map(node => removeMaterialWorkflowSources(node, removed)),
      upscaleWorkflows: (previous.upscaleWorkflows ?? []).filter(node => !removed.has(node.id)).map(node => removeVideoUpscaleSources(node, removed)),
      selected: [] });
  }, [commit]);
  const closeModal = useCallback(() => { uploadEpoch.current++; pendingMediaRead.current?.abort(); uploadLocked.current = false; setReading(false); setModal(null); }, []);

  const captureSelectedMedia = useCallback((): CopiedMedia => {
    const previous = current.current, items = copyVideoCanvasSelection(previous.images.filter(image => !image.generation), previous.selected);
    return { items };
  }, []);
  const pasteCopiedItems = useCallback((point?: { x: number; y: number }, copied?: CopiedMedia) => {
    const clipboard = copied ? { ...copied, pastes: 0 } : canvasClipboard.current;
    const element = canvas.current;
    if (!activeRef.current || !clipboard?.items.length || !element) return;
    const bounds = boundsOf(clipboard.items)!;
    const offset = getCanvasPasteOffset(bounds, viewRef.current, { width: element.clientWidth, height: element.clientHeight }, clipboard.pastes, point);
    const created: VideoCanvasMedia[] = pasteVideoCanvasSelection(clipboard.items, offset.x, offset.y);
    clipboard.pastes++;
    commit({ ...current.current, images: [...current.current.images, ...created], selected: created.map(item => item.id) });
    element.focus({ preventScroll: true });
  }, [commit]);
  const duplicateSelected = useCallback(() => {
    const copied = captureSelectedMedia();
    if (copied.items.length) pasteCopiedItems(undefined, copied);
  }, [captureSelectedMedia, pasteCopiedItems]);
  async function copySelectedFromMenu() {
    const copied = captureSelectedMedia();
    if (!copied.items.length) return;
    const clipboard = createCanvasClipboard(copied.items);
    canvasClipboard.current = clipboard; setCanPaste(true); closeCanvasMenu();
    try { await writeCanvasClipboardSystem(clipboard, copied.items.map(item => item.name).join('\n')); }
    catch { notify(locale === 'zh-CN' ? '已复制，可右键画布选择「粘贴」' : locale === 'ja' ? 'コピーしました。キャンバスを右クリックして貼り付けできます' : 'Copied. Right-click the canvas to paste.'); }
  }

  useEffect(() => {
    if (!active) return;
    const blocked = (event: ClipboardEvent) => isField(event.target) || isField(document.activeElement)
      || reading || !!(shownModal.value || shownPreview.value || shownCutout.value || shownWorkflowUpload.value || shownVideoPreview.value)
      || !!document.querySelector('dialog[open], [popover]:popover-open:not([data-canvas-context-menu])');
    const copy = (event: ClipboardEvent) => {
      if (canvasMenu || blocked(event) || !event.clipboardData || window.getSelection()?.toString()) return;
      const copied = captureSelectedMedia();
      if (!copied.items.length) return;
      const clipboard = createCanvasClipboard(copied.items);
      writeCanvasClipboardEvent(event.clipboardData, clipboard, copied.items.map(item => item.name).join('\n'));
      canvasClipboard.current = clipboard; setCanPaste(true);
      event.preventDefault();
    };
    const paste = (event: ClipboardEvent) => {
      const clipboard = canvasClipboard.current;
      if (blocked(event) || !clipboard || !event.clipboardData || !matchesCanvasClipboard(event.clipboardData, clipboard)) return;
      event.preventDefault();
      pasteCopiedItems(canvasMenu && !canvasMenu.kind ? { x: canvasMenu.worldX, y: canvasMenu.worldY } : undefined);
      closeCanvasMenu();
    };
    window.addEventListener('copy', copy); window.addEventListener('paste', paste);
    return () => { window.removeEventListener('copy', copy); window.removeEventListener('paste', paste); };
  }, [active, reading, shownModal.value, shownPreview.value, shownCutout.value, shownWorkflowUpload.value, shownVideoPreview.value, canvasMenu, captureSelectedMedia, pasteCopiedItems, closeCanvasMenu]);

  useEffect(() => {
    try { localStorage.setItem('lc-v56-video-project-name', projectName); } catch { /* The canvas remains usable without storage. */ }
  }, [projectName]);
  useEffect(() => {
    const boundTasks = bindCompletedTaskResults(tasks, snapshot.images);
    if (boundTasks !== tasks) setTasks(boundTasks);
    const editors = new Set([...snapshot.workflows, ...(snapshot.materialWorkflows ?? []), ...(snapshot.upscaleWorkflows ?? [])].map(node => node.id));
    const removed = new Set<string>();
    for (const [id, task] of demoTaskRecords.current) {
      if (task.status !== 'running') continue;
      const hasSlot = snapshot.images.some(image => image.generation?.taskId === id);
      if ((!task.editorId || editors.has(task.editorId)) && hasSlot) continue;
      if (task.timer !== null) window.clearTimeout(task.timer);
      task.timer = null; task.status = 'failed'; removed.add(id);
    }
    if (removed.size) {
      setTasks(previous => previous.map(task => removed.has(task.id) ? { ...task, status: 'failed' } : task));
      replace(current.current);
    }
  }, [tasks, snapshot.images, snapshot.workflows, snapshot.materialWorkflows, snapshot.upscaleWorkflows, replace]);
  useEffect(() => {
    if (active) return;
    stopCamera();
    uploadEpoch.current++; uploadLocked.current = false;
    pendingMediaRead.current?.abort();
    previewEpoch.current++;
    setReading(false); setModal(null); setPreview(null); setCutout(null); setWorkflowUpload(null); setVideoPreview(null); setDropActive(false);
    setSpaceDown(false); setDragging(false); setSelecting(false); setGuides(null); setCanvasMenu(null);
  }, [active, stopCamera]);
  useEffect(() => {
    activeRef.current = active;
    return () => {
      activeRef.current = false; uploadEpoch.current++;
      pendingMediaRead.current?.abort();
      demoTaskRecords.current.forEach(task => { if (task.timer !== null) window.clearTimeout(task.timer); }); demoTaskRecords.current.clear();
      ownedUrls.current.forEach(url => URL.revokeObjectURL(url)); ownedUrls.current.clear();
    };
  }, []);
  useEffect(() => {
    const element = canvas.current;
    if (!element || !active) return;
    const resize = new ResizeObserver(() => {
      const width = element.clientWidth, height = element.clientHeight;
      if (!width || !height) return;
      const previous = measured.current;
      if (previous.width && previous.height) setView(value => ({ ...value, x: value.x + (width - previous.width) / 2, y: value.y + (height - previous.height) / 2 }));
      measured.current = { width, height }; setCanvasSize({ width, height });
    });
    resize.observe(element); return () => resize.disconnect();
  }, [active, setView]);
  useEffect(() => {
    if (!active || shownModal.value || shownPreview.value || shownCutout.value || shownWorkflowUpload.value || shownVideoPreview.value || canvasMenu) return;
    // Own temporary hand mode before React Flow handles keyboard events, so
    // panning, the cursor and the toolbar always use the same state.
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof Element && event.target.closest('input,textarea,select,button,[contenteditable="true"],dialog,[role="menu"]')) return;
      if (document.querySelector('[popover]:popover-open')) return;
      event.preventDefault();
      setSpaceDown(true);
    };
    const release = () => setSpaceDown(false);
    const keyup = (event: KeyboardEvent) => { if (event.code === 'Space') release(); };
    const visibility = () => { if (document.hidden) release(); };
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('keyup', keyup, true);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('keyup', keyup, true);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', visibility);
      release();
    };
  }, [active, shownModal.value, shownPreview.value, shownCutout.value, shownWorkflowUpload.value, shownVideoPreview.value, canvasMenu]);
  useEffect(() => {
    if (!active || shownModal.value || shownPreview.value || shownCutout.value || shownWorkflowUpload.value || shownVideoPreview.value) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.target instanceof Element && event.target.closest('input,textarea,select,button,[contenteditable="true"],dialog,[role="menu"]')) return;
      if (canvasMenu) { if (event.key === 'Escape') { event.preventDefault(); closeCanvasMenu(); } return; }
      if (document.querySelector('[popover]:popover-open')) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelected(); }
      else if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if (command && event.key.toLowerCase() === 'a') { event.preventDefault(); replace({ ...current.current, selected: sceneItems(current.current).map(image => image.id) }); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected(); }
      else if (event.key === 'Escape') { replace({ ...current.current, selected: [] }); setGuides(null); }
      else if (event.key === '0' && !command) { event.preventDefault(); fit(); }
      else if (!command && event.key.toLowerCase() === 'v') setMode('select');
      else if (!command && event.key.toLowerCase() === 'h') setMode('hand');
    };
    const blur = () => { setSpaceDown(false); setDragging(false); setSelecting(false); setGuides(null); };
    window.addEventListener('keydown', keydown); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('blur', blur); };
  }, [active, shownModal.value, shownPreview.value, shownCutout.value, shownWorkflowUpload.value, shownVideoPreview.value, canvasMenu, closeCanvasMenu, duplicateSelected, undo, redo, replace, removeSelected, fit]);

  function rememberUpload(image: LibraryImage) {
    if (image.url.startsWith('blob:')) ownedUrls.current.add(image.url);
    setUploads(previous => [...previous.filter(item => item.url !== image.url), image]);
  }
  function rememberVideo(video: UploadedVideo) {
    if (video.url.startsWith('blob:')) ownedUrls.current.add(video.url);
    setUploadedVideos(previous => [...previous.filter(item => item.url !== video.url), video]);
  }
  function addMedia(media: Omit<VideoCanvasMedia, 'x' | 'y'>[]) {
    if (!activeRef.current || !media.length) return;
    const loaded = media.map(item => sizeVideoCanvasMedia(item));
    const previous = current.current.images, bounds = boundsOf(sceneItems(current.current));
    let y = bounds ? bounds.y + bounds.height + 40 : 0;
    const additions: VideoCanvasMedia[] = [];
    for (let row = 0; row < loaded.length; row += 5) {
      const items = loaded.slice(row, row + 5);
      let x = 0;
      for (const image of items) { additions.push({ ...image, role: undefined, x, y }); x += image.width + 40; }
      y += Math.max(...items.map(image => image.height)) + 40;
    }
    commit({ ...current.current, images: [...previous, ...additions], selected: additions.map(image => image.id) });
    if (canvas.current) setView(fitVideoImages(additions, canvas.current.clientWidth, canvas.current.clientHeight));
    setModal(null); canvas.current?.focus({ preventScroll: true });
  }
  async function loadFiles(files: FileList) {
    if (!activeRef.current || uploadLocked.current || !files.length) return;
    if (files.length > 20) { notify(m.limit, 'error'); return; }
    const epoch = ++uploadEpoch.current;
    const controller = new AbortController();
    pendingMediaRead.current = controller;
    uploadLocked.current = true; setReading(true);
    const results = await Promise.allSettled(Array.from(files).map(file => readCanvasMedia(file, controller.signal)));
    const loaded = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    if (pendingMediaRead.current === controller) pendingMediaRead.current = null;
    if (epoch !== uploadEpoch.current || !activeRef.current) { loaded.forEach(media => URL.revokeObjectURL(media.video?.url ?? media.url)); return; }
    loaded.forEach(media => media.video ? rememberVideo(media.video) : rememberUpload(media)); addMedia(loaded);
    if (results.some(result => result.status === 'rejected')) notify(videoReferenceUploadMessages[locale].error, 'error');
    uploadLocked.current = false; setReading(false);
  }
  function drop(event: DragEvent) {
    if (!active || modal || preview || cutout || workflowUpload || videoPreview) return;
    event.preventDefault(); event.stopPropagation(); setDropActive(false);
    void loadFiles(event.dataTransfer.files);
  }
  function openAssets() { closeCanvasMenu(); if (active && !reading) setModal('assets'); }
  function updateWorkflow(id: string, patch: Partial<VideoWorkflow>) {
    const previous = current.current, currentNode = previous.workflows.find(node => node.id === id);
    if (!currentNode) return;
    commit({ ...previous, workflows: previous.workflows.map(node => {
      if (node.id !== id) return node;
      const next = normalizeVideoWorkflowSettings({ ...node, ...patch });
      if (next.mode !== node.mode) {
        const previousSize = videoWorkflowSize(node), nextSize = videoWorkflowSize(next);
        next.x += (previousSize.width - nextSize.width) / 2;
        next.y += (previousSize.height - nextSize.height) / 2;
      }
      return next;
    }) });
  }
  function addWorkflow(sourceId?: string, mode: VideoWorkflow['mode'] = 'frames', point?: { x: number; y: number }) {
    const previous = current.current;
    // Toolbar entries bind the actual canvas asset, including its current
    // geometry, rather than a fading selection overlay's snapshot.
    const source = sourceId ? previous.images.find(image => image.id === sourceId) : undefined;
    if (sourceId && (!source || source.video || source.generation)) return;
    const scene = sceneItems(previous), viewport = viewRef.current;
    const size = videoWorkflowSize(mode);
    const node = createVideoWorkflow(
      source ? source.x + source.width + 80 : point?.x ?? (canvasSize.width / 2 - viewport.x) / viewport.zoom - size.width / 2,
      source ? source.y + (source.height - size.height) / 2 : point?.y ?? (canvasSize.height / 2 - viewport.y) / viewport.zoom - size.height / 2,
      source, mode,
    );
    // An explicit context-menu point is the user's chosen position; only
    // toolbar/initial-page creation uses automatic collision avoidance.
    while (!point && scene.some(item => node.x < item.x + item.width + 40 && node.x + size.width + 40 > item.x && node.y < item.y + item.height + 40 && node.y + size.height + 40 > item.y)) node.y += size.height + 40;
    commit({ ...previous, workflows: [...previous.workflows, node], selected: [node.id] });
    if (canvas.current && !point) animateView(fitImages([...(source ? [source] : []), videoWorkflowBox(node)], canvas.current.clientWidth, canvas.current.clientHeight));
    canvas.current?.focus({ preventScroll: true });
  }
  function addMultiSelectionWorkflow(action: VideoMultiAction) {
    const previous = current.current;
    // Re-evaluate at click time so stale/fading controls cannot bypass capacity.
    const selection = videoMultiSelection(previous.images, previous.selected);
    if (!selection || (action === 'professional' ? !selection.showVideoAction : !selection.showImageActions)) return;
    const bounds = boundsOf(selection.media);
    if (!bounds) return;
    const references: VideoReference[] = selection.media.map(source => ({
      id: crypto.randomUUID(), sourceImageId: source.id,
      name: source.video?.name ?? source.name,
      url: source.video?.url ?? source.url, kind: source.video ? 'video' : 'image',
    }));
    const node = action === 'professional'
      ? createVideoWorkflow(0, 0, undefined, 'references')
      : createMaterialWorkflow(0, 0, action);
    node.references = references;
    const size = action === 'professional' ? videoWorkflowSize(node as VideoWorkflow) : materialWorkflowSize(node as MaterialWorkflow);
    node.x = bounds.x + bounds.width + 80;
    node.y = bounds.y + (bounds.height - size.height) / 2;
    const scene = sceneItems(previous);
    while (scene.some(item => node.x < item.x + item.width + 40 && node.x + size.width + 40 > item.x && node.y < item.y + item.height + 40 && node.y + size.height + 40 > item.y)) node.y += size.height + 40;
    // One editor and all source bindings form one undoable action; reuse canvas media.
    if (action === 'professional') {
      commit({ ...previous, workflows: [...previous.workflows, node as VideoWorkflow], selected: [node.id] });
    } else {
      commit({ ...previous, materialWorkflows: [...(previous.materialWorkflows ?? []), node as MaterialWorkflow], selected: [node.id] });
    }
    if (canvas.current) animateView(fitImages([...selection.media, { ...node, ...size, name: '', url: '' }], canvas.current.clientWidth, canvas.current.clientHeight));
    canvas.current?.focus({ preventScroll: true });
  }
  function updateMaterialWorkflow(id: string, patch: Partial<MaterialWorkflow>) {
    const previous = current.current;
    const nodes = previous.materialWorkflows ?? [];
    if (!nodes.some(node => node.id === id)) return;
    commit({ ...previous, materialWorkflows: nodes.map(node => {
      if (node.id !== id) return node;
      const next = { ...node, ...patch };
      // A conditional back-reference field changes the editor's height while
      // keeping the centre at the user's chosen canvas position.
      next.y += (materialWorkflowSize(node).height - materialWorkflowSize(next).height) / 2;
      return next;
    }) });
  }
  function addMaterialWorkflow(kind: MaterialWorkflowKind, sourceId?: string, point?: { x: number; y: number }) {
    const previous = current.current;
    const source = sourceId ? previous.images.find(image => image.id === sourceId && !image.video && !image.generation) : undefined;
    if (sourceId && !source) return;
    const scene = sceneItems(previous), viewport = viewRef.current;
    const size = materialWorkflowSize({ kind, view: ['front'] });
    const node = createMaterialWorkflow(
      source ? source.x + source.width + 80 : point?.x ?? (canvasSize.width / 2 - viewport.x) / viewport.zoom - size.width / 2,
      source ? source.y + (source.height - size.height) / 2 : point?.y ?? (canvasSize.height / 2 - viewport.y) / viewport.zoom - size.height / 2,
      kind, source,
    );
    while (!point && scene.some(item => node.x < item.x + item.width + 40 && node.x + size.width + 40 > item.x && node.y < item.y + item.height + 40 && node.y + size.height + 40 > item.y)) node.y += size.height + 40;
    commit({ ...previous, materialWorkflows: [...(previous.materialWorkflows ?? []), node], selected: [node.id] });
    if (canvas.current && !point) animateView(fitImages([...(source ? [source] : []), materialWorkflowBox(node)], canvas.current.clientWidth, canvas.current.clientHeight));
    canvas.current?.focus({ preventScroll: true });
  }
  function addUpscaleWorkflow(sourceId: string) {
    const previous = current.current;
    const source = previous.images.find(image => image.id === sourceId && image.video && !image.generation);
    if (!source) return;
    const node = createVideoUpscaleWorkflow(source), size = videoUpscaleWorkflowSize();
    node.x = source.x + source.width + 80;
    node.y = source.y + (source.height - size.height) / 2;
    const scene = sceneItems(previous);
    while (scene.some(item => node.x < item.x + item.width + 40 && node.x + size.width + 40 > item.x && node.y < item.y + item.height + 40 && node.y + size.height + 40 > item.y)) node.y += size.height + 40;
    commit({ ...previous, upscaleWorkflows: [...(previous.upscaleWorkflows ?? []), node], selected: [node.id] });
    if (canvas.current) animateView(fitImages([source, videoUpscaleWorkflowBox(node)], canvas.current.clientWidth, canvas.current.clientHeight));
    canvas.current?.focus({ preventScroll: true });
  }
  function updateUpscaleWorkflow(id: string, patch: Partial<VideoUpscaleWorkflow>) {
    const previous = current.current;
    if (!previous.upscaleWorkflows?.some(node => node.id === id)) return;
    commit({ ...previous, upscaleWorkflows: previous.upscaleWorkflows.map(node => node.id === id ? { ...node, ...patch } : node) });
  }
  function appendDemoPlaceholders(previous: Snapshot, editor: CanvasImage | undefined, sourceIds: string[], results: DemoResult[]) {
    const occupied = sceneItems(previous);
    const bounds = boundsOf(occupied);
    const added: VideoCanvasMedia[] = [];
    for (const result of results) {
      const output = { ...result,
        x: editor ? editor.x + editor.width + 80 : bounds ? bounds.x + bounds.width + 240 : 0,
        y: editor ? editor.y + (editor.height - result.height) / 2 : bounds?.y ?? 0 };
      // Keep the existing scene in place and reserve room for the entire batch.
      while (occupied.some(item => output.x < item.x + item.width + 40 && output.x + output.width + 40 > item.x
        && output.y < item.y + item.height + 40 && output.y + output.height + 40 > item.y)) {
        output.y += output.height + 40;
      }
      added.push(output); occupied.push(output);
    }
    commit({ ...previous, images: [...previous.images, ...added], selected: added.map(result => result.id) });
    const element = canvas.current;
    if (element && activeRef.current) {
      animateView(fitImages([...previous.images.filter(image => sourceIds.includes(image.id)), ...(editor ? [editor] : []), ...added], element.clientWidth, element.clientHeight));
      element.focus({ preventScroll: true });
    }
  }
  function taskResults(task: CanvasTask) {
    const ids = new Set(task.resultIds ?? demoTaskRecords.current.get(task.id)?.results.map(result => result.id) ?? []);
    return current.current.images.filter(image => !image.generation && (ids.has(image.id) || image.generatedTaskId === task.id));
  }
  function focusTaskResults(task: CanvasTask) {
    const element = canvas.current;
    const results = taskResults(task);
    if (!activeRef.current || !element || task.status !== 'completed' || !results.length) return;
    replace({ ...current.current, selected: results.map(result => result.id) });
    animateView(fitImages(results, element.clientWidth, element.clientHeight));
    element.focus({ preventScroll: true });
  }
  function startDemoTask(editorId: string | undefined, sourceIds: string[], results: DemoResult[], ratio = 'auto', previous = current.current, templateSource?: VideoCanvasMedia) {
    if (!results.length) return;
    const editor = [...previous.workflows.map(videoWorkflowBox), ...(previous.materialWorkflows ?? []).map(materialWorkflowBox), ...(previous.upscaleWorkflows ?? []).map(videoUpscaleWorkflowBox)].find(node => node.id === editorId);
    if (editorId && !editor) return;
    const id = crypto.randomUUID();
    const boundResults = results.map(result => ({ ...result, generatedByEditorId: editorId, generatedTaskId: id }));
    const source = sourceIds.map(sourceId => previous.images.find(image => image.id === sourceId && !image.generation)).find(Boolean) ?? templateSource;
    const size = demoPlaceholderSize(ratio, source);
    const placeholders: DemoResult[] = results.map(result => ({
      id: result.id, name: result.name, url: '', ...size,
      generatedByEditorId: editorId, generatedTaskId: id, generation: { taskId: id, status: 'running' },
    }));
    const task: DemoTaskRecord = { editorId, timer: null, status: 'running', results: boundResults };
    demoTaskRecords.current.set(id, task);
    setTasks(previous => [{ id, status: 'running', createdAt: new Date().toISOString(), resultIds: results.map(result => result.id) }, ...previous]);
    appendDemoPlaceholders(previous, editor, sourceIds, placeholders);
    task.timer = window.setTimeout(() => {
      if (task.status !== 'running') return;
      task.timer = null;
      const latest = current.current;
      const editorExists = !editorId || [...latest.workflows, ...(latest.materialWorkflows ?? []), ...(latest.upscaleWorkflows ?? [])].some(node => node.id === editorId);
      const slots = latest.images.filter(image => image.generation?.taskId === id);
      if (!editorExists || !slots.length) {
        task.status = 'failed'; replace(latest);
        setTasks(previousTasks => previousTasks.map(task => task.id === id ? { ...task, status: 'failed' } : task));
        return;
      }
      task.status = 'completed';
      // Retain canvas IDs and positions; finished videos use their actual
      // aspect ratio. Submission remains a single undo operation.
      replace(latest);
      const thumbnailUrl = results.find(result => result.id === slots[0].id)?.url;
      setTasks(previousTasks => previousTasks.map(task => task.id === id ? { ...task, status: 'completed', thumbnailUrl } : task));
    }, DEMO_TASK_DURATION);
  }
  async function generateVideoDemo(id: string) {
    const previous = current.current, node = previous.workflows.find(item => item.id === id);
    if (!activeRef.current || !node || !canGenerateVideoWorkflow(node)) return;
    if (pendingVideoExamples.current.has(id)) return;
    pendingVideoExamples.current.add(id);
    const epoch = uploadEpoch.current;
    try {
      const result = await createFashionVideoDemoResult(id, locale);
      const latest = current.current.workflows.find(item => item.id === id);
      if (!activeRef.current || epoch !== uploadEpoch.current || !latest || !canGenerateVideoWorkflow(latest)) return;
      startDemoTask(id, videoWorkflowSourceIds(latest), [result], latest.ratio);
    } catch {
      if (activeRef.current && epoch === uploadEpoch.current) notify(videoReferenceUploadMessages[locale].error, 'error');
    } finally {
      pendingVideoExamples.current.delete(id);
    }
  }
  async function generateTemplate(templateId: VideoTemplateId, replacements: VideoTemplateReplacements, signal: AbortSignal) {
    const template = videoTemplates.find(item => item.id === templateId);
    if (!activeRef.current || signal.aborted || !template?.workflow || !template.preview) return false;
    const epoch = uploadEpoch.current;
    const prepared = await prepareVideoTemplateGeneration(template, replacements, locale);
    if (signal.aborted || !activeRef.current || uploadEpoch.current !== epoch) return false;
    const source = prepared.images[0];
    startDemoTask(undefined, [], [prepared.result], prepared.workflow.ratio, current.current, source ? { ...source, x: 0, y: 0 } : undefined);
    requestAnimationFrame(() => { if (activeRef.current) canvas.current?.focus({ preventScroll: true }); });
    return true;
  }
  async function editTemplate(templateId: VideoTemplateId, replacements: VideoTemplateReplacements, signal: AbortSignal) {
    const template = videoTemplates.find(item => item.id === templateId);
    if (!activeRef.current || signal.aborted || !template?.workflow || !template.preview) return false;
    const epoch = uploadEpoch.current;
    const prepared = await prepareVideoTemplateGeneration(template, replacements, locale, false);
    if (signal.aborted || !activeRef.current || uploadEpoch.current !== epoch) return false;
    // Editing materializes the existing template, without submitting a task.
    const previous = current.current;
    const images: VideoCanvasMedia[] = prepared.images.map(image => ({ ...image, x: 0, y: 0 }));
    const workflow = prepared.workflow;
    images.push({ ...sizeVideoCanvasMedia(prepared.result), x: 0, y: 0 });
    const positions = arrangeVideoWorkflowMedia(images, [workflow]);
    const bounds = boundsOf(sceneItems(previous));
    const offset = bounds ? { x: bounds.x + bounds.width + 240, y: bounds.y } : { x: 0, y: 0 };
    const position = <T extends { id: string; x: number; y: number }>(item: T): T => {
      const point = positions.get(item.id) ?? item;
      return { ...item, x: point.x + offset.x, y: point.y + offset.y };
    };
    const staged: Snapshot = { ...previous,
      images: [...previous.images, ...images.map(position)],
      workflows: [...previous.workflows, position(workflow)], selected: [workflow.id],
    };
    commit(staged);
    if (canvas.current) animateView(fitImages([...images.map(position), videoWorkflowBox(position(workflow))], canvas.current.clientWidth, canvas.current.clientHeight));
    requestAnimationFrame(() => { if (activeRef.current) canvas.current?.focus({ preventScroll: true }); });
    return true;
  }
  async function generateMaterialDemo(id: string) {
    const previous = current.current, node = previous.materialWorkflows?.find(item => item.id === id);
    if (!activeRef.current || !node || !canGenerateMaterialWorkflow(node)) return;
    if (node.kind !== 'gridSplit') {
      const results = createMaterialDemoResults(node, locale);
      const ratio = node.kind === 'storyboard' ? `${results[0].naturalWidth}:${results[0].naturalHeight}` : node.ratio;
      startDemoTask(node.id, materialWorkflowSourceIds(node), results, ratio);
      return;
    }
    if (pendingGridCrops.current.has(id)) return;
    pendingGridCrops.current.add(id);
    const epoch = uploadEpoch.current;
    try {
      const results = await cropMaterialGrid(node, locale);
      const latest = current.current.materialWorkflows?.find(item => item.id === id);
      if (!activeRef.current || epoch !== uploadEpoch.current || !latest || latest.grid !== node.grid
        || latest.references[0]?.id !== node.references[0]?.id) {
        results.forEach(result => URL.revokeObjectURL(result.url));
        return;
      }
      results.forEach(result => ownedUrls.current.add(result.url));
      const first = results[0];
      startDemoTask(id, materialWorkflowSourceIds(latest), results, `${first.naturalWidth}:${first.naturalHeight}`);
    } catch {
      if (activeRef.current && epoch === uploadEpoch.current) notify(locale === 'zh-CN' ? '图片裁切失败，请重新选择参考图。'
        : locale === 'ja' ? '画像を分割できませんでした。参照画像を選び直してください。' : 'Unable to crop the image. Please select the reference again.', 'error');
    } finally {
      pendingGridCrops.current.delete(id);
    }
  }
  function generateUpscaleDemo(id: string) {
    const previous = current.current, node = previous.upscaleWorkflows?.find(item => item.id === id);
    if (!activeRef.current || !node || !canGenerateVideoUpscaleWorkflow(node)) return;
    startDemoTask(node.id, videoUpscaleWorkflowSourceIds(node), [createVideoDemoResult(node.id, locale)]);
  }
  function openMaterialReference(id: string, field: MaterialWorkflowUpload['field']) {
    const node = current.current.materialWorkflows?.find(item => item.id === id);
    if (!node || !activeRef.current) return;
    if (field === 'back' && !materialWorkflowHasBackView(node)) return;
    if (field === 'references' && node.references.length >= materialReferenceLimit(node.kind)) return;
    setWorkflowUpload({ editor: 'material', id, field, kind: 'image' });
  }
  function referenceCapacityAvailable(node: VideoWorkflow, kind: VideoReference['kind']) {
    if (videoWorkflowReferences(node).filter(reference => reference.kind === kind).length < videoReferenceLimits[kind]) return true;
    notify(locale === 'zh-CN' ? (kind === 'image' ? '参考图最多9张（包含继承主图）。' : '参考视频最多3个。')
      : locale === 'ja' ? (kind === 'image' ? '参照画像はメイン画像を含め9枚までです。' : '参照動画は3本までです。')
      : kind === 'image' ? 'Use up to 9 reference images, including the inherited main image.' : 'Use up to 3 reference videos.', 'error');
    return false;
  }
  function openWorkflowReference(id: string, kind: VideoReference['kind']) {
    const node = current.current.workflows.find(item => item.id === id);
    if (!node || !activeRef.current) return;
    if (node.mode === 'frames') {
      if (kind === 'image') setWorkflowUpload({ id, field: 'endFrame', kind });
    } else if (referenceCapacityAvailable(node, kind)) setWorkflowUpload({ id, field: 'references', kind });
  }
  function placeWorkflowMedia(node: CanvasImage, media: Omit<VideoCanvasMedia, 'x' | 'y'>, previous: Snapshot = current.current) {
    // Every confirmed image selection creates its own canvas instance.
    // Videos retain URL reuse; their canvas URL is only a poster.
    let source = media.video ? previous.images.find(item => item.video?.url === media.video!.url) : undefined;
    let images = previous.images;
    if (!source) {
      source = { ...media, id: crypto.randomUUID(), role: undefined,
        x: node.x - 80 - media.width, y: node.y + (node.height - media.height) / 2 };
      const scene = sceneItems(previous);
      // Stack new inputs in the editor's left column without moving existing assets.
      let overlaps: CanvasImage[];
      while ((overlaps = scene.filter(item => source!.x < item.x + item.width + 40 && source!.x + source!.width + 40 > item.x && source!.y < item.y + item.height + 40 && source!.y + source!.height + 40 > item.y)).length) {
        source.y = Math.max(...overlaps.map(item => item.y + item.height)) + 40;
      }
      images = [...images, source];
    }
    return { images, source };
  }
  function attachWorkflowMedia(node: VideoWorkflow, field: VideoWorkflowUpload['field'], media: Omit<VideoCanvasMedia, 'x' | 'y'>, reference: VideoReference) {
    const previous = current.current;
    const { images, source } = placeWorkflowMedia(videoWorkflowBox(node), media);
    const bound = { ...reference, sourceImageId: source.id };
    const updated: VideoWorkflow = field === 'main' ? { ...node, main: { ...bound, id: source.id } }
      : field === 'endFrame' ? { ...node, endFrame: bound }
      : { ...node, references: [...node.references, bound] };
    // Media creation and binding share one snapshot, including undo/redo.
    commit({ ...previous, images, workflows: previous.workflows.map(item => item.id === node.id ? updated : item) });
    setWorkflowUpload(null);
    if (canvas.current) {
      const sourceIds = new Set(videoWorkflowSourceIds(updated));
      animateView(fitImages([...images.filter(item => sourceIds.has(item.id)), videoWorkflowBox(updated)], canvas.current.clientWidth, canvas.current.clientHeight));
    }
  }
  function referenceImageUploadLimitMessage(remaining: number) {
    return locale === 'zh-CN' ? `本次最多还能添加${remaining}张参考图。`
      : locale === 'ja' ? `参照画像はあと${remaining}枚追加できます。`
      : `You can add up to ${remaining} more reference images.`;
  }
  function applyMaterialWorkflowImages(uploaded: Omit<CanvasImage, 'x' | 'y'>[], expectedTarget: WorkflowUpload) {
    const target = workflowUploadRef.current;
    if (target?.editor !== 'material' || target !== expectedTarget || !activeRef.current) return;
    const previous = current.current;
    const node = previous.materialWorkflows?.find(item => item.id === target.id);
    if (!node || target.field === 'back' && !materialWorkflowHasBackView(node)) {
      setWorkflowUpload(null); return;
    }
    const remaining = target.field === 'back' ? 1 : Math.max(0, materialReferenceLimit(node.kind) - node.references.length);
    // Deduplicate only this picker batch, not earlier selections of the same image.
    const urls = new Set<string>();
    const unique = uploaded.filter(image => {
      if (urls.has(image.url)) return false;
      urls.add(image.url);
      return true;
    });
    if (unique.length > remaining) { notify(referenceImageUploadLimitMessage(remaining), 'error'); return; }
    if (!unique.length) { setWorkflowUpload(null); return; }
    let staged = previous;
    let updated = node;
    for (const uploadedImage of unique) {
      const image = sizeVideoCanvasMedia(uploadedImage);
      const { images, source } = placeWorkflowMedia(materialWorkflowBox(node), image, staged);
      const reference: VideoReference = { id: crypto.randomUUID(), sourceImageId: source.id, name: image.name, url: image.url, kind: 'image' };
      updated = target.field === 'back' ? { ...updated, back: reference } : { ...updated, references: [...updated.references, reference] };
      staged = { ...staged, images };
    }
    // Place the entire batch before committing, so inputs avoid each other and undo together.
    commit({ ...staged, materialWorkflows: (previous.materialWorkflows ?? []).map(item => item.id === node.id ? updated : item) });
    setWorkflowUpload(null);
    if (canvas.current) {
      const sourceIds = new Set(materialWorkflowSourceIds(updated));
      animateView(fitImages([...staged.images.filter(item => sourceIds.has(item.id)), materialWorkflowBox(updated)], canvas.current.clientWidth, canvas.current.clientHeight));
    }
  }
  function applyVideoWorkflowImages(uploaded: Omit<CanvasImage, 'x' | 'y'>[], expectedTarget: WorkflowUpload) {
    const target = workflowUploadRef.current;
    if (!target || target !== expectedTarget || target.editor === 'material' || target.editor === 'upscale'
      || target.field !== 'references' || target.kind !== 'image' || !activeRef.current) return;
    const previous = current.current;
    const node = previous.workflows.find(item => item.id === target.id);
    if (!node || node.mode !== 'references') { setWorkflowUpload(null); return; }
    const remaining = Math.max(0, videoReferenceLimits.image - videoWorkflowReferences(node).filter(reference => reference.kind === 'image').length);
    // Deduplicate this confirmation only; earlier selections retain independent canvas instances.
    const urls = new Set<string>();
    const unique = uploaded.filter(image => {
      if (urls.has(image.url)) return false;
      urls.add(image.url);
      return true;
    });
    if (unique.length > remaining) { notify(referenceImageUploadLimitMessage(remaining), 'error'); return; }
    if (!unique.length) { setWorkflowUpload(null); return; }
    let staged = previous;
    let updated = node;
    for (const uploadedImage of unique) {
      const image = sizeVideoCanvasMedia(uploadedImage);
      const { images, source } = placeWorkflowMedia(videoWorkflowBox(node), image, staged);
      const reference: VideoReference = { id: crypto.randomUUID(), sourceImageId: source.id, name: image.name, url: image.url, kind: 'image' };
      updated = { ...updated, references: [...updated.references, reference] };
      staged = { ...staged, images };
    }
    // Create and bind the entire selection in one undoable change.
    commit({ ...staged, workflows: previous.workflows.map(item => item.id === node.id ? updated : item) });
    setWorkflowUpload(null);
    if (canvas.current) {
      const sourceIds = new Set(videoWorkflowSourceIds(updated));
      animateView(fitImages([...staged.images.filter(item => sourceIds.has(item.id)), videoWorkflowBox(updated)], canvas.current.clientWidth, canvas.current.clientHeight));
    }
  }
  function applyWorkflowImage(uploaded: Omit<CanvasImage, 'x' | 'y'>, expectedTarget: WorkflowUpload) {
    const target = workflowUploadRef.current;
    if (target?.editor === 'upscale') return;
    if (target?.editor === 'material') {
      applyMaterialWorkflowImages([uploaded], expectedTarget);
      return;
    }
    const image = sizeVideoCanvasMedia(uploaded);
    const node = target && current.current.workflows.find(item => item.id === target.id);
    if (!target || target !== expectedTarget || target.kind !== 'image' || !node || !activeRef.current) return;
    if ((target.field === 'references') !== (node.mode === 'references')) { setWorkflowUpload(null); return; }
    if (target.field === 'references') {
      if (!referenceCapacityAvailable(node, 'image')) { setWorkflowUpload(null); return; }
    }
    const reference: VideoReference = { id: crypto.randomUUID(), name: image.name, url: image.url, kind: 'image' };
    attachWorkflowMedia(node, target.field, image, reference);
  }
  function applyWorkflowVideo(reference: UploadedVideo, expectedTarget: WorkflowUpload) {
    const target = workflowUploadRef.current;
    const discardUnowned = () => { if (!ownedUrls.current.has(reference.url)) URL.revokeObjectURL(reference.url); };
    if (target?.editor === 'upscale') {
      const previous = current.current;
      const node = previous.upscaleWorkflows?.find(item => item.id === target.id);
      if (target !== expectedTarget || !node || !activeRef.current) { discardUnowned(); return; }
      rememberVideo(reference);
      const { images, source } = placeWorkflowMedia(videoUpscaleWorkflowBox(node), prepareVideoCanvasMedia(reference));
      const updated = { ...node, video: { ...reference, sourceImageId: source.id } };
      commit({ ...previous, images, upscaleWorkflows: (previous.upscaleWorkflows ?? []).map(item => item.id === node.id ? updated : item) });
      setWorkflowUpload(null);
      if (canvas.current) animateView(fitImages([source, videoUpscaleWorkflowBox(updated)], canvas.current.clientWidth, canvas.current.clientHeight));
      return;
    }
    const node = target?.editor !== 'material' && target?.field === 'references' && target.kind === 'video' && target === expectedTarget && current.current.workflows.find(item => item.id === target.id);
    if (!node || node.mode !== 'references' || reference.kind !== 'video' || !activeRef.current) { discardUnowned(); return; }
    if (videoWorkflowReferences(node).some(item => item.url === reference.url)) { discardUnowned(); setWorkflowUpload(null); return; }
    if (!referenceCapacityAvailable(node, 'video')) { discardUnowned(); setWorkflowUpload(null); return; }
    rememberVideo(reference);
    attachWorkflowMedia(node, 'references', prepareVideoCanvasMedia(reference), { ...reference, id: crypto.randomUUID() });
  }
  async function previewReference(reference: VideoReference) {
    const request = ++previewEpoch.current;
    if (reference.kind === 'video') { setVideoPreview(reference); return; }
    try {
      const image = await prepareMainImage(reference);
      if (activeRef.current && request === previewEpoch.current) setPreview({ ...image, x: 0, y: 0 });
    } catch { notify(t.uploadError, 'error'); }
  }
  function arrangeScene() {
    const previous = current.current;
    const positions = arrangeVideoWorkflowMedia(previous.images, previous.workflows, previous.materialWorkflows, previous.upscaleWorkflows, previous.layout);
    commit({ ...previous, images: previous.images.map(image => ({ ...image, ...positions.get(image.id)! })), workflows: previous.workflows.map(node => ({ ...node, ...positions.get(node.id)! })),
      materialWorkflows: (previous.materialWorkflows ?? []).map(node => ({ ...node, ...positions.get(node.id)! })),
      upscaleWorkflows: (previous.upscaleWorkflows ?? []).map(node => ({ ...node, ...positions.get(node.id)! })) });
    fit();
  }
  async function downloadSelected(format: DownloadFormat) {
    if (downloadLocked.current) return;
    const source = current.current.images.find(image => current.current.selected.includes(image.id));
    if (!source || source.video || source.generation) return;
    downloadLocked.current = true; setDownloading(true);
    try {
      const image = new Image();
      image.crossOrigin = 'anonymous'; image.src = source.url;
      await image.decode();
      await exportImage(image, source.name, format);
    } catch (error) {
      const unsupported = locale === 'zh-CN' ? '当前浏览器不支持此格式导出，请选择其他格式。' : locale === 'ja' ? 'このブラウザーはこの形式での書き出しに対応していません。別の形式を選んでください。' : 'This browser cannot export this format. Please choose another format.';
      notify(error instanceof ImageExportError && error.reason === 'unsupported' ? unsupported : t.downloadError, 'error');
    } finally { downloadLocked.current = false; setDownloading(false); }
  }
  function downloadSelectedVideo() {
    const source = current.current.images.find(image => current.current.selected.includes(image.id));
    if (!source?.video || source.generation) return;
    const link = document.createElement('a');
    link.href = source.video.url; link.download = source.video.name;
    document.body.appendChild(link); link.click(); link.remove();
  }
  async function downloadMultiSelection() {
    if (downloadLocked.current) return;
    const selection = videoMultiSelection(current.current.images, current.current.selected);
    if (!selection) return;
    downloadLocked.current = true; setDownloading(true);
    try {
      await downloadImages(selection.media.map((source, index) => ({
        url: source.video?.url ?? source.url,
        // Prefix every item to retain repeated filenames as distinct ZIP entries.
        name: `${index + 1}-${(source.video?.name ?? source.name).replace(/[\\/]/g, '_')}`,
      })), 'lightchain-assets.zip');
    } catch {
      notify(t.downloadError, 'error');
    } finally { downloadLocked.current = false; setDownloading(false); }
  }
  function zoom(factor: number, animated = false) {
    const element = canvas.current;
    if (!element) return;
    const value = viewRef.current;
    const target = Math.max(.03, Math.min(2, value.zoom * factor));
    const next = zoomAt(value, target / value.zoom, element.clientWidth / 2, element.clientHeight / 2);
    if (animated) animateView(next); else setView(next);
  }

  const materialUploadNode = shownWorkflowUpload.value?.editor === 'material' && shownWorkflowUpload.value.field === 'references'
    ? snapshot.materialWorkflows?.find(node => node.id === shownWorkflowUpload.value!.id) : undefined;
  const materialBatchUpload = !!materialUploadNode && materialReferenceLimit(materialUploadNode.kind) > 1;
  const materialUploadRemaining = materialUploadNode ? Math.max(0, materialReferenceLimit(materialUploadNode.kind) - materialUploadNode.references.length) : undefined;
  const imageUploadTarget = shownWorkflowUpload.value;
  const videoImageUploadNode = imageUploadTarget && imageUploadTarget.editor !== 'material' && imageUploadTarget.editor !== 'upscale'
    && imageUploadTarget.field === 'references' && imageUploadTarget.kind === 'image'
    ? snapshot.workflows.find(node => node.id === imageUploadTarget.id && node.mode === 'references') : undefined;
  const imageBatchUpload = materialBatchUpload || !!videoImageUploadNode;
  const imageUploadRemaining = videoImageUploadNode
    ? Math.max(0, videoReferenceLimits.image - videoWorkflowReferences(videoImageUploadNode).filter(reference => reference.kind === 'image').length)
    : materialUploadRemaining;


  return <>
    <main ref={canvas} hidden={!active} inert={!active} tabIndex={-1} lang={locale} className={`canvas video-workspace${items.length ? '' : ' video-workspace--empty'}${spaceDown || mode === 'hand' ? ' is-panning' : ''}${dragging ? ' is-dragging' : ''}`} aria-label={v.title} data-node-id={items.length ? '76:5683' : '64:2057'}
      onContextMenu={event => {
        if (!active || reading || shownModal.value || shownPreview.value || shownCutout.value || shownWorkflowUpload.value || shownVideoPreview.value || !(event.target instanceof Element) || event.target.closest('[data-overlay], [data-image], .fusion-position, .selection-overlay, .react-flow__handle, .react-flow__edge')) return;
        event.preventDefault();
        setDragging(false); setSelecting(false); setGuides(null);
        const rect = event.currentTarget.getBoundingClientRect(), viewport = viewRef.current;
        document.dispatchEvent(new CustomEvent('lc-select-open', { detail: 'canvas-context' }));
        setCanvasMenu({ x: event.clientX, y: event.clientY, worldX: (event.clientX - rect.left - viewport.x) / viewport.zoom, worldY: (event.clientY - rect.top - viewport.y) / viewport.zoom });
      }}
      onDragOver={event => { if (active && !modal && !preview && !cutout && !workflowUpload && !videoPreview && event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDropActive(true); } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false); }} onDrop={drop}>
      <CanvasBackground view={view} />
      <CanvasProjectPanel title={v.title} icon={<span className="video-workspace-mark"><img src={videoAssets.workspacePlate} alt="" width={20} height={20} /><img src={videoAssets.workspaceIcon} alt="" width={20} height={20} /></span>} projectName={projectName} onProjectNameChange={setProjectName} onBack={onBack} backLabel={v.back} renameLabel={t.rename} nameLabel={t.projectName} nodeId="64:2058" />
      {!items.length && <div className="video-empty-scroll">
        <section className="video-empty" data-overlay data-node-id="64:2059">
          <div className="video-empty-headline" data-node-id="64:4159"><h1>{v.headline}</h1><p>{v.intro}</p></div>
          <div className="video-entry-tools" role="group" aria-label={v.title} data-node-id="64:2061">
            {entries.map(entry => <Button key={entry.id} variant="outline" size="l" className="video-entry-tool" disabled={reading} data-node-id={entry.nodeId}
              onClick={() => {
                if (entry.id === 'templates') setModal('templates');
                else if (entry.id === 'quickImage') addMaterialWorkflow('quick');
                else if (entry.id === 'storyboardImage') addMaterialWorkflow('storyboard');
                else if (entry.id === 'fashionVideo') addWorkflow();
                else if (entry.id === 'proFashionVideo') addWorkflow(undefined, 'references');
                else notify(v.pending);
              }}>
              <VideoIcon name={entry.icon} size={24} /><span>{v[entry.label]}</span>{entry.id === 'templates' && <span className="entry-tool-badge video-entry-badge" data-node-id="64:2066">NEW</span>}
            </Button>)}
          </div>
          <button type="button" className={`asset-upload video-upload${dropActive ? ' is-over' : ''}`} disabled={reading} aria-label={m.add} onClick={openAssets} data-node-id="64:2068"
            onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.stopPropagation(); setDropActive(true); } }} onDrop={drop}>
            <VideoIcon name="entryUpload" size={32} />
            <span className="asset-upload-title">{reading ? t.reading : dropActive ? m.drop : m.add}</span>
            <span className="asset-upload-hint">{dropActive && !reading ? t.releaseToUpload : videoReferenceUploadMessages[locale].hint}</span>
          </button>
        </section>
      </div>}
      {active && items.length > 0 && <>
        <ReactFlowCanvas view={view} selectedIds={snapshot.selected} hand={effectiveMode === 'hand'} spacePanControlled referenceMode={false} snap={snapToGrid}
          onView={setView} onSelection={ids => replace({ ...current.current, selected: ids })}
          onPositions={positions => replace({ ...current.current, images: current.current.images.map(image => positions.has(image.id) ? { ...image, ...positions.get(image.id)! } : image), workflows: current.current.workflows.map(node => positions.has(node.id) ? { ...node, ...positions.get(node.id)! } : node),
            materialWorkflows: (current.current.materialWorkflows ?? []).map(node => positions.has(node.id) ? { ...node, ...positions.get(node.id)! } : node),
            upscaleWorkflows: (current.current.upscaleWorkflows ?? []).map(node => positions.has(node.id) ? { ...node, ...positions.get(node.id)! } : node) })}
          onDragStart={() => { saveUndo(); setDragging(true); }} onDragEnd={() => { setDragging(false); setGuides(null); }} onGuides={setGuides} onSelecting={setSelecting}>
          {snapshot.images.map(image => <div key={image.id} data-image data-canvas-id={image.id} data-node-id={image.video ? '97:6651' : undefined} className={`canvas-image${image.video ? ' canvas-video' : ''}${snapshot.selected.includes(image.id) ? ' selected' : ''}`} style={{ left: image.x, top: image.y, width: image.width, height: image.height }} role="button" tabIndex={0} aria-label={`${image.video ? m.video : t.image}: ${image.name}`} aria-pressed={snapshot.selected.includes(image.id)}
            onContextMenu={event => {
              event.preventDefault(); event.stopPropagation();
              if (image.generation) return;
              if (!active || reading || !canvas.current || shownModal.value || shownPreview.value || shownCutout.value || shownWorkflowUpload.value || shownVideoPreview.value) return;
              const selected = current.current.selected.includes(image.id) ? current.current.selected.filter(id => current.current.images.some(item => item.id === id)) : [image.id];
              replace({ ...current.current, selected });
              setDragging(false); setSelecting(false); setGuides(null);
              const rect = canvas.current.getBoundingClientRect(), viewport = viewRef.current;
              document.dispatchEvent(new CustomEvent('lc-select-open', { detail: 'canvas-context' }));
              setCanvasMenu({ kind: 'image', x: event.clientX, y: event.clientY, worldX: (event.clientX - rect.left - viewport.x) / viewport.zoom, worldY: (event.clientY - rect.top - viewport.y) / viewport.zoom });
            }}
            onKeyDown={event => { if (event.target === event.currentTarget && event.key === 'Enter') { event.preventDefault(); replace({ ...current.current, selected: event.shiftKey ? current.current.selected.includes(image.id) ? current.current.selected.filter(id => id !== image.id) : [...current.current.selected, image.id] : [image.id] }); } }}>
            {image.generation ? <CanvasGenerationPlaceholder locale={locale} failed={image.generation.status === 'failed'} /> : <>
            {image.video ? <Button variant="tonal" className="image-preview-button video-canvas-play nodrag nopan" title={m.play} aria-label={`${m.play} · ${image.name}`} data-node-id="97:6653" onClick={event => { event.stopPropagation(); setVideoPreview(image.video!); }}><VideoIcon name="playVideo" size={20} /></Button>
              : <Button variant="tonal" className="image-preview-button nodrag nopan" title={t.viewFull} aria-label={`${t.viewFull} · ${image.name}`} onClick={event => { event.stopPropagation(); setPreview(image); }}><Icon name="viewFull" size={20} /></Button>}
            <ProgressiveImage src={image.url} alt={image.name} width={image.width} height={image.height} fit="cover" />
            </>}
          </div>)}
          {snapshot.workflows.flatMap(node => videoWorkflowSourceIds(node).map(sourceId => {
            const source = snapshot.images.find(image => image.id === sourceId);
            return source ? <ImageConnection key={`${source.id}-${node.id}`} image={source} target={videoWorkflowBox(node)} active={snapshot.selected.includes(source.id) || snapshot.selected.includes(node.id)} zoom={view.zoom} /> : null;
          }))}
          {snapshot.images.map(result => {
            const editor = result.generatedByEditorId ? items.find(item => item.id === result.generatedByEditorId) : undefined;
            return editor ? <ImageConnection key={`${editor.id}-${result.id}`} image={editor} target={result} active={snapshot.selected.includes(editor.id) || snapshot.selected.includes(result.id)} zoom={view.zoom} /> : null;
          })}
          {snapshot.workflows.map(node => <div key={node.id} data-canvas-id={node.id} className="fusion-position video-workflow-position" data-selected={snapshot.selected.includes(node.id)} style={{ left: node.x, top: node.y, ...videoWorkflowSize(node) }} role="group" tabIndex={0} aria-label={node.mode === 'references' ? v.proFashionVideo : v.fashionVideo}
            onKeyDown={event => { if (event.target === event.currentTarget && event.key === 'Enter') { event.preventDefault(); replace({ ...current.current, selected: [node.id] }); } }}>
            <VideoWorkflowNode node={node} locale={locale} onChange={patch => updateWorkflow(node.id, patch)} onMain={() => setWorkflowUpload({ id: node.id, field: 'main', kind: 'image' })}
              onReference={kind => openWorkflowReference(node.id, kind)} onPreview={reference => void previewReference(reference)}
              onGenerate={() => generateVideoDemo(node.id)} />
          </div>)}
          {(snapshot.materialWorkflows ?? []).flatMap(node => materialWorkflowSourceIds(node).map(sourceId => {
            const source = snapshot.images.find(image => image.id === sourceId);
            return source ? <ImageConnection key={`${source.id}-${node.id}`} image={source} target={materialWorkflowBox(node)} active={snapshot.selected.includes(source.id) || snapshot.selected.includes(node.id)} zoom={view.zoom} /> : null;
          }))}
          {(snapshot.materialWorkflows ?? []).map(node => <div key={node.id} data-canvas-id={node.id} className="fusion-position video-workflow-position material-workflow-position" data-selected={snapshot.selected.includes(node.id)} style={{ left: node.x, top: node.y, ...materialWorkflowSize(node) }} role="group" tabIndex={0} aria-label={materialWorkflowTitle(node.kind, locale)}
            onKeyDown={event => { if (event.target === event.currentTarget && event.key === 'Enter') { event.preventDefault(); replace({ ...current.current, selected: [node.id] }); } }}>
            <MaterialWorkflowNode node={node} locale={locale} onChange={patch => updateMaterialWorkflow(node.id, patch)} onReference={field => openMaterialReference(node.id, field)} onPreview={reference => void previewReference(reference)}
              onGenerate={() => generateMaterialDemo(node.id)} />
          </div>)}
          {(snapshot.upscaleWorkflows ?? []).flatMap(node => videoUpscaleWorkflowSourceIds(node).map(sourceId => {
            const source = snapshot.images.find(image => image.id === sourceId);
            return source ? <ImageConnection key={`${source.id}-${node.id}`} image={source} target={videoUpscaleWorkflowBox(node)} active={snapshot.selected.includes(source.id) || snapshot.selected.includes(node.id)} zoom={view.zoom} /> : null;
          }))}
          {(snapshot.upscaleWorkflows ?? []).map(node => <div key={node.id} data-canvas-id={node.id} className="fusion-position video-workflow-position video-upscale-position" data-selected={snapshot.selected.includes(node.id)} style={{ left: node.x, top: node.y, ...videoUpscaleWorkflowSize() }} role="group" tabIndex={0} aria-label={c.upscale}
            onKeyDown={event => { if (event.target === event.currentTarget && event.key === 'Enter') { event.preventDefault(); replace({ ...current.current, selected: [node.id] }); } }}>
            <VideoUpscaleWorkflowNode node={node} locale={locale} onChange={patch => updateUpscaleWorkflow(node.id, patch)}
              onUpload={() => setWorkflowUpload({ editor: 'upscale', id: node.id, field: 'video', kind: 'video' })} onPreview={video => setVideoPreview(video)}
              onGenerate={() => generateUpscaleDemo(node.id)} />
          </div>)}
        </ReactFlowCanvas>
        {shownSingle.value && !selecting && <div className="selection-overlay" data-phase={shownSingle.phase} aria-label={t.selectionTools} style={{ left: shownSingle.value.x * view.zoom + view.x, top: shownSingle.value.y * view.zoom + view.y, width: shownSingle.value.width * view.zoom, height: shownSingle.value.height * view.zoom }}>
          <div className="media-toolbar-anchor" data-overlay inert={shownSingle.phase === 'exit'}>
            {shownSingle.value.video ? <VideoAssetToolbar key={shownSingle.value.id} locale={locale} onDownload={downloadSelectedVideo}
              onRemake={() => notify(locale === 'zh-CN' ? '视频复刻功能暂未接入。' : locale === 'ja' ? '動画再現はまだ接続されていません。' : 'Video remake is not connected yet.')}
              onModify={() => notify(locale === 'zh-CN' ? '视频修改功能暂未接入。' : locale === 'ja' ? '動画編集はまだ接続されていません。' : 'Video editing is not connected yet.')}
              onHD={() => { if (shownSingle.value) addUpscaleWorkflow(shownSingle.value.id); }}
              onSave={() => notify(locale === 'zh-CN' ? '保存到资产功能暂未接入。' : locale === 'ja' ? '素材への保存はまだ接続されていません。' : 'Saving to assets is not connected yet.')} />
              : <VideoSelectionToolbar key={shownSingle.value.id} locale={locale} downloading={downloading} onDownload={format => void downloadSelected(format)} onAction={action => {
              const source = current.current.images.find(image => image.id === shownSingle.value?.id && !image.video && !image.generation);
              if (!source) return;
              if (action === 'cutout') setCutout(source);
              else if (action === 'fashionVideo') addWorkflow(source.id);
              else if (action === 'multiReference') addWorkflow(source.id, 'references');
              else if (action === 'quickEdit') addMaterialWorkflow('quick', source.id);
              else if (action === 'multiView') addMaterialWorkflow('multiView', source.id);
              else if (action === 'storyboardImage') addMaterialWorkflow('storyboard', source.id);
              else if (action === 'gridSplit') addMaterialWorkflow('gridSplit', source.id);
              else notify(locale === 'zh-CN' ? '此功能暂未接入。' : locale === 'ja' ? 'この機能はまだ接続されていません。' : 'This feature is not connected yet.');
            }} />}
          </div>
        </div>}
        {shownGroup.value && !selecting && <div className="selection-overlay" data-phase={shownGroup.phase} aria-label={t.groupSelection} style={{ left: shownGroup.value.x * view.zoom + view.x, top: shownGroup.value.y * view.zoom + view.y, width: shownGroup.value.width * view.zoom, height: shownGroup.value.height * view.zoom }}>
          <div className="group-selection-frame" />
          {multiSelection && <div className="media-toolbar-anchor" data-overlay inert={shownGroup.phase === 'exit'}>
            <VideoMultiSelectionToolbar locale={locale} selection={multiSelection} downloading={downloading}
              onAction={addMultiSelectionWorkflow} onDownload={() => void downloadMultiSelection()} />
          </div>}
        </div>}
        {shownGuides.value && <div className="canvas-snap-guides" aria-hidden="true" data-phase={shownGuides.phase}>
          {shownGuides.value.x !== undefined && <span className="canvas-snap-guide canvas-snap-guide--vertical" style={{ left: shownGuides.value.x * view.zoom + view.x }} />}
          {shownGuides.value.y !== undefined && <span className="canvas-snap-guide canvas-snap-guide--horizontal" style={{ top: shownGuides.value.y * view.zoom + view.y }} />}
        </div>}
      <CanvasChrome locale={locale} mode={effectiveMode} onMode={setMode} zoom={view.zoom} view={view} canvasSize={canvasSize} images={items} tasks={tasks} showSmartSearch={false}
          taskListNodeId="165:30270" onSelectTask={focusTaskResults} canSelectTask={task => taskResults(task).length > 0}
          sideActions={<>
            <Button className="canvas-icon-button" aria-label={t.platformAssets} onClick={openAssets}><Icon name="platformIcon" size={24} /></Button>
            <Button className="canvas-icon-button" aria-label={v.videoTemplates} title={v.videoTemplates} onClick={() => setModal('templates')}><VideoIcon name="templates" size={24} /></Button>
          </>}
          snapToGrid={snapToGrid} onToggleSnap={() => { setGuides(null); setSnapToGrid(previous => { try { localStorage.setItem('lc-v56-video-grid-snap', previous ? 'off' : 'on'); } catch { /* Session state remains available. */ } return !previous; }); }}
          onNavigateMinimap={(x, y) => setView(previous => ({ ...previous, x: canvasSize.width / 2 - x * previous.zoom, y: canvasSize.height / 2 - y * previous.zoom }))} onMinimapInteraction={setDragging}
          canUndo={history.current.past.length > 0} canRedo={history.current.future.length > 0} onUndo={undo} onRedo={redo} onUpload={openAssets} onZoom={zoom} onFit={fit}
          onArrange={arrangeScene}
          onHelp={() => setModal('help')} onDemo={() => notify(v.pending)} />
        {shownReturn.value && <div className="canvas-return-hint" data-overlay data-phase={shownReturn.phase} inert={shownReturn.phase === 'exit'}><p>{t.noNodesInView}</p><Button variant="primary" onClick={fit}>{t.returnToNodes}</Button></div>}
      </>}
      {shownDrop.value && <div className="drop-overlay flex items-center justify-center pointer-events-none" data-phase={shownDrop.phase}><span>{m.drop}</span></div>}
      {reading && items.length > 0 && <div className="canvas-message" role="status">{t.reading}</div>}
      <span className="sr-only" role="status">{snapshot.images.length} {m.materials} · {snapshot.selected.length} {t.selected}</span>
    </main>
    <CanvasContextMenu point={active ? canvasMenu : null} canPaste={canPaste} locale={locale} uploadLabel={c.upload} itemMenuLabel={locale === 'zh-CN' ? '素材菜单' : locale === 'ja' ? '素材メニュー' : 'Asset menu'} onClose={closeCanvasMenu} onUpload={openAssets}
      uploadIcon={<VideoIcon name="contextUpload" size={20} />} pasteIcon={<VideoIcon name="contextPaste" size={20} />}
      nodeId="159:27144" submenuIndicator={<VideoIcon name="contextChevron" size={16} />}
      groups={[
        { id: 'materials', label: c.materials, icon: <VideoIcon name="contextMaterial" size={20} />, nodeId: '159:27378', items: [
          { id: 'quick', label: v.quickImage, icon: <VideoIcon name="contextQuick" size={20} />, onSelect: () => addMaterialWorkflow('quick', undefined, canvasMenu ? { x: canvasMenu.worldX, y: canvasMenu.worldY } : undefined) },
          { id: 'multiView', label: c.multiView, icon: <VideoIcon name="contextMultiView" size={20} />, onSelect: () => addMaterialWorkflow('multiView', undefined, canvasMenu ? { x: canvasMenu.worldX, y: canvasMenu.worldY } : undefined) },
          { id: 'storyboard', label: v.storyboardImage, icon: <VideoIcon name="contextStoryboardImage" size={20} />, onSelect: () => addMaterialWorkflow('storyboard', undefined, canvasMenu ? { x: canvasMenu.worldX, y: canvasMenu.worldY } : undefined) },
          { id: 'gridSplit', label: c.gridSplit, icon: <VideoIcon name="contextGridSplit" size={20} />, onSelect: () => addMaterialWorkflow('gridSplit', undefined, canvasMenu ? { x: canvasMenu.worldX, y: canvasMenu.worldY } : undefined) },
        ] },
        { id: 'videos', label: c.videos, icon: <VideoIcon name="contextVideo" size={20} />, nodeId: '159:27502', items: [
          { id: 'fashion', label: v.fashionVideo, icon: <VideoIcon name="contextFashionVideo" size={20} />, onSelect: () => addWorkflow(undefined, 'frames', canvasMenu ? { x: canvasMenu.worldX, y: canvasMenu.worldY } : undefined) },
          { id: 'professional', label: v.proFashionVideo, icon: <VideoIcon name="contextProFashionVideo" size={20} />, onSelect: () => addWorkflow(undefined, 'references', canvasMenu ? { x: canvasMenu.worldX, y: canvasMenu.worldY } : undefined) },
          { id: 'storyboardVideo', label: c.storyboardVideo, icon: <VideoIcon name="contextStoryboardVideo" size={20} />, onSelect: () => notify(locale === 'zh-CN' ? '分镜成片功能暂未接入。' : locale === 'ja' ? '絵コンテから動画はまだ接続されていません。' : 'Storyboard to video is not connected yet.') },
          { id: 'remake', label: c.remake, icon: <VideoIcon name="contextRemake" size={20} />, onSelect: () => notify(locale === 'zh-CN' ? '视频复刻功能暂未接入。' : locale === 'ja' ? '動画再現はまだ接続されていません。' : 'Video remake is not connected yet.') },
        ] },
      ]}
      onCopy={() => { void copySelectedFromMenu(); }}
      onDuplicate={() => { duplicateSelected(); closeCanvasMenu(); }}
      onDelete={() => { removeSelected(); closeCanvasMenu(); }}
      onPaste={() => { if (canvasMenu) pasteCopiedItems({ x: canvasMenu.worldX, y: canvasMenu.worldY }); closeCanvasMenu(); }} />
    {active && shownModal.value === 'templates' && <VideoTemplateDialog locale={locale} onClose={closeModal} phase={shownModal.phase} uploads={uploads} onUpload={rememberUpload} onGenerate={generateTemplate} onEdit={editTemplate} />}
    {active && shownModal.value === 'assets' && <AssetPicker locale={locale} phase={shownModal.phase} uploads={uploads} videoUploads={uploadedVideos} onUpload={rememberUpload} onVideoUpload={rememberVideo} onConfirm={image => addMedia([image])} onConfirmMediaBatch={addMedia} limitMessage={m.limit} onClose={closeModal} />}
    {active && shownWorkflowUpload.value && <AssetPicker key={`${shownWorkflowUpload.value.id}-${shownWorkflowUpload.value.field}-${shownWorkflowUpload.value.kind}`} locale={locale} phase={shownWorkflowUpload.phase} uploads={snapshot.materialWorkflows?.some(node => node.id === shownWorkflowUpload.value!.id && node.kind === 'gridSplit') ? [gridCropExample, ...uploads] : uploads} onUpload={rememberUpload} onConfirm={image => applyWorkflowImage(image, shownWorkflowUpload.value!)} mediaKind={shownWorkflowUpload.value.kind}
      onConfirmBatch={materialBatchUpload ? images => applyMaterialWorkflowImages(images, shownWorkflowUpload.value!)
        : videoImageUploadNode ? images => applyVideoWorkflowImages(images, shownWorkflowUpload.value!) : undefined}
      maxCount={imageUploadRemaining} limitMessage={imageBatchUpload ? referenceImageUploadLimitMessage(imageUploadRemaining!) : undefined}
      excludedUrls={shownWorkflowUpload.value.kind === 'video' && shownWorkflowUpload.value.field === 'references'
        ? snapshot.workflows.filter(node => node.id === shownWorkflowUpload.value!.id).flatMap(node => videoWorkflowReferences(node).filter(reference => reference.kind === 'video').map(reference => reference.url)) : undefined}
      videoUploads={uploadedVideos} onConfirmVideo={shownWorkflowUpload.value.kind === 'video' ? reference => applyWorkflowVideo(reference, shownWorkflowUpload.value!) : undefined} onClose={() => setWorkflowUpload(null)} />}
    {active && shownModal.value === 'help' && <Dialog title={t.helpIntro} closeLabel={t.close} onClose={closeModal} phase={shownModal.phase}><p className="video-canvas-help">{v.help}</p><p className="video-canvas-help">{connectionHelp[locale]}</p></Dialog>}
    {active && shownPreview.value && <FullImageViewer image={shownPreview.value} locale={locale} phase={shownPreview.phase} onClose={() => setPreview(null)} />}
    {active && shownVideoPreview.value && <FullVideoViewer key={shownVideoPreview.value.url} video={shownVideoPreview.value} locale={locale} phase={shownVideoPreview.phase} onClose={() => setVideoPreview(null)} />}
    {active && shownCutout.value && <CutoutEditor key={shownCutout.value.id} image={shownCutout.value} phase={shownCutout.phase} onClose={() => setCutout(null)} onApply={url => {
      const source = shownCutout.value!;
      ownedUrls.current.add(url);
      const result: CanvasImage = { ...source, id: crypto.randomUUID(), name: `${source.name}-cutout.png`, url, x: source.x + source.width + 80 };
      commit({ ...current.current, images: [...current.current.images, result], selected: [result.id] });
      setCutout(null);
    }} />}
  </>;
}
