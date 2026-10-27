import type { CSSProperties, InputHTMLAttributes } from 'react';
import './slider.css';

// 5.1 Beta Slider / M, 628:2246; native range retains keyboard/touch behavior.
export function Slider({ min = 0, max = 100, value, className = '', style, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'min' | 'max' | 'value'> & { min?: number; max?: number; value: number }) {
  const progress = max > min ? Math.max(0, Math.min(100, (value - min) / (max - min) * 100)) : 0;
  return <input {...props} type="range" min={min} max={max} value={value} className={`lc-slider ${className}`} style={{ ...style, '--range-progress': `${progress}%` } as CSSProperties} />;
}
