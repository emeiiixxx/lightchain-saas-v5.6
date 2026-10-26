import type { ButtonHTMLAttributes } from 'react';
import './switch.css';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'onClick' | 'role' | 'aria-checked'> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

// 5.1 Beta Switch / Size=S: 32×18 track, 14×14 handle, 2px inset.
export function Switch({ checked, onCheckedChange, className = '', ...props }: Props) {
  return <button {...props} type="button" role="switch" aria-checked={checked}
    className={`lc-switch nodrag nopan ${className}`} onClick={() => onCheckedChange(!checked)}>
    <span className="lc-switch-handle" aria-hidden="true" />
  </button>;
}
