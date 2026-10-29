import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ShapeKind } from '../canvas-shapes';
import { useLocale } from '../LocaleContext';
import { useHoverDismiss } from '../useHoverDismiss';
import { usePresence } from '../usePresence';
import { Button } from './ui';
import './shape-tool-menu.css';

export type { ShapeKind } from '../canvas-shapes';

const shapes: { kind: ShapeKind; label: string }[] = [
  { kind: 'rectangle', label: '矩形' },
  { kind: 'ellipse', label: '圆形' },
  { kind: 'triangle', label: '三角形' },
  { kind: 'line', label: '线条' },
  { kind: 'arrow', label: '箭头' },
];

function ShapeIcon({ kind }: { kind: ShapeKind }) {
  return <svg className="shape-tool-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'rectangle' && <rect x="4" y="4" width="16" height="16" rx="2" />}
    {kind === 'ellipse' && <circle cx="12" cy="12" r="8" />}
    {kind === 'triangle' && <path d="M12 4 21 20H3L12 4Z" />}
    {kind === 'line' && <path d="M4 20 20 4" />}
    {kind === 'arrow' && <path d="m5 19 14-14M10 5h9v9" />}
  </svg>;
}

export function ShapeToolMenu({ activeShape, onSelect, disabled = false }: {
  activeShape: ShapeKind | null;
  onSelect: (kind: ShapeKind) => void;
  disabled?: boolean;
}) {
  const { t } = useLocale();
  const id = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const shown = usePresence(open && !disabled ? true : null);
  const hover = useHoverDismiss(open, () => setOpen(false));
  const close = () => { hover.cancel(); setOpen(false); };
  const focusTrigger = () => anchor.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  const contains = (target: EventTarget | null) => target instanceof Node && (!!anchor.current?.contains(target) || !!panel.current?.contains(target));

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!contains(event.target)) setOpen(false); };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); setOpen(false); focusTrigger();
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    const element = panel.current;
    if (!shown.value || !element) return;
    element.showPopover();
    let frame = 0;
    const position = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const left = Math.max(8, Math.min(rect.left + rect.width / 2 - element.offsetWidth / 2, window.innerWidth - element.offsetWidth - 8));
      const top = Math.max(8, rect.top - element.offsetHeight - 12);
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
      frame = requestAnimationFrame(position);
    };
    position();
    return () => { cancelAnimationFrame(frame); if (element.matches(':popover-open')) element.hidePopover(); };
  }, [shown.value]);

  const enterMenu = (last = false) => {
    if (disabled) return;
    hover.cancel(); setOpen(true);
    requestAnimationFrame(() => {
      const items = panel.current?.querySelectorAll<HTMLButtonElement>('button');
      const selectedIndex = shapes.findIndex(item => item.kind === activeShape);
      items?.[last ? shapes.length - 1 : Math.max(0, selectedIndex)]?.focus({ preventScroll: true });
    });
  };
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
    const index = items.indexOf(event.target as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus({ preventScroll: true });
  };

  return <div ref={anchor} className="shape-tool-anchor" data-workbench-menu onPointerEnter={() => {
    if (disabled) return;
    hover.cancel(); setOpen(true);
  }} onPointerLeave={event => { if (!contains(event.relatedTarget)) hover.schedule(); }} onBlur={event => {
    if (!contains(event.relatedTarget)) close();
  }}>
    <Button className={`workbench-tool shape-tool-trigger${activeShape ? ' is-active' : ''}`} disabled={disabled}
      aria-label={t('形状工具')} title={t('形状工具')} aria-haspopup="menu" aria-expanded={open && !disabled} aria-controls={id}
      onClick={() => { hover.cancel(); setOpen(value => !value); }} onKeyDown={event => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault(); event.stopPropagation(); enterMenu(event.key === 'ArrowUp');
        }
      }}><ShapeIcon kind={activeShape ?? 'rectangle'} /></Button>
    {shown.value && <div ref={panel} id={id} className="shape-tool-menu" popover="manual" role="menu" aria-label={t('形状工具')}
      data-canvas-ui data-workbench-menu data-phase={shown.phase} inert={shown.phase === 'exit'}
      onPointerEnter={hover.cancel} onPointerLeave={event => { if (!contains(event.relatedTarget)) hover.schedule(); }}
      onKeyDown={navigate}>
      {shapes.map(({ kind, label }) => <Button key={kind} className="shape-tool-option" role="menuitemradio" aria-checked={activeShape === kind}
        onClick={() => { close(); onSelect(kind); }}><ShapeIcon kind={kind} /><span>{t(label)}</span></Button>)}
    </div>}
  </div>;
}
