import type { CanvasImage } from './canvas';
import type { Locale } from './i18n';
import type { VideoReference } from './video-workflow';

export type MaterialWorkflowKind = 'quick' | 'multiView' | 'storyboard' | 'gridSplit';
export type MaterialView = 'front' | 'left45' | 'left' | 'right45' | 'right' | 'back';
export type MaterialWorkflow = {
  id: string;
  x: number;
  y: number;
  kind: MaterialWorkflowKind;
  references: VideoReference[];
  back?: VideoReference;
  // Keep legacy single selections readable in existing nodes and undo history.
  view: MaterialView[] | MaterialView;
  grid: 4 | 9;
  prompt: string;
  smartExpand: boolean;
  ratio: string;
  resolution: string;
  count: number;
};

const titles = {
  'zh-CN': { quick: '快捷生图', multiView: '多视角', storyboard: '分镜图', gridSplit: '宫格裁切' },
  en: { quick: 'Quick image', multiView: 'Multiple views', storyboard: 'Storyboard image', gridSplit: 'Grid crop' },
  ja: { quick: 'クイック画像生成', multiView: 'マルチビュー', storyboard: '絵コンテ', gridSplit: 'グリッド分割' },
};

export const materialWorkflowTitle = (kind: MaterialWorkflowKind, locale: Locale) => titles[locale][kind];
export const materialReferenceLimit = (kind: MaterialWorkflowKind) => kind === 'gridSplit' || kind === 'multiView' ? 1 : 9;

export function materialWorkflowViews(node: Pick<MaterialWorkflow, 'view'>): MaterialView[] {
  return Array.isArray(node.view) ? node.view : [node.view];
}

export function materialWorkflowHasBackView(node: Pick<MaterialWorkflow, 'kind' | 'view'>): boolean {
  return node.kind === 'multiView' && materialWorkflowViews(node).includes('back');
}

// These are editor sizes, not the surrounding Figma demonstration frames.
// Geometry is shared by React Flow, connections, fit, minimap and arrangement.
export function materialWorkflowSize(node: Pick<MaterialWorkflow, 'kind' | 'view'>) {
  const height = node.kind === 'multiView' ? (materialWorkflowHasBackView(node) ? 541 : 441)
    : node.kind === 'gridSplit' ? 329 : 533;
  return { width: 320, height };
}

export function canGenerateMaterialWorkflow(node: MaterialWorkflow): boolean {
  const requiresReferences = node.kind !== 'quick';
  const hasPrompt = node.kind === 'quick' || node.kind === 'storyboard';
  return (!requiresReferences || node.references.length > 0)
    && (node.kind !== 'multiView' || materialWorkflowViews(node).length > 0)
    && (!materialWorkflowHasBackView(node) || Boolean(node.back))
    && (!hasPrompt || Boolean(node.prompt.trim()));
}

export function createMaterialWorkflow(x: number, y: number, kind: MaterialWorkflowKind, source?: CanvasImage): MaterialWorkflow {
  return { id: crypto.randomUUID(), x, y, kind, view: ['front'], grid: 4, prompt: '', smartExpand: false,
    ratio: 'auto', resolution: '2K', count: 1,
    references: source ? [{ id: crypto.randomUUID(), sourceImageId: source.id, name: source.name, url: source.url, kind: 'image' }] : [] };
}

export function materialWorkflowSourceIds(node: MaterialWorkflow): string[] {
  const references = [...node.references, ...(materialWorkflowHasBackView(node) && node.back ? [node.back] : [])];
  return [...new Set(references.flatMap(reference => reference.sourceImageId ? [reference.sourceImageId] : []))];
}

// Clear inactive back-view input as well, so switching views never resurrects
// a reference to a deleted canvas image. Removing a slot keeps its canvas asset.
export function removeMaterialWorkflowSources(node: MaterialWorkflow, removed: ReadonlySet<string>): MaterialWorkflow {
  const references = node.references.filter(reference => !reference.sourceImageId || !removed.has(reference.sourceImageId));
  const back = node.back?.sourceImageId && removed.has(node.back.sourceImageId) ? undefined : node.back;
  return references.length === node.references.length && back === node.back ? node : { ...node, references, back };
}

export function materialWorkflowBox(node: MaterialWorkflow): CanvasImage {
  return { id: node.id, x: node.x, y: node.y, ...materialWorkflowSize(node),
    name: materialWorkflowTitle(node.kind, 'zh-CN'), url: node.references[0]?.url ?? '' };
}
