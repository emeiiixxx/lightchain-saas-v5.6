import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from 'react';
import { useLocale } from '../LocaleContext';
import type { Notify } from '../notification';
import { usePresence } from '../usePresence';
import { Divider, IconButton } from './ui';

const palette = ['#FFFFFF', '#FF4C4C', '#DD26FF', '#087DFF', '#22D4E9', '#00D447', '#FF8500', '#FFA0A8', '#F394FA', '#B69AFF', '#9FF8FF', '#D2FF00', '#FFAC2D', '#FFB622'];
const clamp = (value: number, max = 100) => Math.max(0, Math.min(max, value));
function normalizeHex(value: string) {
  const hex = value.trim().replace(/^#/, '');
  if (/^[\da-f]{6}$/i.test(hex)) return `#${hex.toUpperCase()}`;
  if (/^[\da-f]{3}$/i.test(hex)) return `#${[...hex].map(char => char + char).join('').toUpperCase()}`;
  return null;
}
function toHsv(hex: string) {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const hue = delta === 0 ? 0 : max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { h: hue * 60, s: max ? delta / max * 100 : 0, v: max * 100 };
}
function toHex(h: number, s: number, v: number) {
  const saturation = s / 100, value = v / 100;
  const channel = (n: number) => { const k = (n + h / 60) % 6; return Math.round(255 * (value - value * saturation * Math.max(0, Math.min(k, 4 - k, 1)))).toString(16).padStart(2, '0'); };
  return `#${channel(5)}${channel(3)}${channel(1)}`.toUpperCase();
}
function HexField({ color, begin, change }: { color: string; begin: () => void; change: (value: string) => void }) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(color);
  useEffect(() => setDraft(color), [color]);
  return <input className="hex-field" aria-label={t('描边颜色代码')} value={draft} maxLength={7} spellCheck={false} onFocus={begin} onChange={event => setDraft(event.target.value)} onBlur={() => { const next = normalizeHex(draft); if (next) change(next); setDraft(next ?? color); }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
}
function OpacityField({ value, begin, change }: { value: number; begin: () => void; change: (value: number) => void }) {
  const { t } = useLocale();
  return <label className="property-number"><input type="number" min={0} max={100} aria-label={t('描边透明度')} value={value} onFocus={begin} onChange={event => { if (Number.isFinite(event.currentTarget.valueAsNumber)) change(clamp(event.currentTarget.valueAsNumber)); }} /><span>%</span></label>;
}

export function StrokeColorPicker({ color = '#DADADA', opacity = 100, onBegin, onChange, onNotify }: {
  color?: string; opacity?: number; onBegin: () => void; onChange: (patch: { stroke?: string; strokeOpacity?: number }) => void; onNotify: Notify;
}) {
  const { t } = useLocale();
  const hex = normalizeHex(color) ?? '#DADADA';
  const [open, setOpen] = useState(false);
  const shown = usePresence(open ? true : null);
  const row = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const active = useRef(true);
  const eyedropperAbort = useRef<AbortController | null>(null);
  const [hue, setHue] = useState(() => toHsv(hex).h);
  const hsv = toHsv(hex);
  useEffect(() => { if (hsv.s > 0) setHue(hsv.h); }, [hex]);
  useEffect(() => { active.current = true; return () => { active.current = false; eyedropperAbort.current?.abort(); }; }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: globalThis.PointerEvent) => { if (!row.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); setOpen(false); row.current?.querySelector<HTMLButtonElement>('.color-swatch')?.focus(); } };
    document.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', escape, true); };
  }, [open]);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!shown.value || !element) return;
    element.showPopover();
    const position = () => {
      const anchor = row.current?.getBoundingClientRect(); if (!anchor) return;
      const below = anchor.bottom + 8;
      const top = below + element.offsetHeight <= window.innerHeight - 16 ? below : anchor.top - element.offsetHeight - 8;
      element.style.left = `${Math.max(16, Math.min(anchor.left, window.innerWidth - element.offsetWidth - 16))}px`;
      element.style.top = `${Math.max(64, Math.min(top, window.innerHeight - element.offsetHeight - 16))}px`;
    };
    position();
    const observer = new ResizeObserver(position); observer.observe(element);
    window.addEventListener('resize', position); document.addEventListener('scroll', position, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', position); document.removeEventListener('scroll', position, true); if (element.matches(':popover-open')) element.hidePopover(); };
  }, [shown.value]);
  const pickScreenColor = async () => {
    const EyeDropper = (window as unknown as { EyeDropper?: new () => { open: (options: { signal: AbortSignal }) => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!EyeDropper) { onNotify('当前浏览器不支持屏幕取色，请使用色板或输入颜色值', 'error'); return; }
    eyedropperAbort.current?.abort();
    const controller = new AbortController(); eyedropperAbort.current = controller;
    try { const result = await new EyeDropper().open({ signal: controller.signal }); if (active.current) { onBegin(); onChange({ stroke: result.sRGBHex.toUpperCase() }); } }
    catch (error) { if (active.current && !(error instanceof DOMException && error.name === 'AbortError')) onNotify('取色失败，请重试', 'error'); }
  };
  const changeSv = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onChange({ stroke: toHex(hue, clamp((event.clientX - rect.left) / rect.width * 100), clamp(100 - (event.clientY - rect.top) / rect.height * 100)) });
  };
  const beginRange = (event: ReactKeyboardEvent<HTMLInputElement>) => { if (!event.repeat && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) onBegin(); };
  return <div ref={row} className="stroke-color-row">
    <button type="button" className="color-swatch" aria-label={t('描边颜色')} data-tooltip={t('描边颜色')} aria-haspopup="dialog" aria-expanded={open} aria-controls="stroke-color-panel" onClick={() => setOpen(value => !value)}><span style={{ backgroundColor: hex }} /></button>
    <HexField color={hex} begin={onBegin} change={stroke => onChange({ stroke })} />
    <OpacityField value={opacity} begin={onBegin} change={strokeOpacity => onChange({ strokeOpacity })} />
    <IconButton size="m" icon="prop-imgIcon3" className="color-eyedropper" aria-label={t('屏幕取色')} onClick={() => void pickScreenColor()} />
    {shown.value && <div ref={panel} id="stroke-color-panel" className="stroke-color-panel" popover="manual" role="dialog" aria-label={t('描边颜色')} data-canvas-ui data-phase={shown.phase} inert={shown.phase === 'exit'}>
      <div className="color-sv" role="slider" tabIndex={0} aria-label={t('饱和度与明度')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hsv.s)} aria-valuetext={`${t('饱和度')} ${Math.round(hsv.s)}%, ${t('明度')} ${Math.round(hsv.v)}%`} style={{ '--picker-hue': hue } as CSSProperties} onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); onBegin(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); changeSv(event); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) changeSv(event); }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); if (!event.repeat) onBegin(); const step = event.shiftKey ? 10 : 1;
        onChange({ stroke: toHex(hue, clamp(hsv.s + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)), clamp(hsv.v + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0))) });
      }}><span className="color-sv-thumb" style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, backgroundColor: hex }} /></div>
      <input className="color-hue-slider" type="range" min={0} max={360} step={1} value={hue} aria-label={t('色相')} style={{ '--picker-thumb': `hsl(${hue} 100% 50%)` } as CSSProperties} onPointerDown={onBegin} onKeyDown={beginRange} onChange={event => { const next = Number(event.target.value); setHue(next); onChange({ stroke: toHex(next, hsv.s, hsv.v) }); }} />
      <div className="color-alpha-track"><input className="color-alpha-slider" type="range" min={0} max={100} value={opacity} aria-label={t('描边透明度')} style={{ backgroundImage: `linear-gradient(to right, ${hex}00, ${hex})`, '--picker-thumb': hex } as CSSProperties} onPointerDown={onBegin} onKeyDown={beginRange} onChange={event => onChange({ strokeOpacity: Number(event.target.value) })} /></div>
      <div className="color-panel-values"><HexField color={hex} begin={onBegin} change={stroke => onChange({ stroke })} /><OpacityField value={opacity} begin={onBegin} change={strokeOpacity => onChange({ strokeOpacity })} /><IconButton size="m" icon="prop-imgIcon3" aria-label={t('屏幕取色')} onClick={() => void pickScreenColor()} /></div>
      <Divider />
      <section className="color-recommendations"><h3>{t('推荐色板')}</h3><div className="color-palette">{palette.map(value => <button type="button" key={value} aria-label={value} aria-pressed={hex === value} data-tooltip={value} style={{ backgroundColor: value }} onClick={() => { onBegin(); onChange({ stroke: value }); }} />)}</div></section>
    </div>}
  </div>;
}
