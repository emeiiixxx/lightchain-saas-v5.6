// Group order is frozen in the snapshot before this pass. New groups already
// follow their sources; replacing an old input must not move an existing group.
// Once a downstream stage starts, later independent groups cannot jump back.
export function orderedLayoutStages<T>(groups: readonly T[], dependencies: ReadonlyMap<T, ReadonlySet<T>>): T[][] {
  const stages: T[][] = [];
  const placed = new Map<T, number>();
  let lastStage = 0;
  for (const group of groups) {
    if (placed.has(group)) continue;
    const parents = [...(dependencies.get(group) ?? [])];
    const stage = Math.max(lastStage, ...parents.flatMap(parent => {
      const parentStage = placed.get(parent);
      return parentStage === undefined ? [] : [parentStage + 1];
    }));
    (stages[stage] ??= []).push(group);
    placed.set(group, stage);
    lastStage = stage;
  }
  return stages;
}
