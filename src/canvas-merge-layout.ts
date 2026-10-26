import { isMultiInputWorkflow, workflowSources, type CanvasImage } from './canvas';

export type LayoutBlock = { width: number; height: number; nodes: { id: string; x: number; y: number }[] };
export const MERGE_OUTPUT_GAP = 160;
export const MERGE_GROUP_GAP = 480;

// Input blocks are ordered by their main images' upload sequence.
// Cross-group edges constrain placement without changing source ownership.
export function mergeGroupStages(items: CanvasImage[], blocks: LayoutBlock[]): LayoutBlock[][] {
  const owner = new Map<string, number>();
  blocks.forEach((block, index) => block.nodes.forEach(node => owner.set(node.id, index)));
  const dependencies = blocks.map(() => new Set<number>());
  for (const item of items) {
    if (!item.fusion || !isMultiInputWorkflow(item.fusion)) continue;
    const target = owner.get(`${item.id}:fusion`);
    if (target === undefined) continue;
    for (const source of workflowSources(items, item)) {
      const parent = owner.get(source.id);
      if (parent !== undefined && parent !== target) dependencies[target].add(parent);
    }
  }
  const stages: LayoutBlock[][] = [];
  const placed = new Map<number, number>();
  const visiting = new Set<number>();
  let lastStage = 0;
  function place(index: number) {
    // Break only the recursive layout edge in malformed legacy cycles.
    if (placed.has(index) || visiting.has(index)) return;
    visiting.add(index);
    const parents = [...dependencies[index]].sort((a, b) => a - b);
    parents.forEach(place);
    visiting.delete(index);
    // A later independent group continues after the previous group; it must
    // never jump back to the first stage and split an older generation chain.
    const stage = Math.max(lastStage, ...parents.flatMap(parent => {
      const parentStage = placed.get(parent);
      return parentStage === undefined ? [] : [parentStage + 1];
    }));
    (stages[stage] ??= []).push(blocks[index]);
    placed.set(index, stage);
    lastStage = stage;
  }
  blocks.forEach((_, index) => place(index));
  return stages;
}
