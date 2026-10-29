type Camera = { x: number; y: number; zoom: number };
type Point = { x: number; y: number };
export type GenerationFocusViewport = { width: number; height: number };

// CSS ease-in-out: cubic-bezier(.42, 0, .58, 1).
function easeInOut(progress: number) {
  let low = 0, high = 1;
  for (let index = 0; index < 16; index++) {
    const t = (low + high) / 2, inverse = 1 - t;
    const x = 3 * inverse * inverse * t * .42 + 3 * inverse * t * t * .58 + t * t * t;
    if (x < progress) low = t; else high = t;
  }
  const t = (low + high) / 2;
  return t * t * (3 - 2 * t);
}

function travelDuration(screens: number) {
  const stops = [[.5, 250], [1, 350], [2, 500], [4, 700], [8, 900]] as const;
  if (screens <= stops[0][0]) return stops[0][1];
  for (let index = 1; index < stops.length; index++) {
    const [distance, duration] = stops[index], [previousDistance, previousDuration] = stops[index - 1];
    if (screens <= distance) return previousDuration + (duration - previousDuration) * (screens - previousDistance) / (distance - previousDistance);
  }
  return 900;
}

/** Generated results use distance-adaptive timing; ordinary additions keep their existing timing. */
export function generationFocusMotion(start: Camera, target: Camera, anchor: Point, viewport: GenerationFocusViewport) {
  const from = { x: (anchor.x - start.x) / start.zoom, y: (anchor.y - start.y) / start.zoom };
  const to = { x: (anchor.x - target.x) / target.zoom, y: (anchor.y - target.y) / target.zoom };
  const screens = Math.hypot((to.x - from.x) * start.zoom / Math.max(1, viewport.width),
    (to.y - from.y) * start.zoom / Math.max(1, viewport.height));
  const startScale = Math.log(start.zoom), targetScale = Math.log(target.zoom);
  const panOnly = start.zoom === target.zoom;
  // A large scale change also needs time, even when the destination is already centered.
  const duration = Math.min(900, Math.max(travelDuration(screens), 250 + 120 * Math.abs(targetScale - startScale) / Math.LN2));
  // Change scale only to reveal oversized content, never to pull back for travel.
  return {
    duration,
    at(progress: number): Camera {
      if (progress <= 0) return start;
      if (progress >= 1) return target;
      const eased = easeInOut(progress);
      const zoom = panOnly ? start.zoom : Math.exp(startScale + (targetScale - startScale) * eased);
      return { zoom, x: anchor.x - (from.x + (to.x - from.x) * eased) * zoom,
        y: anchor.y - (from.y + (to.y - from.y) * eased) * zoom };
    },
  };
}
