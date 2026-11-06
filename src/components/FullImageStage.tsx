import { useEffect, useRef, type ReactNode } from 'react';
import './full-image-stage.css';

type WheelFactor = (event: WheelEvent, pageHeight: number) => number;
type Props = { width: number; height: number; wheelFactor?: WheelFactor; children: ReactNode };

const flowWheelFactor: WheelFactor = (event, pageHeight) => {
  const mode = event.deltaMode;
  const delta = event.deltaY * (mode === 1 ? 16 : mode === 2 ? pageHeight : 1);
  return Math.exp(-Math.max(-600, Math.min(600, delta)) * .0015);
};

export function FullImageStage({ width, height, wheelFactor = flowWheelFactor, children }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current!;
    const image = imageRef.current!;
    let x = 0, y = 0, zoom = 1;
    let frame: number | null = null;
    let bounds: DOMRect | undefined;
    let drag: { id: number; x: number; y: number } | null = null;

    // Keep every input delta, but apply only one transform per display frame.
    function schedulePaint() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        image.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${zoom})`;
      });
    }

    function wheel(event: WheelEvent) {
      if (stage.closest('[inert]')) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = bounds ??= stage.getBoundingClientRect();
      const next = Math.max(.1, Math.min(8, zoom * wheelFactor(event, rect.height)));
      if (next === zoom) return;
      const ratio = next / zoom;
      const px = event.clientX - rect.left - rect.width / 2;
      const py = event.clientY - rect.top - rect.height / 2;
      x = px - (px - x) * ratio;
      y = py - (py - y) * ratio;
      zoom = next;
      schedulePaint();
    }

    function start(event: PointerEvent) {
      if (drag || event.button !== 0 || stage.closest('[inert]')) return;
      event.preventDefault();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      stage.setPointerCapture(event.pointerId);
      stage.classList.add('is-panning');
    }

    function move(event: PointerEvent) {
      if (!drag || drag.id !== event.pointerId) return;
      x += event.clientX - drag.x;
      y += event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      schedulePaint();
    }

    function end(event: PointerEvent) {
      if (drag?.id !== event.pointerId) return;
      drag = null;
      stage.classList.remove('is-panning');
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    }

    const resize = () => { bounds = undefined; };
    stage.addEventListener('wheel', wheel, { passive: false });
    stage.addEventListener('pointerdown', start);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('lostpointercapture', end);
    window.addEventListener('resize', resize);
    return () => {
      stage.removeEventListener('wheel', wheel);
      stage.removeEventListener('pointerdown', start);
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', end);
      stage.removeEventListener('pointercancel', end);
      stage.removeEventListener('lostpointercapture', end);
      window.removeEventListener('resize', resize);
      if (frame !== null) cancelAnimationFrame(frame);
      if (drag && stage.hasPointerCapture(drag.id)) stage.releasePointerCapture(drag.id);
      stage.classList.remove('is-panning');
      image.style.removeProperty('transform');
    };
  }, [wheelFactor]);

  return <div ref={stageRef} className="full-image-stage">
    <div ref={imageRef} className="full-image-center" style={{ width, height }}>{children}</div>
  </div>;
}
