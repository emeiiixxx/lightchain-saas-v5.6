import type { ReactNode } from 'react';
import './tag-chip.css';

// 5.1 Beta TagChip / Filled / default / S (141:24101).
export function TagChip({ children, leading, trailing, className = '' }: { children: ReactNode; leading?: ReactNode; trailing?: ReactNode; className?: string }) {
  return <span className={`lc-tag-chip ${className}`}>
    <span className="lc-tag-chip-slot" aria-hidden={!leading}>{leading}</span>
    <span>{children}</span>
    <span className="lc-tag-chip-slot" aria-hidden={!trailing}>{trailing}</span>
  </span>;
}
