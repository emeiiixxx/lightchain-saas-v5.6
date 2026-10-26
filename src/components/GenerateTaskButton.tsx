import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from './ui';

// Business Button/GenerateTask, separate from the primitive Primary button.
export function GenerateTaskButton({ label, cost, costIcon = <Icon name="fusionStar" size={16} />, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; cost?: string; costIcon?: ReactNode }) {
  return <button type="button" className={`generate-task-button ${className}`} data-node-id="88:32168" {...props}>
    <span>{label}</span>{cost !== undefined && <>{costIcon}<span className="generate-task-cost">{cost}</span></>}
  </button>;
}
