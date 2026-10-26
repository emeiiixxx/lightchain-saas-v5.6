/** User-created edges are independent from automatic image/editor bindings. */
export type CanvasConnection = {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
};

export type CanvasConnectionInput = Omit<CanvasConnection, 'id'>;

export type CanvasMediaKind = 'image' | 'video';
export type CanvasConnectionNode = {
  kind: CanvasMediaKind | 'editor';
  accepts?: CanvasMediaKind[];
  /** Media still available to add after applying the editor's current capacity. */
  addable?: CanvasMediaKind[];
  output?: CanvasMediaKind;
};
export type CanvasConnectionNodes = Record<string, CanvasConnectionNode>;

export function canvasConnectionSides(node?: CanvasConnectionNode): ('left' | 'right')[] {
  return node && node.kind !== 'editor' ? ['right'] : ['left', 'right'];
}

// Shared by the drag feedback and the history mutation: a red target must never
// accept a drop. Editing capabilities belong to the workspace, not the renderer.
export function canConnectCanvasNodes(connection: CanvasConnectionInput, nodes: CanvasConnectionNodes): boolean {
  const source = nodes[connection.source], target = nodes[connection.target];
  if (!source || !target || connection.source === connection.target) return false;
  if (!canvasConnectionSides(source).some(side => connection.sourceHandle === `free-${side}`)
    || !canvasConnectionSides(target).some(side => connection.targetHandle === `free-${side}`)) return false;
  const media = source.kind === 'editor' ? source.output : source.kind;
  return target.kind !== 'editor' || !!media && !!target.accepts?.includes(media);
}
