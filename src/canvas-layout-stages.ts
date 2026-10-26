// Preserve the supplied group order while keeping every dependency upstream.
// Once a downstream stage starts, later independent groups cannot jump back.
export function orderedLayoutStages<T>(groups: readonly T[], dependencies: ReadonlyMap<T, ReadonlySet<T>>): T[][] {
  const order = new Map(groups.map((group, index) => [group, index]));
  const stages: T[][] = [];
  const placed = new Map<T, number>();
  const visiting = new Set<T>();
  let lastStage = 0;
  function place(group: T) {
    // Break only a recursive layout edge in malformed legacy cycles.
    if (placed.has(group) || visiting.has(group)) return;
    visiting.add(group);
    const parents = [...(dependencies.get(group) ?? [])]
      .filter(parent => order.has(parent))
      .sort((a, b) => order.get(a)! - order.get(b)!);
    parents.forEach(place);
    visiting.delete(group);
    const stage = Math.max(lastStage, ...parents.flatMap(parent => {
      const parentStage = placed.get(parent);
      return parentStage === undefined ? [] : [parentStage + 1];
    }));
    (stages[stage] ??= []).push(group);
    placed.set(group, stage);
    lastStage = stage;
  }
  groups.forEach(place);
  return stages;
}
