import type { ButtonHTMLAttributes } from 'react';
import './choice-chip.css';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> & { selected: boolean };

// 5.1 Beta ChoiceChip / Outline / M. The consuming group owns selection.
export function ChoiceChip({ selected, className = '', children, ...props }: Props) {
  return <button {...props} type="button" className={`lc-choice-chip nodrag nopan ${className}`} aria-pressed={selected}>
    {children}
  </button>;
}
