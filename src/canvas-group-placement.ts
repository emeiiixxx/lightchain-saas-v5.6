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
  options: { groupGap?: number; stageGap?: number; groupsPerRow?: number; centerStages?: boolean } = {},
): ConnectedGroupLayout {
  const groupGap = options.groupGap ?? 240;
  const stageGap = options.stageGap ?? 480;
  const groupsPerRow = options.groupsPerRow ?? 5;
  const positions: ConnectedGroupLayout['positions'] = new Map();
  const occupied = new Map<string, Bounds>();
  const planned = stages.map(stage => {
    const rows: { groups: readonly ConnectedLayoutGroup[]; height: number; width: number }[] = [];
    for (let offset = 0; offset < stage.length; offset += groupsPerRow) {
      const groups = stage.slice(offset, offset + groupsPerRow);
      rows.push({
        groups,
        height: Math.max(0, ...groups.map(group => group.layout.height)),
        width: groups.reduce((sum, group) => sum + group.layout.width, 0) + Math.max(0, groups.length - 1) * groupGap,
      });
    }
    return {
      rows,
      width: Math.max(0, ...rows.map(row => row.width)),
      height: rows.reduce((sum, row) => sum + row.height, 0) + Math.max(0, rows.length - 1) * groupGap,
    };
  });
  const tallestStage = Math.max(0, ...planned.map(stage => stage.height));
  let stageX = 0;
  for (const stage of planned) {
    const stageTop = options.centerStages === false ? 0 : (tallestStage - stage.height) / 2;
    let defaultRowY = stageTop;
    let rowFloor = -Infinity;
    let stageRight = stageX + stage.width;
    for (const row of stage.rows) {
      let x = stageX;
      let rowBottom = -Infinity;
      for (const group of row.groups) {
        const { layout, vertices } = group;
        if (!layout.positions.size) continue;
        const localIds = new Set(vertices.map(vertex => vertex.id));
        const externalInputs = new Map<string, Bounds>();
        for (const vertex of vertices) for (const source of vertex.sources) {
          const fixed = occupied.get(source);
          if (!localIds.has(source) && fixed) externalInputs.set(source, fixed);
        }
        const y = Math.max(defaultRowY + (row.height - layout.height) / 2, rowFloor);
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
        // Referenced materials stay in the occupied map at their original
        // positions. Only this group's own vertices contribute to its bounds.
        let groupRight = x + layout.width;
        for (const vertex of vertices) {
          const point = placed.get(vertex.id)!;
          positions.set(vertex.id, point);
          occupied.set(vertex.id, { ...point, width: vertex.width, height: vertex.height });
          rowBottom = Math.max(rowBottom, point.y + vertex.height);
          groupRight = Math.max(groupRight, point.x + vertex.width);
        }
        stageRight = Math.max(stageRight, groupRight);
        x = groupRight + groupGap;
      }
      rowFloor = rowBottom + groupGap;
      defaultRowY = Math.max(defaultRowY + row.height + groupGap, rowFloor);
    }
    stageX = stageRight + stageGap;
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
