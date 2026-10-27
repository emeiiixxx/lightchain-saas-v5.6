import { workflowSources, type CanvasImage } from './canvas';
import type { LayoutBlock } from './canvas-merge-layout';
import { canvasLayoutGroups } from './canvas-layout-groups';

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

// Group identity and first ordering keys belong to the saved canvas snapshot.
// The layout pass only gathers the visible vertices that still belong to it.
export function groupTaskBlocks(items: CanvasImage[], related: LayoutBlock[], tasks: LayoutBlock[]): LayoutBlock[] {
  const state = canvasLayoutGroups(items);
  const groups = new Map<string, LayoutBlock>();
  for (const block of [...related, ...tasks]) for (const node of block.nodes) {
    const id = state.owners[node.id];
    if (!id) continue;
    const group = groups.get(id) ?? { width: 0, height: 0, nodes: [] };
    group.nodes.push(node);
    groups.set(id, group);
  }
  return [...groups].sort(([a], [b]) => (state.groupSortOrder?.[a] ?? state.groupOrder[a]) - (state.groupSortOrder?.[b] ?? state.groupOrder[b])
    || (state.groupCreatedOrder?.[a] ?? state.groupOrder[a]) - (state.groupCreatedOrder?.[b] ?? state.groupOrder[b])
    || a.localeCompare(b)).map(([, block]) => block);
}
