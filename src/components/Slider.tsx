import type { CSSProperties, InputHTMLAttributes } from 'react';
import './slider.css';

type SliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'min' | 'max' | 'value' | 'size'> & {
  min: number;
  max: number;
  value: number;
  active?: boolean;
  trackTone?: 'default' | 'strong';
};

// Lightchain SaaS v5.1 libraries Beta: Slider / Size=M.
// Component set 190e412c7435d6e268fa198927c59b00ff18279d.
export function Slider({ min, max, value, active = false, trackTone = 'default', className = '', style, disabled, ...inputProps }: SliderProps) {
  const progress = max > min ? Math.max(0, Math.min(100, (value - min) / (max - min) * 100)) : 0;
  return <div className={`lc-slider ${className}`} data-active={active} data-disabled={disabled || undefined} data-at-min={progress === 0} data-track-tone={trackTone}
    style={{ ...style, '--slider-progress': `${progress}%` } as CSSProperties}>
    <span className="lc-slider-track" aria-hidden="true" />
    <span className="lc-slider-fill" aria-hidden="true" />
    <input {...inputProps} className="lc-slider-input" type="range" min={min} max={max} value={value} disabled={disabled} />
  </div>;
}
