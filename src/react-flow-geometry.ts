import { Position, type Node } from '@xyflow/react';

type FreeConnectionGeometry = {
  sides: readonly ('left' | 'right')[];
  zoom: number;
};

// Canvas nodes have explicit dimensions. Supply handles from the same geometry
// so controlled updates never wait for a ResizeObserver to reconnect edges.
export function flowNodeGeometry(width: number, height: number, freeConnections?: FreeConnectionGeometry): Pick<Node, 'width' | 'height' | 'handles'> {
  if (freeConnections) {
    // React Flow adopts this list on every controlled node update. These IDs,
    // types and anchor centres must match the rendered zero-size free handles;
    // their CSS pseudo-elements provide the visible dot and larger hit area.
    const offset = 12 / freeConnections.zoom;
    return {
      width,
      height,
      // Loose mode resolves both ends from source handles, just like the DOM.
      handles: freeConnections.sides.map(side => ({
        id: `free-${side}`, type: 'source' as const, position: side === 'left' ? Position.Left : Position.Right,
        x: side === 'left' ? -offset : width + offset,
        y: height / 2,
        width: 0, height: 0,
      })),
    };
  }
  return {
    width,
    height,
    handles: [Position.Left, Position.Right].flatMap(position =>
      (['source', 'target'] as const).map(type => ({
        id: `${type}-${position}`, type, position,
        x: (position === Position.Left ? 0 : width) - 0.5,
        y: height / 2 - 0.5,
        width: 1, height: 1,
      }))),
  };
}
