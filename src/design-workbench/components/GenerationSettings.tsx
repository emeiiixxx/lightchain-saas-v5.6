import { useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { useLocale } from '../LocaleContext';
import { Icon } from './ui';

const ratios = ['auto', '2:3', '3:4', '4:5', '9:16', '1:1', '3:2', '4:3', '5:4', '16:9', '21:9'];
type Option = { value: string; label: string; icon?: string };

// Beta semantic states with direct selection and original Icon/AspectRatio exports.
function ParameterSegments({ label, options, value, onChange, vertical = false }: {
  label: string; options: Option[]; value: string; onChange: (value: string) => void; vertical?: boolean;
}) {
  return <div className="parameter-segments-scroll"><div className={`parameter-segments ${vertical ? 'parameter-segments--ratios' : ''}`} role="radiogroup" aria-label={label} style={{ '--segments': options.length } as CSSProperties}>
    {options.map((option, index) => <button type="button" role="radio" aria-checked={value === option.value} tabIndex={value === option.value ? 0 : -1} key={option.value} onClick={() => onChange(option.value)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
      onChange(options[next].value);
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
    }}>{option.icon && <Icon name={option.icon} size={16} />}<span>{option.label}</span></button>)}
  </div></div>;
}

export function GenerationSettings({ anchor, phase, ratio, resolution, count, onRatioChange, onResolutionChange, onCountChange }: {
  anchor: RefObject<HTMLDivElement | null>; phase: 'enter' | 'exit'; ratio: string; resolution: string; count: string;
  onRatioChange: (value: string) => void; onResolutionChange: (value: string) => void; onCountChange: (value: string) => void;
}) {
  const { t } = useLocale();
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    element.showPopover();
    // Keep the opening alignment while labels change; still follow canvas movement and resizing.
    const anchorCenterOffset = (anchor.current?.getBoundingClientRect().width ?? 0) / 2;
    let frame = 0;
    const position = () => {
      const trigger = anchor.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      element.style.left = `${Math.max(16, Math.min(rect.left + anchorCenterOffset - element.offsetWidth / 2, window.innerWidth - element.offsetWidth - 16))}px`;
      element.style.top = `${Math.max(64, Math.min(rect.top - element.offsetHeight - 8, window.innerHeight - element.offsetHeight - 16))}px`;
      frame = requestAnimationFrame(position);
    };
    position();
    return () => { cancelAnimationFrame(frame); if (element.matches(':popover-open')) element.hidePopover(); };
  }, [anchor]);
  return <div ref={panel} id="quick-edit-generation-settings" className="generation-settings" popover="manual" role="dialog" aria-label={t('生成设置')} data-quick-edit-settings data-canvas-ui data-workbench-menu data-phase={phase} inert={phase === 'exit'}>
    <section><h3>{t('图片比例')}</h3><ParameterSegments label={t('图片比例')} vertical value={ratio} onChange={onRatioChange} options={ratios.map(value => ({ value, label: value === 'auto' ? t('智能') : value, icon: `parameter-${value.replace(':', '-')}` }))} /></section>
    <section><h3>{t('选择清晰度')}</h3><ParameterSegments label={t('选择清晰度')} value={resolution} onChange={onResolutionChange} options={[
      { value: '1K', label: `${t('快速')} 1K`, icon: 'parameter-lightning' },
      { value: '2K', label: `${t('高清')} 2K`, icon: 'parameter-hd' },
      { value: '4K', label: `${t('超清')} 4K`, icon: 'parameter-4k' },
    ]} /></section>
    <section><h3>{t('生成数量')}</h3><ParameterSegments label={t('生成数量')} value={count} onChange={onCountChange} options={['1', '2', '3', '4'].map(value => ({ value, label: t(`${value}张`) }))} /></section>
  </div>;
}
