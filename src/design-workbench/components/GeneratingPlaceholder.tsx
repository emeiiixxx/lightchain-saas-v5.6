import type { CSSProperties } from 'react';
import { useLocale } from '../LocaleContext';
import { usePresence } from '../usePresence';
import './generating-placeholder.css';

// Figma v5.3 103:4313 → Image/GeneratingPlaceholder 103:4264.
// Filter-free gradients match the original light clusters and rotate every three seconds.
export function GeneratingPlaceholder({ style, active = true, suspended = false, zoom }: { style?: CSSProperties; active?: boolean; suspended?: boolean; zoom?: number }) {
  const { locale } = useLocale();
  const shown = usePresence(active ? true : null);
  if (!shown.value) return null;
  const label = locale === 'en' ? 'Generating...' : '生成中...';
  return <div className="generating-placeholder" data-canvas={zoom !== undefined ? true : undefined} data-suspended={suspended} style={{ ...style, '--generation-zoom': zoom ?? 1 } as CSSProperties} data-phase={shown.phase} role="status" aria-label={active ? label : undefined} aria-busy={active} aria-hidden={!active}>
    <div className="generating-placeholder-motion" aria-hidden="true">
      {['green', 'blue', 'purple'].map(color => <div key={color} className={`generating-placeholder-${color}`} />)}
    </div>
    <div className="generating-placeholder-status">
      <div className="generating-placeholder-progress" role="progressbar" aria-label={label}>
        <div className="generating-placeholder-progress-fill" />
      </div>
      <span>{label}</span>
    </div>
  </div>;
}
