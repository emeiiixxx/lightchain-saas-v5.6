import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Locale } from '../i18n';
import { clampVideoDuration, videoDurationLimit, videoGenerationConfig, type VideoWorkflow } from '../video-workflow';
import { usePresence } from '../usePresence';
import { Icon } from './ui';
import '../tooltip.css';
import '../video-generation-settings.css';

// Figma 113:8633 / 113:8634 share the original Beta controls and ratio artwork.
const ratios = ['auto', '21:9', '9:16', '16:9', '1:1', '3:4', '4:3'];
const assetBase = `${import.meta.env.BASE_URL}assets/video-settings/`;
const ratioIcon = (ratio: string) => `${assetBase}parameter-${ratio.replace(':', '-')}.svg`;
const copy = {
  'zh-CN': { settings: '生成设置', mode: '生成模式', fast: '快捷模式', professional: '专业模式', sample: '样片模式', ratio: '比例', resolution: '选择清晰度', resolutionHelp: '清晰度说明', resolutionHint: '480P低成本快速出片，满意后选中视频进行高清放大', duration: '视频时长', auto: '自适应', audio: '音频', smart: '智能', mute: '静音', seconds: 's' },
  en: { settings: 'Generation settings', mode: 'Generation mode', fast: 'Fast mode', professional: 'Professional mode', sample: 'Preview mode', ratio: 'Aspect ratio', resolution: 'Resolution', resolutionHelp: 'About resolution', resolutionHint: 'Create a low-cost 480p preview quickly. Once satisfied, select the video to upscale it.', duration: 'Duration', auto: 'Auto', audio: 'Audio', smart: 'Smart', mute: 'Mute', seconds: 's' },
  ja: { settings: '生成設定', mode: '生成モード', fast: 'クイックモード', professional: 'プロモード', sample: 'プレビューモード', ratio: '比率', resolution: '解像度', resolutionHelp: '解像度について', resolutionHint: '480Pで低コストの動画を素早く生成。満足したら動画を選択して高画質化できます。', duration: '動画の長さ', auto: '自動', audio: '音声', smart: '自動', mute: 'ミュート', seconds: 's' },
};
type Settings = Pick<VideoWorkflow, 'ratio' | 'resolution' | 'duration'> & Partial<Pick<VideoWorkflow, 'generationMode' | 'audio'>>;
type Option = { value: string; label: string; icon?: string };

function ParameterSegments({ label, options, value, onChange, onSelect, vertical = false }: {
  label: string; options: Option[]; value: string; onChange: (value: string) => void; onSelect?: (value: string) => void; vertical?: boolean;
}) {
  return <div className="video-parameter-segments-scroll nowheel"><div className={`video-parameter-segments${vertical ? ' video-parameter-segments--ratios' : ''}`} role="radiogroup" aria-label={label} style={{ '--segments': options.length } as CSSProperties}>
    {options.map((option, index) => <button type="button" role="radio" aria-checked={value === option.value} tabIndex={value === option.value ? 0 : -1} key={option.value}
      onClick={() => { if (onSelect) onSelect(option.value); else if (value !== option.value) onChange(option.value); }}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
        if (options[next].value !== value) onChange(options[next].value);
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
      }}>
      {option.icon && <span className="icon" aria-hidden="true" style={{ width: 16, height: 16, '--icon-url': `url("${option.icon}")` } as CSSProperties} />}<span>{option.label}</span>
    </button>)}
  </div></div>;
}

export function VideoGenerationSettings({ locale, value, onChange, autoIcon, chevron, includeModeInSummary = false, summaryIcon }: {
  locale: Locale; value: Settings; onChange: (patch: Partial<Settings>) => void; autoIcon?: string; chevron?: ReactNode; includeModeInSummary?: boolean; summaryIcon?: string;
}) {
  const t = copy[locale];
  const [open, setOpen] = useState(false);
  const shown = usePresence(open ? true : null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const keyboardOpen = useRef(false);
  const id = useId();
  const generationMode = value.generationMode ?? 'fast';
  const config = videoGenerationConfig[generationMode];
  const durationLimit = videoDurationLimit(generationMode);
  const duration = clampVideoDuration(value.duration, generationMode);
  const durationOptions = Array.from({ length: durationLimit / 5 }, (_, index) => {
    const seconds = (index + 1) * 5;
    return { value: `${seconds}s`, label: `${seconds}${t.seconds}` };
  });
  const summary = `${includeModeInSummary ? `${t[generationMode]} ｜ ` : ''}${value.ratio === 'auto' ? t.auto : value.ratio} ｜ ${value.resolution === '480p' ? t.sample : value.resolution} ｜ ${duration}`;
  const summaryIconUrl = summaryIcon ?? (value.ratio === 'auto' && autoIcon ? autoIcon : ratioIcon(value.ratio));

  function changeGenerationMode(next: string) {
    const mode = next === 'professional' ? 'professional' : 'fast';
    const nextDuration = clampVideoDuration(value.duration, mode);
    if (mode !== generationMode || nextDuration !== value.duration) {
      onChange({ generationMode: mode, duration: nextDuration });
    }
  }

  function close() {
    setOpen(false);
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
      event.preventDefault(); event.stopPropagation();
      close(); trigger.current?.focus();
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
      popup.style.left = `${Math.max(16, Math.min(rect.left + rect.width / 2 - popup.offsetWidth / 2, innerWidth - popup.offsetWidth - 16))}px`;
      popup.style.top = `${Math.max(64, Math.min(rect.top - popup.offsetHeight - 8, innerHeight - popup.offsetHeight - 16))}px`;
      if (open) frame = requestAnimationFrame(position);
    };
    position();
    if (open && keyboardOpen.current) {
      popup.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
      keyboardOpen.current = false;
    }
    return () => cancelAnimationFrame(frame);
  }, [shown.value, open]);

  function expand(fromKeyboard = false) {
    if (open && fromKeyboard) { panel.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus(); return; }
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
      <span className="icon video-generation-settings-ratio-icon" aria-hidden="true" style={{ '--icon-url': `url("${summaryIconUrl}")` } as CSSProperties} />
      <span className="lc-setting-select-value">{summary}</span>{chevron ?? <Icon name="imgChevron" size={16} className="lc-setting-select-chevron" />}
    </button>
    {shown.value && createPortal(<div ref={panel} id={id} className="video-generation-settings nodrag nopan nowheel" popover="manual" role="dialog" aria-label={t.settings}
      data-node-id={config.nodeId} data-select-popup data-overlay data-phase={shown.phase} inert={shown.phase === 'exit'} onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const stops = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"][tabindex="0"], button[data-tooltip], input'));
        const edge = event.shiftKey ? stops[0] : stops[stops.length - 1];
        if (document.activeElement === edge) { event.preventDefault(); close(); trigger.current?.focus(); }
      }}>
      <section className="video-generation-mode-setting"><h3>{t.mode}</h3><ParameterSegments label={t.mode} value={generationMode}
        onChange={changeGenerationMode} onSelect={changeGenerationMode}
        options={[{ value: 'fast', label: t.fast }, { value: 'professional', label: t.professional }]} /></section>
      <section><h3>{t.ratio}</h3><ParameterSegments label={t.ratio} vertical value={value.ratio} onChange={ratio => onChange({ ratio })}
        options={ratios.map(ratio => ({ value: ratio, label: ratio === 'auto' ? t.auto : ratio, icon: ratioIcon(ratio) }))} /></section>
      <section><div className="video-resolution-heading"><h3>{t.resolution}</h3>
        {generationMode === 'professional' && <button type="button" className="video-resolution-help" aria-label={t.resolutionHelp} data-tooltip={t.resolutionHint} data-tooltip-side="right" data-tooltip-width="200">
          <span className="icon" aria-hidden="true" style={{ width: 16, height: 16, '--icon-url': `url("${assetBase}resolution-info.svg")` } as CSSProperties} />
        </button>}
      </div><ParameterSegments label={t.resolution} value={value.resolution} onChange={resolution => onChange({ resolution })}
        options={config.resolutions.map(resolution => ({ value: resolution, label: resolution === '480p' ? t.sample : resolution }))} /></section>
      <section className="video-duration-setting"><h3>{t.duration}</h3>
        <ParameterSegments label={t.duration} value={duration} options={durationOptions}
          onChange={nextDuration => onChange({ duration: nextDuration })} />
      </section>
      <section><h3>{t.audio}</h3><ParameterSegments label={t.audio} value={value.audio ?? 'auto'} onChange={audio => onChange({ audio: audio === 'mute' ? 'mute' : 'auto' })}
        options={config.audioOptions.map(audio => ({ value: audio, label: audio === 'mute' ? t.mute : t.smart }))} /></section>
    </div>, document.body)}
  </div>;
}
