// Production CSS may shorten 200ms to .2s. JavaScript timers always use ms.
export function getMotionDurationMs(): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--motion-duration').trim();
  const duration = Number.parseFloat(value);
  if (!Number.isFinite(duration) || duration < 0) return 200;
  if (value.endsWith('ms')) return duration;
  if (value.endsWith('s')) return duration * 1000;
  return duration === 0 ? 0 : 200;
}
