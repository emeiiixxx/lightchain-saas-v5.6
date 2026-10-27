import { layoutConnectedGroup, type ConnectedGroupLayout, type FlowLayoutVertex } from './canvas-connected-layout';

export type ConnectedLayoutGroup = {
  layout: ConnectedGroupLayout;
  vertices: FlowLayoutVertex[];
};
type Bounds = { x: number; y: number; width: number; height: number };

// Stage order and ownership are decided before placement. Each downstream entry
// receives its real, fixed inputs; only the new group is added to the result.
export function placeConnectedGroupStages(
  stages: readonly (readonly ConnectedLayoutGroup[])[],
  order: Readonly<Record<string, number>>,
  options: { groupGap?: number; groupsPerRow?: number } = {},
): ConnectedGroupLayout {
  const groupGap = options.groupGap ?? 240;
  const groupsPerRow = options.groupsPerRow ?? 5;
  const positions: ConnectedGroupLayout['positions'] = new Map();
  const occupied = new Map<string, Bounds>();
  // A dependency stage changes placement constraints, not the row's capacity.
  // Count all groups in their established order so a later stage cannot append
  // a sixth group to a row that earlier stages have already partly filled.
  const orderedGroups = stages.flat().filter(group => group.layout.positions.size);
  let defaultRowY = 0;
  let rowFloor = -Infinity;
  for (let offset = 0; offset < orderedGroups.length; offset += groupsPerRow) {
    const groups = orderedGroups.slice(offset, offset + groupsPerRow);
    const rowHeight = Math.max(...groups.map(group => group.layout.height));
    let x = 0;
    let rowBottom = -Infinity;
    for (const group of groups) {
      const { layout, vertices } = group;
      const localIds = new Set(vertices.map(vertex => vertex.id));
      const externalInputs = new Map<string, Bounds>();
      for (const vertex of vertices) for (const source of vertex.sources) {
        const fixed = occupied.get(source);
        if (!localIds.has(source) && fixed) externalInputs.set(source, fixed);
      }
      const y = Math.max(defaultRowY + (rowHeight - layout.height) / 2, rowFloor);
      let placed: ConnectedGroupLayout['positions'];
      if (externalInputs.size) {
        // The shared algorithm places every entry and its complete following
        // branch against all direct inputs, including newly added local media.
        // It also avoids fixed nodes branch by branch, preserving other entries.
        placed = layoutConnectedGroup(vertices, order, {
          origin: { x, y }, externalInputs, occupied, groupGap,
          ...(Number.isFinite(rowFloor) ? { bottomFloor: rowFloor } : {}),
        }).positions;
      } else {
        placed = new Map([...layout.positions].map(([id, point]) => [id, { x: x + point.x, y: y + point.y }]));
        // Independent groups keep row centering by default. Actual rectangles
        // avoid false collisions caused only by empty space inside a group.
        const blocked: { top: number; bottom: number }[] = [];
        for (const vertex of vertices) {
          const point = placed.get(vertex.id)!;
          for (const previous of occupied.values()) {
            if (point.x >= previous.x + previous.width + groupGap
              || point.x + vertex.width + groupGap <= previous.x) continue;
            blocked.push({
              top: previous.y - point.y - vertex.height - groupGap,
              bottom: previous.y + previous.height + groupGap - point.y,
            });
          }
        }
        let offset = 0;
        blocked.sort((a, b) => a.top - b.top);
        for (const interval of blocked) if (offset > interval.top && offset < interval.bottom) offset = interval.bottom;
        if (offset) placed = new Map([...placed].map(([id, point]) => [id, { x: point.x, y: point.y + offset }]));
      }
      // Cross-group inputs can move into an earlier column. Measure only the
      // placed vertices: the baseline width would retain that now-empty column
      // and push following groups (and later stages) too far to the right.
      let groupRight = -Infinity;
      for (const vertex of vertices) {
        const point = placed.get(vertex.id)!;
        positions.set(vertex.id, point);
        occupied.set(vertex.id, { ...point, width: vertex.width, height: vertex.height });
        rowBottom = Math.max(rowBottom, point.y + vertex.height);
        groupRight = Math.max(groupRight, point.x + vertex.width);
      }
      x = groupRight + groupGap;
    }
    rowFloor = rowBottom + groupGap;
    defaultRowY = Math.max(defaultRowY + rowHeight + groupGap, rowFloor);
  }
  if (!positions.size) return { positions, width: 0, height: 0 };
  const bounds = [...occupied.values()];
  const left = Math.min(...bounds.map(node => node.x));
  const top = Math.min(...bounds.map(node => node.y));
  const right = Math.max(...bounds.map(node => node.x + node.width));
  const bottom = Math.max(...bounds.map(node => node.y + node.height));
  return {
    positions: new Map([...positions].map(([id, point]) => [id, { x: point.x - left, y: point.y - top }])),
    width: right - left,
    height: bottom - top,
  };
}
