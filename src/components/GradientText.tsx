'use client';

// React Bits GradientText, adapted from the component source supplied by the
// user. React-only: retain its variants and add shared icon coordinates, a
// single-band shimmer variant, typed props and lifecycle guards.
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import './GradientText.css';

type Variant = 'linear' | 'flow' | 'conic' | 'shimmer';
type Props = {
  children: ReactNode;
  colors?: string[];
  animationSpeed?: number;
  /** Seconds at rest between shimmer sweeps. */
  pauseDuration?: number;
  variant?: Variant;
  angle?: number;
  direction?: 'horizontal' | 'vertical' | 'diagonal';
  scale?: number;
  yoyo?: boolean;
  glow?: number;
  showBorder?: boolean;
  borderWidth?: number;
  pauseOnHover?: boolean;
  followPointer?: boolean;
  className?: string;
  style?: CSSProperties;
};

const ANGLES = { horizontal: 90, vertical: 180, diagonal: 135 };
const TAU = Math.PI * 2;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function GradientText({ children, colors = ['#5227FF', '#FF9FFC', '#B497CF'],
  animationSpeed = 8, pauseDuration = 0, variant = 'linear', angle = 90, direction, scale = 3,
  yoyo = true, glow = 0, showBorder = false, borderWidth = 1.5,
  pauseOnHover = false, followPointer = false, className = '', style }: Props) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const wakeRef = useRef<(() => void) | null>(null);
  const palette = colors.length > 1 ? colors : [colors[0] ?? '#ffffff', colors[0] ?? '#ffffff'];
  const settings = { colors: palette, speed: Math.max(0.2, animationSpeed), pause: Math.max(0, pauseDuration), variant,
    angle: direction ? ANGLES[direction] : angle, scale: clamp(scale, 1, 6), yoyo, pauseOnHover, followPointer };
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Masked icons sample the same full-row gradient as the text, rather than
  // restarting the palette inside their smaller box. Measure layout size so
  // canvas zoom does not change the shared gradient coordinate system.
  useLayoutEffect(() => {
    const root = rootRef.current, content = contentRef.current;
    if (!root || !content) return;
    const resize = (width: number, height: number) => {
      root.style.setProperty('--gt-content-width', `${width}px`);
      root.style.setProperty('--gt-content-height', `${height}px`);
    };
    const computed = getComputedStyle(content);
    resize(parseFloat(computed.width) || content.offsetWidth, parseFloat(computed.height) || content.offsetHeight);
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { wakeRef.current?.(); });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const state = { time: 0, inside: false, visible: true, x: .5, y: .5, px: .5, py: .5, vx: 0, vy: 0, pull: 0 };
    let raf = 0, last = 0, alive = true;

    const paint = () => {
      const s = settingsRef.current, list = s.colors, cycle = state.time / s.speed;
      let image: string;
      if (s.variant === 'shimmer') {
        const elapsed = state.time % (s.speed + s.pause);
        const base = list[0], highlight = list[1];
        if (reducedMotion.matches || elapsed >= s.speed) {
          image = `linear-gradient(${s.angle}deg, ${base}, ${base})`;
        } else {
          // The entire band starts and finishes outside the content. Resting
          // frames therefore stay at the base color, with no reset flash.
          const halfBand = 30;
          const center = -halfBand + (100 + 2 * halfBand) * elapsed / s.speed;
          image = `linear-gradient(${s.angle}deg, ${base} ${(center - halfBand).toFixed(2)}%, ${highlight} ${center.toFixed(2)}%, ${base} ${(center + halfBand).toFixed(2)}%)`;
        }
      } else if (s.variant === 'flow') {
        const blobs = list.map((color, i) => {
          const spin = cycle * TAU, rate = .55 + ((i * .618) % 1) * .5;
          let x = 50 + 44 * Math.sin(spin * rate + i * 2.1);
          let y = 50 + 40 * Math.sin(spin * (rate * .83 + .21) + i * 1.3);
          if (i === 0) { x += (state.px * 100 - x) * state.pull; y += (state.py * 100 - y) * state.pull; }
          return `radial-gradient(ellipse ${(22 + 12 * s.scale).toFixed(1)}% ${(60 + 30 * s.scale).toFixed(1)}% at ${x.toFixed(2)}% ${y.toFixed(2)}%, ${color} 0%, transparent 100%)`;
        });
        image = `${blobs.join(', ')}, linear-gradient(${s.angle}deg, ${list.join(', ')})`;
      } else if (s.variant === 'conic') {
        const sway = s.yoyo ? Math.sin(cycle * Math.PI) * 50 : cycle * 360;
        const cx = 50 + (state.px * 100 - 50) * state.pull;
        const cy = 260 + (state.py * 100 - 260) * state.pull;
        image = `repeating-conic-gradient(from ${(sway - 30).toFixed(2)}deg at ${cx.toFixed(2)}% ${cy.toFixed(2)}%, ${[...list, list[0]].map((color, i) => `${color} ${((i / list.length) * 60 * (3 / s.scale)).toFixed(2)}deg`).join(', ')})`;
      } else {
        const loop = [...list, list[0]], period = 100 * s.scale;
        const swing = cycle % 2, t = swing < 1 ? swing : 2 - swing;
        let offset = s.yoyo ? (.5 - Math.cos(Math.PI * t) / 2) * (period - 100) : (cycle % 1) * period;
        offset += (state.px - .5) * period * .5 * state.pull;
        // Positive stop travel follows the gradient direction: 90deg moves
        // left to right. Shifting one complete period gives a seamless loop.
        image = `repeating-linear-gradient(${s.angle}deg, ${loop.map((color, i) => `${color} ${((i / (loop.length - 1)) * period + offset).toFixed(2)}%`).join(', ')})`;
      }
      root.style.setProperty('--gt-gradient', image);
    };
    const tick = (now: number) => {
      raf = 0;
      if (!alive || !state.visible || document.hidden) return;
      const s = settingsRef.current;
      const elapsed = Math.max(0, (now - last) / 1000);
      const dt = Math.min(.05, elapsed);
      last = now;
      const paused = reducedMotion.matches || (s.pauseOnHover && state.inside);
      if (!paused) state.time += s.variant === 'shimmer' ? elapsed : dt;
      const target = !reducedMotion.matches && s.followPointer && state.inside ? 1 : 0;
      state.pull += (target - state.pull) * (1 - Math.exp(-dt * 6));
      const stiffness = 160;
      state.vx += ((state.x - state.px) * stiffness - state.vx * 2 * Math.sqrt(stiffness)) * dt;
      state.vy += ((state.y - state.py) * stiffness - state.vy * 2 * Math.sqrt(stiffness)) * dt;
      state.px += state.vx * dt; state.py += state.vy * dt;
      paint();
      const settling = Math.abs(state.pull - target) > .001 || Math.abs(state.vx) + Math.abs(state.vy) > .001;
      if (reducedMotion.matches || (paused && !settling)) return;
      raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (raf || !alive || !state.visible || document.hidden) return;
      last = performance.now(); raf = requestAnimationFrame(tick);
    };
    wakeRef.current = () => { paint(); wake(); };
    const locate = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      state.x = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      state.y = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    };
    const onEnter = (event: PointerEvent) => {
      locate(event);
      if (!state.inside) { state.px = state.x; state.py = state.y; }
      state.inside = true; wake();
    };
    const onMove = (event: PointerEvent) => { locate(event); if (settingsRef.current.followPointer) wake(); };
    const onLeave = () => { state.inside = false; wake(); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const onVisibility = () => { if (document.hidden) stop(); else wake(); };
    const onMotionChange = () => { stop(); state.pull = 0; paint(); wake(); };
    const observer = new IntersectionObserver(entries => {
      state.visible = entries.some(entry => entry.isIntersecting);
      if (state.visible) wake(); else stop();
    });
    observer.observe(root);
    root.addEventListener('pointerenter', onEnter);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    reducedMotion.addEventListener('change', onMotionChange);
    paint(); wake();
    return () => {
      alive = false; stop(); observer.disconnect();
      root.removeEventListener('pointerenter', onEnter);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener('change', onMotionChange);
      wakeRef.current = null;
    };
  }, []);

  const loop = [...palette, palette[0]];
  const initialGradient = variant === 'shimmer'
    ? `linear-gradient(${settings.angle}deg, ${palette[0]}, ${palette[0]})`
    : variant === 'linear'
    ? `repeating-linear-gradient(${settings.angle}deg, ${loop.map((color, i) => `${color} ${(i / (loop.length - 1)) * 100 * settings.scale}%`).join(', ')})`
    : `linear-gradient(${settings.angle}deg, ${loop.join(', ')})`;
  return <span ref={rootRef} className={`gradient-text${showBorder ? ' gradient-text--border' : ''}${className ? ` ${className}` : ''}`}
    style={{ '--gt-gradient': initialGradient,
      '--gt-border': `${borderWidth}px`, '--gt-glow': clamp(glow, 0, 1), ...style } as CSSProperties}>
    <span className="gradient-text__inner">
      <span ref={contentRef} className="gradient-text__content">{children}</span>
      {glow > 0 && <span className="gradient-text__glow" aria-hidden="true">{children}</span>}
    </span>
  </span>;
}
