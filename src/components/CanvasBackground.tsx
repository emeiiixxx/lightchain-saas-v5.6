import { useId } from 'react';
import { CANVAS_GRID_SIZE, type Viewport } from '../canvas';

/** Both flow workspaces share the same world-aligned dot grid. */
export function CanvasBackground({ view }: { view: Viewport }) {
  const patternId = useId();
  return <svg className="canvas-grid" aria-hidden="true" width="100%" height="100%">
    <defs><pattern id={patternId} width={CANVAS_GRID_SIZE} height={CANVAS_GRID_SIZE} patternUnits="userSpaceOnUse"
      patternTransform={`matrix(${view.zoom}, 0, 0, ${view.zoom}, ${view.x}, ${view.y})`}>
      <circle cx="1" cy="1" r="1" fill="var(--canvas-dot)" />
    </pattern></defs>
    <rect width="100%" height="100%" fill={`url(#${patternId})`} />
  </svg>;
}
