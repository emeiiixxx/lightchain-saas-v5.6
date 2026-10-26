import { isMultiInputWorkflow, workflowSources, type CanvasImage } from './canvas';
import type { LayoutBlock } from './canvas-merge-layout';
import { canvasImageOriginOrders } from './canvas-origin-order';

// New, unconnected uploads may enter a task; existing workflows keep their
// ownership when another task uses one of their images as an input.
export function standaloneTaskInputs(items: CanvasImage[]): Set<string> {
  const connected = new Set<string>();
  for (const item of items) {
    if (item.sourceImageId) { connected.add(item.id); connected.add(item.sourceImageId); }
    if (item.generatedByEditorId) { connected.add(item.id); connected.add(item.generatedByEditorId); }
    if (item.fusion) {
      connected.add(item.id);
      // Match the rendered connections. Editor-only reference thumbnails must
      // not give a canvas image an owner, including legacy reference bindings.
      for (const source of workflowSources(items, item)) connected.add(source.id);
    }
  }
  return new Set(items.filter(item => !item.nodeOnly && !connected.has(item.id)).map(item => item.id));
}

const offset = (block: LayoutBlock, x: number, y: number) => block.nodes.map(node => ({ ...node, x: node.x + x, y: node.y + y }));
const rootImage = (items: CanvasImage[], block: LayoutBlock) => items.find(item => !item.nodeOnly && block.nodes.some(node => node.id === item.id && node.x === 0));

export function groupTaskBlocks(items: CanvasImage[], related: LayoutBlock[], tasks: LayoutBlock[]): LayoutBlock[] {
  const editors = items.filter(item => isMultiInputWorkflow(item.fusion));
  const imageOrder = canvasImageOriginOrders(items);
  const firstMainOrder = (block: LayoutBlock) => Math.min(...block.nodes.filter(node => node.x === 0).map(node => imageOrder.get(node.id) ?? Infinity));

  // Direct batch operations have no shared editor. Their source/result pairs
  // already belong to one group, even when a later batch uses several pairs.
  const batches = new Map<string, LayoutBlock[]>();
  for (const block of related) {
    const root = rootImage(items, block);
    if (!root?.layoutTaskId || items.some(item => item.id === root.layoutTaskId && item.fusion)) continue;
    const blocks = batches.get(root.layoutTaskId) ?? [];
    blocks.push(block); batches.set(root.layoutTaskId, blocks);
  }
  for (const blocks of batches.values()) {
    if (blocks.length < 2) continue;
    let y = 0;
    const combined: LayoutBlock = { width: Math.max(...blocks.map(block => block.width)), height: 0, nodes: [] };
    for (const block of blocks) { combined.nodes.push(...offset(block, 0, y)); y += block.height + 120; }
    combined.height = y - 120;
    const index = related.indexOf(blocks[0]);
    for (const block of blocks) related.splice(related.indexOf(block), 1);
    related.splice(index, 0, combined);
  }

  // Pin bare inputs to a valid saved owner, otherwise their first current
  // consumer. This prevents a shared input moving between groups on each tidy.
  const inputOwners = new Map<string, string>();
  for (const editor of editors) {
    for (const source of workflowSources(items, editor)) {
      if (!inputOwners.has(source.id) || source.layoutTaskId === editor.id) inputOwners.set(source.id, editor.id);
    }
  }
  const bareInputs = new Map<string, LayoutBlock>();
  for (const block of related) {
    if (block.nodes.length === 1 && imageOrder.has(block.nodes[0].id)) bareInputs.set(block.nodes[0].id, block);
  }
  const taskBlocks = new Map<string, LayoutBlock>();
  const orders = new Map(related.map(block => [block, firstMainOrder(block)]));
  for (const editor of editors) {
    const task = tasks.find(block => block.nodes.some(node => node.id === `${editor.id}:fusion`));
    if (!task) continue;
    taskBlocks.set(editor.id, task);
    const sources = workflowSources(items, editor);
    // A new group uses its main images' upload order. Existing groups retain
    // their original order when later images or editors are added to them.
    orders.set(task, Math.min(...sources.map(source => imageOrder.get(source.id) ?? Infinity)));
    const adopted = sources.flatMap(source => {
      const block = bareInputs.get(source.id);
      if (!block || inputOwners.get(source.id) !== editor.id) return [];
      bareInputs.delete(source.id);
      related.splice(related.indexOf(block), 1);
      return [block];
    });
    if (!adopted.length) continue;
    const inputWidth = Math.max(...adopted.map(block => block.width));
    const inputHeight = adopted.reduce((sum, block) => sum + block.height, 0) + (adopted.length - 1) * 120;
    const height = Math.max(task.height, inputHeight);
    let y = (height - inputHeight) / 2;
    const nodes = adopted.flatMap(block => { const placed = offset(block, 0, y); y += block.height + 120; return placed; });
    nodes.push(...offset(task, inputWidth + 80, (height - task.height) / 2));
    task.nodes = nodes; task.width += inputWidth + 80; task.height = height;
  }

  const groups = new Set([...related, ...tasks]);
  const owner = new Map<string, LayoutBlock>();
  for (const block of groups) for (const node of block.nodes) owner.set(node.id, block);
  const dependencies = new Map<string, Set<string>>();
  for (const editor of editors) {
    const parents = new Set<string>();
    for (const source of workflowSources(items, editor)) {
      const group = owner.get(source.id);
      for (const [parentId, block] of taskBlocks) if (block === group && parentId !== editor.id) parents.add(parentId);
    }
    dependencies.set(editor.id, parents);
  }
  const pending = new Set(taskBlocks.keys());
  while (pending.size) {
    const ready = [...pending].find(id => [...(dependencies.get(id) ?? [])].every(parent => !pending.has(parent)));
    // Break one layout dependency in malformed legacy cycles, without dropping nodes.
    const id = ready ?? pending.values().next().value!;
    pending.delete(id);
    if (ready === undefined) continue;
    const editor = editors.find(item => item.id === id)!;
    const task = owner.get(`${id}:fusion`)!;
    const sourceGroups = new Set(workflowSources(items, editor).map(source => owner.get(source.id)).filter((block): block is LayoutBlock => !!block && block !== task));
    // One existing group + any new uploads extends that group. Two or more
    // existing groups create a separate group and never pull their images away.
    if (sourceGroups.size !== 1) continue;
    const parent = sourceGroups.values().next().value!;
    const height = Math.max(parent.height, task.height);
    parent.nodes = [...offset(parent, 0, (height - parent.height) / 2), ...offset(task, parent.width + 80, (height - task.height) / 2)];
    parent.width += task.width + 80; parent.height = height;
    groups.delete(task);
    for (const node of parent.nodes) owner.set(node.id, parent);
  }

  // Keep one chronological sequence across independent and downstream groups.
  // Dependency placement must not move newer independent groups ahead of older results.
  const byMainUpload = (a: LayoutBlock, b: LayoutBlock) => (orders.get(a) ?? Infinity) - (orders.get(b) ?? Infinity);
  return [...groups].sort(byMainUpload);
}
