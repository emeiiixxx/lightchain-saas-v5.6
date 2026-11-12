import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Locale } from '../i18n';
import type { FusionSettings } from '../canvas';
import { fusionAspectRatios, parseFusionCustomRatio } from '../fusion-aspect-ratio';
import { usePresence } from '../usePresence';
import { Icon } from './ui';
import { notify } from './Toast';
import '../fusion-ratio-select.css';

const copy = {
  'zh-CN': { label: '图片比例', auto: '自动', custom: '自定义', width: '宽', height: '高', confirm: '确认', invalid: '请输入有效的正整数宽高比' },
  en: { label: 'Aspect ratio', auto: 'Auto', custom: 'Custom', width: 'Width', height: 'Height', confirm: 'Apply', invalid: 'Enter a valid positive whole number for width and height' },
  ja: { label: '画像比率', auto: '自動', custom: 'カスタム', width: '幅', height: '高さ', confirm: '確認', invalid: '幅と高さに有効な正の整数を入力してください' },
};

type Props = {
  locale: Locale;
  value: string;
  custom: boolean;
  savedInput?: FusionSettings['customRatioInput'];
  onChange: (patch: Partial<Pick<FusionSettings, 'ratio' | 'ratioMode' | 'customRatioInput'>>) => void;
};

function RatioIcon({ ratio, size = 20 }: { ratio: string; size?: number }) {
  const file = ratio.replace(':', '-');
  return <span aria-hidden="true" className="icon" style={{ width: size, height: size,
    '--icon-url': `url("${import.meta.env.BASE_URL}assets/fusion-ratio/${file}.svg")` } as CSSProperties} />;
}

// Figma 202:12611 / 202:12857 / 202:13027. Remember inputs independently
// from the applied ratio, including when the virtualized node remounts.
export function FusionRatioSelect({ locale, value, custom, savedInput, onChange }: Props) {
  const t = copy[locale];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [invalid, setInvalid] = useState(false);
  const shown = usePresence(open ? true : null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const widthInput = useRef<HTMLInputElement>(null);
  const keyboardOpen = useRef(false);
  const id = useId();

  useEffect(() => {
    const outside = (target: EventTarget | null) => target instanceof Node && !trigger.current?.contains(target) && !menu.current?.contains(target);
    const dismiss = (event: PointerEvent | FocusEvent) => { if (outside(event.target)) setOpen(false); };
    const otherSelect = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) setOpen(false); };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('focusin', dismiss, true);
    document.addEventListener('lc-select-open', otherSelect);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('focusin', dismiss, true);
      document.removeEventListener('lc-select-open', otherSelect);
    };
  }, [id]);

  useLayoutEffect(() => {
    if (!shown.value || !menu.current) return;
    const popup = menu.current;
    if (!popup.matches(':popover-open')) popup.showPopover();
    let frame = 0;
    const position = () => {
      const anchor = trigger.current;
      if (!anchor?.isConnected) { setOpen(false); return; }
      const rect = anchor.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) { setOpen(false); return; }
      const below = innerHeight - rect.bottom - 12;
      // Keep the ratio menu below its trigger; long lists scroll internally.
      popup.dataset.side = 'bottom';
      popup.style.maxHeight = `${Math.max(32, below)}px`;
      popup.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - popup.offsetWidth - 8))}px`;
      popup.style.top = `${rect.bottom + 4}px`;
      if (open) frame = requestAnimationFrame(position);
    };
    position();
    if (open && keyboardOpen.current) {
      if (custom) widthInput.current?.focus({ preventScroll: true });
      else popup.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
      keyboardOpen.current = false;
    }
    return () => cancelAnimationFrame(frame);
  }, [shown.value, open, custom]);

  function expand(fromKeyboard = false) {
    const [w = '', h = ''] = custom ? value.split(':') : [];
    setWidth(savedInput?.width ?? w); setHeight(savedInput?.height ?? h);
    setEditing(false); setInvalid(false);
    keyboardOpen.current = fromKeyboard;
    document.dispatchEvent(new CustomEvent('lc-select-open', { detail: id }));
    setOpen(true);
  }
  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }
  function changeInput(field: 'width' | 'height', text: string) {
    const input = { width, height, [field]: text };
    setWidth(input.width); setHeight(input.height); setInvalid(false);
    // Draft edits never apply a ratio or update the account's active settings.
    onChange({ customRatioInput: input });
  }
  function confirm() {
    const ratio = parseFusionCustomRatio(width, height);
    if (!ratio) { setInvalid(true); notify(t.invalid, 'error'); return; }
    const [w, h] = ratio.split(':');
    setWidth(w); setHeight(h); setInvalid(false); setEditing(false);
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && menu.current?.contains(active)) active.blur();
    onChange({ ratio, ratioMode: 'custom', customRatioInput: { width: w, height: h } });
  }

  return <div className="fusion-setting">
    <button ref={trigger} type="button" className="lc-setting-select" aria-label={t.label} aria-haspopup="dialog" aria-controls={id} aria-expanded={open}
      onClick={() => open ? close() : expand()}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); expand(true); }
        if (event.key === 'Escape' && open) { event.stopPropagation(); close(); }
      }}>
      <RatioIcon ratio={custom ? 'custom' : fusionAspectRatios.some(ratio => ratio === value) ? value : 'auto'} size={16} />
      <span className="lc-setting-select-value">{custom ? `${t.custom} ${value}` : value === 'auto' ? t.auto : value}</span>
      <Icon name="imgChevron" size={16} className="lc-setting-select-chevron" />
    </button>
    {shown.value && createPortal(<div ref={menu} popover="manual" className="lc-select-popup fusion-ratio-popup nodrag nopan nowheel" data-select-popup data-overlay data-node-id={editing ? '202:12857' : custom ? '202:13027' : '202:12611'} data-phase={shown.phase} inert={shown.phase === 'exit'} role="dialog" id={id} aria-label={t.label}
      onPointerDown={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
        if (event.target instanceof HTMLInputElement) {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); confirm(); }
          return;
        }
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-ratio-option]'));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (index < 0) return;
        const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); event.stopPropagation(); buttons[next]?.focus(); }
      }}>
      <div className="fusion-ratio-custom" data-selected={custom && !editing} data-editing={editing} role="group" aria-label={t.custom}>
        <RatioIcon ratio="custom" />
        <span className="fusion-ratio-custom-label" aria-hidden={editing} onClick={() => widthInput.current?.focus()}><span>{t.custom}</span></span>
        <div className="fusion-ratio-fields">
          <label className="fusion-ratio-input" data-invalid={invalid}>
            <span aria-hidden="true">W</span><input ref={widthInput} aria-label={`${t.custom} ${t.width}`} aria-invalid={invalid} inputMode="numeric" autoComplete="off" placeholder={t.width} value={width}
              onFocus={() => setEditing(true)} onChange={event => changeInput('width', event.target.value)} />
          </label>
          <span aria-hidden="true">:</span>
          <label className="fusion-ratio-input" data-invalid={invalid}>
            <span aria-hidden="true">H</span><input aria-label={`${t.custom} ${t.height}`} aria-invalid={invalid} inputMode="numeric" autoComplete="off" placeholder={t.height} value={height}
              onFocus={() => setEditing(true)} onChange={event => changeInput('height', event.target.value)} />
          </label>
          <span className="fusion-ratio-confirm-slot" aria-hidden={!editing} inert={!editing}>
            <button type="button" className="fusion-ratio-confirm" onClick={confirm}>{t.confirm}</button>
          </span>
        </div>
      </div>
      <div className="fusion-ratio-divider" />
      {fusionAspectRatios.map(ratio => <button type="button" key={ratio} className="fusion-ratio-option" data-ratio-option data-selected={!editing && !custom && value === ratio} aria-pressed={!custom && value === ratio}
        onClick={() => { onChange({ ratio, ratioMode: undefined, customRatioInput: { width, height } }); close(true); }}>
        <RatioIcon ratio={ratio} /><span>{ratio === 'auto' ? t.auto : ratio}</span>
        {!editing && !custom && value === ratio && <RatioIcon ratio="check" size={16} />}
      </button>)}
    </div>, document.body)}
  </div>;
}
