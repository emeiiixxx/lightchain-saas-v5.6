import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Locale } from '../i18n';
import { materialGenerationAssets, materialRatioOptions } from '../material-generation-settings-assets';
import { usePresence } from '../usePresence';
import '../video-generation-settings.css';
import '../material-generation-settings.css';

const copy = {
  'zh-CN': { settings: '生成设置', ratio: '比例', resolution: '选择清晰度', count: '生图数量', imageCount: (count: number) => `${count}张` },
  en: { settings: 'Generation settings', ratio: 'Aspect ratio', resolution: 'Resolution', count: 'Image count', imageCount: (count: number) => `${count} ${count === 1 ? 'image' : 'images'}` },
  ja: { settings: '生成設定', ratio: '比率', resolution: '解像度', count: '生成枚数', imageCount: (count: number) => `${count}枚` },
};

export type MaterialGenerationSettingsPatch = { ratio?: string; resolution?: string; count?: number };
type Props = {
  locale: Locale;
  ratio: string;
  resolution: string;
  count: number;
  onChange: (patch: MaterialGenerationSettingsPatch) => void;
  chevron?: ReactNode;
};
type Option = { value: string; label: string; icon?: string };

function Artwork({ src, size = 16, className = '' }: { src: string; size?: number; className?: string }) {
  return <span className={`icon ${className}`} aria-hidden="true" style={{ width: size, height: size, '--icon-url': `url("${src}")` } as CSSProperties} />;
}

export function MaterialRatioIcon({ ratio, size = 16 }: { ratio: string; size?: number }) {
  return <Artwork src={materialGenerationAssets.ratioIcon(ratio)} size={size} className="material-generation-ratio-icon" />;
}

// Reuse the video parameter control's Beta styling and radio keyboard contract.
// Material options remain local, so video settings keep their own allowed values.
function MaterialParameterSegments({ label, options, value, onChange, vertical = false }: {
  label: string; options: Option[]; value: string; onChange: (value: string) => void; vertical?: boolean;
}) {
  const activeIndex = Math.max(0, options.findIndex(option => option.value === value));
  return <div className="video-parameter-segments-scroll nowheel"><div className={`video-parameter-segments${vertical ? ' video-parameter-segments--ratios' : ''}`} role="radiogroup" aria-label={label} style={{ '--segments': options.length } as CSSProperties}>
    {options.map((option, index) => <button type="button" role="radio" key={option.value} aria-checked={value === option.value} tabIndex={index === activeIndex ? 0 : -1}
      onClick={() => { if (value !== option.value) onChange(option.value); }}
      onFocus={event => {
        if (!vertical) return;
        const button = event.currentTarget;
        const scroll = button.parentElement?.parentElement;
        if (!scroll) return;
        const left = button.offsetLeft;
        const right = left + button.offsetWidth;
        if (left < scroll.scrollLeft) scroll.scrollLeft = left;
        else if (right > scroll.scrollLeft + scroll.clientWidth) scroll.scrollLeft = right - scroll.clientWidth;
      }}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
        if (value !== options[next].value) onChange(options[next].value);
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus({ preventScroll: true });
      }}>
      {option.icon && <Artwork src={option.icon} />}<span>{option.label}</span>
    </button>)}
  </div></div>;
}

export function MaterialGenerationSettings({ locale, ratio, resolution, count, onChange, chevron }: Props) {
  const t = copy[locale];
  const [open, setOpen] = useState(false);
  const shown = usePresence(open ? true : null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const keyboardOpen = useRef(false);
  const id = useId();
  const summary = `${ratio === 'auto' ? 'Auto' : ratio} ｜ ${resolution} ｜ ${t.imageCount(count)}`;

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!open) return;
    const outside = (target: EventTarget | null) => target instanceof Node && !trigger.current?.contains(target) && !panel.current?.contains(target);
    const dismiss = (event: PointerEvent) => {
      if (!outside(event.target)) return;
      close();
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && (focused === trigger.current || panel.current?.contains(focused))) focused.blur();
    };
    const focus = (event: FocusEvent) => { if (outside(event.target)) close(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); close(true);
    };
    const otherSelect = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) close(); };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('focusin', focus, true);
    document.addEventListener('keydown', escape);
    document.addEventListener('lc-select-open', otherSelect);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('focusin', focus, true);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('lc-select-open', otherSelect);
    };
  }, [open, id]);

  useLayoutEffect(() => {
    if (!shown.value || !panel.current || !trigger.current) return;
    const popup = panel.current;
    if (!popup.matches(':popover-open')) popup.showPopover();
    let frame = 0;
    const position = () => {
      const anchor = trigger.current;
      if (!anchor?.isConnected || !anchor.getClientRects().length || anchor.closest('[hidden], [inert]')) { close(); return; }
      const rect = anchor.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) { close(); return; }
      const inset = 16;
      const safeTop = Math.min(64, Math.max(inset, innerHeight - popup.offsetHeight - inset));
      const above = rect.top - popup.offsetHeight - 8;
      const below = rect.bottom + 8;
      const top = above >= safeTop || below + popup.offsetHeight > innerHeight - inset ? above : below;
      popup.style.left = `${Math.max(inset, Math.min(rect.left + rect.width / 2 - popup.offsetWidth / 2, innerWidth - popup.offsetWidth - inset))}px`;
      popup.style.top = `${Math.max(safeTop, Math.min(top, innerHeight - popup.offsetHeight - inset))}px`;
      if (open) frame = requestAnimationFrame(position);
    };
    position();
    if (open && keyboardOpen.current) {
      popup.querySelector<HTMLButtonElement>('[role="radio"][tabindex="0"]')?.focus({ preventScroll: true });
      keyboardOpen.current = false;
    }
    return () => {
      cancelAnimationFrame(frame);
      if (popup.matches(':popover-open')) popup.hidePopover();
    };
  }, [shown.value, open]);

  function expand(fromKeyboard = false) {
    if (open && fromKeyboard) { panel.current?.querySelector<HTMLButtonElement>('[role="radio"][tabindex="0"]')?.focus({ preventScroll: true }); return; }
    keyboardOpen.current = fromKeyboard;
    document.dispatchEvent(new CustomEvent('lc-select-open', { detail: id }));
    setOpen(true);
  }

  return <div className="fusion-setting">
    <button ref={trigger} type="button" className="lc-setting-select nodrag nopan" aria-label={t.settings} aria-haspopup="dialog" aria-controls={id} aria-expanded={open}
      onClick={event => open ? close() : expand(event.detail === 0)}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Tab' && open && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); expand(true); }
      }}>
      <MaterialRatioIcon ratio={ratio} /><span className="lc-setting-select-value">{summary}</span>
      {chevron ?? <Artwork src={materialGenerationAssets.chevron} className="lc-setting-select-chevron" />}
    </button>
    {shown.value && createPortal(<div ref={panel} id={id} className="video-generation-settings material-generation-settings nodrag nopan nowheel" popover="manual" role="dialog" aria-label={t.settings}
      data-node-id="141:24676" data-select-popup data-overlay data-phase={shown.phase} inert={shown.phase === 'exit'}
      onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const stops = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"][tabindex="0"]'));
        const edge = event.shiftKey ? stops[0] : stops[stops.length - 1];
        if (document.activeElement === edge) { event.preventDefault(); close(true); }
      }}>
      <section><h3>{t.ratio}</h3><MaterialParameterSegments label={t.ratio} vertical value={ratio} onChange={next => onChange({ ratio: next })}
        options={materialRatioOptions.map(option => ({ value: option, label: option === 'auto' ? 'Auto' : option, icon: materialGenerationAssets.ratioIcon(option) }))} /></section>
      <section><h3>{t.resolution}</h3><MaterialParameterSegments label={t.resolution} value={resolution} onChange={next => onChange({ resolution: next })}
        options={(['1K', '2K', '4K'] as const).map(option => ({ value: option, label: option, icon: materialGenerationAssets.resolutionIcons[option] }))} /></section>
      <section><h3>{t.count}</h3><MaterialParameterSegments label={t.count} value={String(count)} onChange={next => onChange({ count: Number(next) })}
        options={[1, 2, 3, 4].map(option => ({ value: String(option), label: t.imageCount(option) }))} /></section>
    </div>, trigger.current?.closest('dialog') ?? document.body)}
  </div>;
}
