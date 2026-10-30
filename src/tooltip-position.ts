// Filename tooltips follow the pointer in screen space, independent of canvas zoom.
export function pointerTooltipPosition(pointer: { x: number; y: number }, width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const gap = 12, margin = 8;
  const x = pointer.x + gap + width <= viewportWidth - margin ? pointer.x + gap : pointer.x - width - gap;
  const y = pointer.y + gap + height <= viewportHeight - margin ? pointer.y + gap : pointer.y - height - gap;
  return {
    left: Math.max(margin, Math.min(x, viewportWidth - width - margin)),
    top: Math.max(margin, Math.min(y, viewportHeight - height - margin)),
  };
}
