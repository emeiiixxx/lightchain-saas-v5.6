import type { ComponentProps } from 'react';
import { Button, Icon } from './ui';
import './generate-task-button.css';

// 5.1 Beta Button/GenerateTask, M: 962:10948 (hover 962:10964).
// This confirmation closes the editor immediately; request loading lives on the canvas.
export function GenerateTaskButton({ cost, showCost = true, children, className = '', ...props }: Omit<ComponentProps<typeof Button>, 'variant' | 'size' | 'icon'> & { cost: number; showCost?: boolean }) {
  return <Button {...props} variant="primary" size="m" className={`lc-generate-task ${className}`}>
    <span>{children}</span>
    {showCost && <><Icon name="generate-task-star" size={16} /><span>{cost}</span></>}
  </Button>;
}
