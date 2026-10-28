import { compactBox, type HierarchyData } from '@antv/hierarchy';
import { groupTaskBlocks } from './canvas-task-layout';
import { rememberImagePreview } from './image-previews';
import type { DrawingGuide } from './drawing-guide';
import { mergeGroupStages } from './canvas-merge-layout';
import { layoutConnectedGroup, type FlowLayoutVertex } from './canvas-connected-layout';
import { placeConnectedGroupStages, type ConnectedLayoutGroup } from './canvas-group-placement';
import { packStandaloneRows } from './canvas-standalone-layout';
import type { GeneratedMediaFile } from './canvas-media-filename';
import type { CanvasLayoutMetadata } from './canvas-layout-groups';
import { demoGenerationSettingsMemory, rememberedWorkflowKind } from './generation-settings-memory';
export type Viewport = { x: number; y: number; zoom: number };
export type FusionReference = { id: string; name: string; url: string; sourceImageId?: string };
export const MAX_FUSION_REFERENCES = 9;
export const MAX_BATCH_MAIN_IMAGES = 20;
export type WorkflowKind = 'fusion' | 'lingerie' | 'directed' | 'flat' | 'merge' | 'batch';
export type FlatRegion = 'top' | 'bottom' | 'full';
export type FlatFace = 'front' | 'back';
export type DirectedFusionPoint = { id: string; reference: FusionReference; maskPreviewUrl?: string; maskSourceUrl?: string };
export const MAX_DIRECTED_POINTS = 3;
export type FusionSettings = { kind?: WorkflowKind; position?: { x: number; y: number }; prompt: string; ratio: string; resolution: string; reference?: FusionReference; references?: FusionReference[]; mainImages?: FusionReference[]; directedPoints?: DirectedFusionPoint[]; flatRegion?: FlatRegion; flatFace?: FlatFace; batchFlat?: boolean; drawingGuide?: DrawingGuide };
export const fusionReferences = (settings?: FusionSettings): FusionReference[] => settings?.references ?? (settings?.reference ? [settings.reference] : []);
export const batchMainImages = (settings?: FusionSettings): FusionReference[] => settings?.mainImages ?? [];
export const workflowInputs = (settings?: FusionSettings): FusionReference[] => settings?.kind === 'batch' ? batchMainImages(settings) : fusionReferences(settings);
export const isMultiInputWorkflow = (settings?: FusionSettings) => settings?.kind === 'batch' || settings?.kind === 'merge' || (settings?.kind === 'flat' && settings.batchFlat === true);
export const workflowReferenceLimit = (settings?: FusionSettings) => settings?.batchFlat ? 20 : settings?.kind === 'lingerie' ? 1 : MAX_FUSION_REFERENCES;
export const defaultFusion = (kind: WorkflowKind = 'fusion'): FusionSettings => ({ kind, prompt: '', ratio: 'auto', resolution: '2K', ...(kind === 'batch' ? { mainImages: [], references: [] } : {}), ...(kind === 'directed' ? { directedPoints: [] } : {}), ...(kind === 'flat' ? { flatRegion: 'top', flatFace: 'front' } : {}) });
// Read preferences only for new nodes. Loading, copying, restoring and clearing
// existing nodes must keep the settings that belong to their snapshot.
export function newFusionSettings(kind: WorkflowKind = 'fusion'): FusionSettings {
  const settings = defaultFusion(kind);
  const memoryKind = rememberedWorkflowKind(kind);
  return memoryKind ? { ...settings, ...demoGenerationSettingsMemory.read(memoryKind, settings) } : settings;
}
export const FUSION_GAP = 80;
const BRANCH_GAP = 120;
export const GROUP_GAP = 240;
const GROUPS_PER_ROW = 5;
export const FUSION_WIDTH = 280;
export const workflowWidth = (settings?: FusionSettings) => settings?.kind === 'batch' ? 592 : FUSION_WIDTH;
// Shared action footer adds a 1px divider and 12px spacing above the button.
export const FUSION_HEIGHT = 592;
function referenceGridRows(settings?: FusionSettings) {
  const count = fusionReferences(settings).length;
  const slots = count + (count < workflowReferenceLimit(settings) ? 1 : 0);
  return Math.ceil(Math.max(1, slots) / 4);
}
// Directed: 354px including generation settings and the action footer,
// plus 129px card + 12px gap per point.
// The 56px add entry and its 12px gap disappear at the three-point limit.
export function workflowHeight(settings?: FusionSettings) {
  if (settings?.kind === 'batch') return 404;
  if (settings?.kind === 'merge') return 505 + (referenceGridRows(settings) - 1) * 64;
  if (settings?.kind === 'flat' && settings.batchFlat) {
    const count = fusionReferences(settings).length;
    const rows = Math.ceil(Math.max(1, count + (count < 20 ? 1 : 0)) / 4);
    return 401 + Math.min(208, rows * 64 - 8);
  }
  if (settings?.kind === 'flat') return 430;
  if (!settings?.kind || settings.kind === 'fusion') return FUSION_HEIGHT - 64 + Math.min(160, referenceGridRows(settings) * 64 - 8);
  if (settings?.kind !== 'directed') return FUSION_HEIGHT + (referenceGridRows(settings) - 1) * 72;
  const count = Math.min(MAX_DIRECTED_POINTS, settings.directedPoints?.length ?? 0);
  return 354 + count * 141 - (count === MAX_DIRECTED_POINTS ? 68 : 0);
}
export type CanvasImage = { id: string; name: string; url: string; generatedFile?: GeneratedMediaFile; projectCover?: boolean; coverOrder?: number; x: number; y: number; width: number; height: number; naturalWidth?: number; naturalHeight?: number; role?: 'main'; layoutTaskId?: string; layoutOriginOrder?: number; layoutMeta?: CanvasLayoutMetadata; nodeOnly?: boolean; editorSourceId?: string; generatedByEditorId?: string; generatedFromReferenceId?: string; generatedTaskId?: string; generation?: { taskId: string; status: 'running' | 'failed' }; sourceImageId?: string; fusion?: FusionSettings; operation?: 'cutout' | 'fusion' | 'directed' | 'lingerie' | 'flat' };
export const CANVAS_GRID_SIZE = 32;

export function workflowSources(items: CanvasImage[], editor: CanvasImage): CanvasImage[] {
  if (isMultiInputWorkflow(editor.fusion)) {
    const images = new Map(items.filter(item => !item.nodeOnly).map(item => [item.id, item]));
    const seen = new Set<string>();
    // A source ID is the connection identity. Asset URLs can change while the
    // same image remains connected; reference order is the input order.
    return workflowInputs(editor.fusion).flatMap(reference => {
      const source = reference.sourceImageId ? images.get(reference.sourceImageId) : undefined;
      if (!source || seen.has(source.id)) return [];
      seen.add(source.id);
      return [source];
    });
  }
  const id = editor.editorSourceId ?? (!editor.nodeOnly ? editor.id : undefined);
  return items.filter(item => !item.nodeOnly && item.id === id);
}

// An editor cannot consume its own downstream output, including indirect outputs.
export function isWorkflowDescendant(items: CanvasImage[], editorId: string, imageId: string): boolean {
  const reached = new Set([`${editorId}:fusion`]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      const source = item.sourceImageId ?? (item.generatedByEditorId ? `${item.generatedByEditorId}:fusion` : undefined);
      if (!item.nodeOnly && source && reached.has(source) && !reached.has(item.id)) { reached.add(item.id); changed = true; }
      const nodeId = `${item.id}:fusion`;
      if (item.fusion && !reached.has(nodeId) && workflowSources(items, item).some(input => reached.has(input.id))) { reached.add(nodeId); changed = true; }
    }
  }
  return reached.has(imageId);
}

export const DEFAULT_VIEW: Viewport = { x: 0, y: 0, zoom: 1 };
export function zoomAt(view: Viewport, factor: number, x: number, y: number): Viewport {
  const zoom = Math.min(4, Math.max(0.03, view.zoom * factor));
  return { zoom, x: x - (x - view.x) * zoom / view.zoom, y: y - (y - view.y) * zoom / view.zoom };
}
// Screen-space reserves for persistent chrome and the selected-image toolbar.
export function canvasSafeArea(width: number, height: number) {
  const narrow = width <= 680;
  const left = Math.min(96, width * .2), right = Math.min(32, width * .1);
  const top = Math.min(narrow ? 224 : 176, height * .35);
  const bottom = Math.min(width <= 1100 ? 144 : 88, height * .25);
  return { x: left, y: top, width: Math.max(1, width - left - right), height: Math.max(1, height - top - bottom) };
}
export function fitImages(images: CanvasImage[], width: number, height: number): Viewport {
  const bounds = boundsOf(images);
  if (!bounds) return DEFAULT_VIEW;
  const area = canvasSafeArea(width, height);
  const zoom = Math.min(1, Math.max(.03, Math.min(area.width / Math.max(1, bounds.width), area.height / Math.max(1, bounds.height))));
  return { zoom, x: area.x + area.width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: area.y + area.height / 2 - (bounds.y + bounds.height / 2) * zoom };
}
export async function readImage(file: File): Promise<Omit<CanvasImage, 'x' | 'y'>> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error('invalid_image');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    rememberImagePreview(url, image);
    const width = Math.min(360, image.naturalWidth);
    return { id: crypto.randomUUID(), name: file.name, url, width, height: width * image.naturalHeight / image.naturalWidth, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}

export type Bounds = { x: number; y: number; width: number; height: number };
export function boundsOf(images: CanvasImage[]): Bounds | null {
  if (!images.length) return null;
  const x = Math.min(...images.map(n => n.x)), y = Math.min(...images.map(n => n.y));
  return { x, y, width: Math.max(...images.map(n => n.x + n.width)) - x, height: Math.max(...images.map(n => n.y + n.height)) - y };
}
export function arrangeImages(items: CanvasImage[], startX = 0, viewport = { width: 1440, height: 852 }, options: { independentGap?: number; independentColumns?: number; zoom?: number } = {}): CanvasImage[] {
  if (!items.length) return [];
  // Layout the visible graph: an image and its editor are separate vertices.
  type Vertex = { id: string; width: number; height: number; editor: boolean; children: string[] };
  type Placement = { id: string; x: number; y: number };
  type Block = { width: number; height: number; nodes: Placement[] };
  const vertices = new Map<string, Vertex>();
  for (const item of items) {
    if (!item.nodeOnly) vertices.set(item.id, {id:item.id, width:item.width, height:item.height, editor:false, children:[]});
    if (item.fusion) vertices.set(`${item.id}:fusion`, {id:`${item.id}:fusion`, width:workflowWidth(item.fusion), height:workflowHeight(item.fusion), editor:true, children:[]});
  }
  const parents = new Map<string, string>();
  const inputSources = new Map<string, string[]>();
  const mergeRoots = new Set(items.filter(item => isMultiInputWorkflow(item.fusion)).map(item => `${item.id}:fusion`));
  const connect = (parent: string | undefined, child: string) => {
    if (!parent || !vertices.has(parent) || !vertices.has(child) || parent === child) return;
    parents.set(child, parent);
  };
  for (const item of items) {
    if (!item.nodeOnly) {
      const source = item.sourceImageId ?? (item.generatedByEditorId ? `${item.generatedByEditorId}:fusion` : undefined);
      connect(source, item.id);
      inputSources.set(item.id, source ? [source] : []);
    }
    if (item.fusion) inputSources.set(`${item.id}:fusion`, workflowSources(items, item).map(source => source.id));
    // Merge inputs remain visible cross-group links, but do not own the merge.
    if (item.fusion && !isMultiInputWorkflow(item.fusion)) connect(workflowSources(items, item)[0]?.id, `${item.id}:fusion`);
  }
  // Normalize only the layout graph. Missing sources become roots; malformed
  // cycles lose one deterministic layout edge without changing saved relations.
  const resolved = new Set<string>();
  for (const id of vertices.keys()) {
    const path = new Set<string>();
    let current: string | undefined = id;
    while (current !== undefined && !resolved.has(current)) {
      if (path.has(current)) { parents.delete(current); break; }
      path.add(current);
      current = parents.get(current);
    }
    for (const member of path) resolved.add(member);
  }
  // Map insertion order is the stable sibling order, independent of dragged positions.
  for (const [child, parent] of parents) vertices.get(parent)!.children.push(child);
  const moved = (block: Block, x: number, y: number) => block.nodes.map(node => ({...node, x:node.x+x, y:node.y+y}));
  const related: Block[] = [], independent: Block[] = [], mergeBlocks: Block[] = [];
  // Cross-group merge edges still count as relationships for area membership.
  const crossGroupMembers = new Set<string>();
  for (const item of items) {
    if (!isMultiInputWorkflow(item.fusion)) continue;
    const sources = workflowSources(items, item);
    if (sources.length) crossGroupMembers.add(`${item.id}:fusion`);
    sources.forEach(source => crossGroupMembers.add(source.id));
  }
  for (const root of vertices.values()) {
    if (parents.has(root.id)) continue;
    const queue = [{ id: root.id, depth: 0 }];
    const widths: number[] = [];
    const tree = new Map<string, HierarchyData>();
    for (let index = 0; index < queue.length; index++) {
      const { id, depth } = queue[index];
      const vertex = vertices.get(id)!;
      widths[depth] = Math.max(widths[depth] ?? 0, vertex.width);
      tree.set(id, { id, height: vertex.height, children: [] });
      for (const child of vertex.children) queue.push({ id: child, depth: depth + 1 });
    }
    for (const { id, depth } of queue) {
      const data = tree.get(id)!;
      // Reserve the widest node at each depth BEFORE contour compaction.
      // Shifting columns afterwards would invalidate the computed separation.
      data.width = widths[depth];
      data.children = vertices.get(id)!.children.map(child => tree.get(child)!);
    }
    const layout = compactBox(tree.get(root.id)!, {
      direction: 'LR', fixedRoot: false,
      getId: data => data.id!,
      getWidth: data => data.width!,
      getHeight: data => data.height!,
      // AntV pads BOTH sides: 40+40 = 80 horizontally, 60+60 = 120 vertically.
      getHGap: () => FUSION_GAP / 2,
      getVGap: () => BRANCH_GAP / 2,
    });
    const nodes: Placement[] = [];
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    layout.eachNode(node => {
      const x = node.x + node.hgap, y = node.y + node.vgap;
      const vertex = vertices.get(node.id)!;
      nodes.push({ id: node.id, x, y });
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x + vertex.width); bottom = Math.max(bottom, y + vertex.height);
    });
    // Outer packing uses actual rendered bounds, without phantom padding.
    const block: Block = { width: right - left, height: bottom - top,
      nodes: nodes.map(node => ({ ...node, x: node.x - left, y: node.y - top })) };
    const connected = nodes.length > 1 || nodes.some(node => crossGroupMembers.has(node.id));
    (!connected ? independent : mergeRoots.has(root.id) ? mergeBlocks : related).push(block);
  }
  const order = Object.fromEntries([...vertices.keys()].map((id, index) => [id, index]));
  // Ownership and chronological order come from grouping. Its temporary boxes
  // must not turn parallel inputs into consecutive workflow steps.
  const groups = groupTaskBlocks(items, related, mergeBlocks).map(block => {
    const members: FlowLayoutVertex[] = block.nodes.map(node => {
      const vertex = vertices.get(node.id)!;
      return {
        id: vertex.id, width: vertex.width, height: vertex.height,
        kind: vertex.editor ? 'workflow' : 'media', sources: inputSources.get(vertex.id) ?? [],
      };
    });
    const layout = layoutConnectedGroup(members, order);
    return {
      width: layout.width, height: layout.height,
      nodes: [...layout.positions].map(([id, point]) => ({ id, ...point })),
      connected: { layout, vertices: members },
    };
  });
  const zoom = options.zoom && Number.isFinite(options.zoom) && options.zoom > 0 ? options.zoom : 1;
  // Uploads can retain their initial column count; Arrange fills the visible width.
  const independentLayout = packStandaloneRows(
    independent,
    options.independentColumns ? Infinity : canvasSafeArea(viewport.width, viewport.height).width / zoom,
    options.independentGap ?? 40,
    options.independentColumns,
  );
  const bottom: Block = {
    nodes: independentLayout.placements.flatMap(({ item, x, y }) => moved(item, x, y)),
    width: independentLayout.width, height: independentLayout.height,
  };
  const connectedGroups = new Map<Block, ConnectedLayoutGroup>(groups.map(group => [group, group.connected]));
  const relatedLayout = placeConnectedGroupStages(
    mergeGroupStages(items, groups).map(blocks => blocks.map(block => connectedGroups.get(block)!)),
    order, { groupGap: GROUP_GAP, groupsPerRow: GROUPS_PER_ROW },
  );
  const placements: Placement[] = [...relatedLayout.positions].map(([id, point]) => ({ id, ...point }));
  const bottomY = placements.length && bottom.nodes.length ? relatedLayout.height + GROUP_GAP : 0;
  placements.push(...moved(bottom,0,bottomY));
  const positions = new Map(placements.map(node=>[node.id,{x:node.x+startX,y:node.y}]));
  return items.map(item=>{
    const image = positions.get(item.id), editor = positions.get(`${item.id}:fusion`);
    return {...item, ...(image ?? (item.nodeOnly ? editor : undefined)),
      fusion:item.fusion && editor ? {...item.fusion,position:editor} : item.fusion};
  });
}

export function fusionPosition(image: CanvasImage) {
  return image.fusion?.position ?? { x: image.x + image.width + FUSION_GAP, y: image.y + (image.height - workflowHeight(image.fusion)) / 2 };
}

// Include workflow nodes in navigation without treating them as uploaded images.
export function canvasNodes(images: CanvasImage[]): CanvasImage[] {
  return images.flatMap(image => image.fusion ? [...(image.nodeOnly ? [] : [image]), { ...image, id: `${image.id}:fusion`, fusion: undefined, ...fusionPosition(image), width: workflowWidth(image.fusion), height: workflowHeight(image.fusion) }] : image.nodeOnly ? [] : [image]);
}

// Keep an empty workflow record when its source image is removed.
export function deleteCanvasSelection(items: CanvasImage[], selected: string[]): CanvasImage[] {
  const ids = new Set(selected);
  return items.flatMap(item => {
    const deleteImage = ids.has(item.id), deleteNode = ids.has(`${item.id}:fusion`);
    if (deleteNode && (item.nodeOnly || deleteImage)) return [];
    if (item.fusion && isMultiInputWorkflow(item.fusion)) {
      const inputs = workflowInputs(item.fusion).filter(ref => !ref.sourceImageId || !ids.has(ref.sourceImageId));
      return [{ ...item, fusion: { ...item.fusion, ...(item.fusion.kind === 'batch' ? { mainImages: inputs } : { references: inputs }) } }];
    }
    if (item.editorSourceId && ids.has(item.editorSourceId) && item.fusion) {
      return [{...item, editorSourceId: undefined, name: '', url: '', fusion: {...defaultFusion(item.fusion.kind),
        ...(rememberedWorkflowKind(item.fusion.kind) ? { ratio: item.fusion.ratio, resolution: item.fusion.resolution } : {}), position: fusionPosition(item)}}];
    }
    if (deleteImage) {
      if (!item.fusion) return [];
      return [{...item, nodeOnly: true, name: '', url: '', role: undefined, sourceImageId: undefined,
        operation: undefined, fusion: {...defaultFusion(item.fusion.kind),
          ...(rememberedWorkflowKind(item.fusion.kind) ? { ratio: item.fusion.ratio, resolution: item.fusion.resolution } : {}), position: fusionPosition(item)}}];
    }
    return [deleteNode ? {...item, fusion: undefined} : item];
  });
}

// Selection raises the connected workflow visually without reordering saved data.
export function relatedCanvasIds(items: CanvasImage[], selected: string[]): Set<string> {
  const ids = new Set(items.filter(n => selected.includes(n.id) || selected.includes(`${n.id}:fusion`)).map(n => n.id));
  const visible = new Set(items.filter(n => !n.nodeOnly).map(n => n.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of items) {
      // A cutout's direct image source takes precedence over legacy inherited metadata.
      const cutoutSourceId = visible.has(n.id) ? n.sourceImageId : undefined;
      const sourceIds = cutoutSourceId ? (visible.has(cutoutSourceId) ? [cutoutSourceId] : [])
        : n.generatedByEditorId ? (items.some(item => item.id === n.generatedByEditorId && item.fusion) ? [n.generatedByEditorId] : [])
        : workflowSources(items, n).map(source => source.id);
      for (const sourceId of sourceIds) {
        if (ids.has(n.id) === ids.has(sourceId)) continue;
        ids.add(n.id); ids.add(sourceId); changed = true;
      }
    }
  }
  return ids;
}

// Separate editor records share one source image without copying its canvas media.
export function createFusionEditor(items: CanvasImage[], sourceId: string, id: string, kind: WorkflowKind = 'fusion'): CanvasImage | null {
  const source = items.find(n => n.id === sourceId && !n.nodeOnly && !n.generation);
  if (!source) return null;
  const x = source.x + source.width + FUSION_GAP;
  const fusion = newFusionSettings(kind);
  const width = workflowWidth(fusion), height = workflowHeight(fusion);
  const y = source.y + (source.height - height) / 2;
  return {id, name: source.name, url: '', x, y, width, height,
    nodeOnly: true, editorSourceId: source.id, fusion: {...fusion, position: {x,y}}};
}

// Refill the existing editor with a separate media instance. Results, selection
// and layout membership continue to refer to the same editor ID.
export function restoreWorkflowMain(items: CanvasImage[], editorId: string,
  input: Pick<CanvasImage, 'name' | 'url' | 'width' | 'height' | 'naturalWidth' | 'naturalHeight' | 'generatedFile'>, imageId: string): CanvasImage[] {
  const target = items.find(item => item.id === editorId && item.nodeOnly && item.fusion && !isMultiInputWorkflow(item.fusion));
  if (!target?.fusion) return items;
  const position = fusionPosition(target);
  const main: CanvasImage = { id: imageId, name: input.name, url: input.url, width: input.width, height: input.height,
    naturalWidth: input.naturalWidth, naturalHeight: input.naturalHeight, generatedFile: input.generatedFile,
    x: position.x - input.width - FUSION_GAP,
    y: position.y + (workflowHeight(target.fusion) - input.height) / 2 };
  return [...items.map(item => item.id === target.id ? { ...item, editorSourceId: imageId,
    fusion: item.fusion?.kind === 'flat' ? item.fusion : { ...item.fusion!, position, drawingGuide: undefined } } : item), main];
}

export function createMergeEditor(items: CanvasImage[], selected: string[], id: string, batchFlat = false): CanvasImage | null {
  const sources = items.filter(item => selected.includes(item.id) && !item.nodeOnly && !item.generation);
  if (sources.length < 2 || sources.length > (batchFlat ? 20 : MAX_FUSION_REFERENCES)) return null;
  const bounds = boundsOf(sources)!;
  const fusion = { ...newFusionSettings(batchFlat ? 'flat' : 'merge'), batchFlat, references: sources.map(source => ({ id: source.id, name: source.name, url: source.url, sourceImageId: source.id })) };
  const height = workflowHeight(fusion), x = bounds.x + bounds.width + FUSION_GAP;
  const y = bounds.y + (bounds.height - height) / 2;
  return { id, name: batchFlat ? '转3D平铺' : '合拼生图', url: '', x, y, width: FUSION_WIDTH, height, nodeOnly: true,
    fusion: { ...fusion, position: { x, y }, references: sources.map(source => ({ id: source.id, name: source.name, url: source.url, sourceImageId: source.id })) } };
}


// Batch edit has separate primary inputs and shared references. Keep the source
// identity on every main image so cross-group inputs retain their original group.
export function createBatchEditor(items: CanvasImage[], selected: string[], id: string): CanvasImage | null {
  const sources = items.filter(item => selected.includes(item.id) && !item.nodeOnly && !item.generation);
  if (sources.length < 2 || sources.length > MAX_BATCH_MAIN_IMAGES) return null;
  const bounds = boundsOf(sources)!;
  const fusion: FusionSettings = { ...newFusionSettings('batch'), mainImages: sources.map(source => ({
    id: source.id, name: source.name, url: source.url, sourceImageId: source.id,
  })), references: [] };
  const width = workflowWidth(fusion), height = workflowHeight(fusion);
  const x = bounds.x + bounds.width + FUSION_GAP;
  const y = bounds.y + (bounds.height - height) / 2;
  return { id, name: '批量编辑', url: '', x, y, width, height, nodeOnly: true,
    fusion: { ...fusion, position: { x, y } } };
}
