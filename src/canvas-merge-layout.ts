import { isMultiInputWorkflow, workflowSources, type CanvasImage } from './canvas';
import { orderedLayoutStages } from './canvas-layout-stages';

export type LayoutBlock = { width: number; height: number; nodes: { id: string; x: number; y: number }[] };

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
  return orderedLayoutStages(
    blocks.map((_, index) => index),
    new Map(dependencies.map((parents, index) => [index, parents])),
  ).map(stage => stage.map(index => blocks[index]));
}
