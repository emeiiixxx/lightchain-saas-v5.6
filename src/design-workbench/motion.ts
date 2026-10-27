// Shared interaction contract: 200ms CSS ease-out (0, 0, .58, 1).
export const MOTION_DURATION = 200;
export function easeOut(progress: number) {
  const x = Math.max(0, Math.min(1, progress));
  if (x === 0 || x === 1) return x;
  let low = 0, high = 1;
  for (let i = 0; i < 16; i++) {
    const t = (low + high) / 2;
    const sample = 1.74 * (1 - t) * t * t + t * t * t;
    if (sample < x) low = t; else high = t;
  }
  const t = (low + high) / 2;
  return 3 * (1 - t) * t * t + t * t * t;
}
