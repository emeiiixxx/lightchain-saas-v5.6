import { useLocale } from '../LocaleContext';
import { isValidElement, type ButtonHTMLAttributes, type CSSProperties, type ReactNode, useLayoutEffect, useRef } from 'react';

// Reuses the 5.3 component API and Beta semantic foregrounds. Artwork is exported from Figma.
export function Icon({ name, size = 20, className = '' }: { name: string; size?: number; className?: string }) {
  return <span aria-hidden="true" className={`icon ${className}`} style={{ width: size, height: size, '--icon-url': `url("/assets/design-workbench/${name}.svg")` } as CSSProperties} />;
}
export function Button({ variant = 'ghost', size = 's', icon, children, className = '', title, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ghost' | 'primary' | 'outline' | 'secondary' | 'tonal' | 'danger'; size?: 's' | 'm' | 'l'; icon?: string }) {
  const iconOnly = (!children && !!icon) || (isValidElement(children) && children.type === Icon);
  const tooltip = title || (iconOnly ? props['aria-label'] : undefined);
  return <button type="button" className={`lc-button lc-button--${variant} lc-button--${size} ${!children ? 'lc-button--icon' : ''} ${className}`} {...props} data-tooltip={tooltip}>{icon && <Icon name={icon} size={size === 's' ? 16 : size === 'm' ? 20 : 24} />}{children}</button>;
}
export function Divider({ vertical = false }: { vertical?: boolean }) { return <span aria-hidden="true" className={`divider ${vertical ? 'divider--vertical' : ''}`} />; }
// IconButton uses XS=20, S=24, M=32, L=40, independently of Button sizing.
export function IconButton({ size = 'm', icon, className = '', ...props }: Omit<Parameters<typeof Button>[0], 'children' | 'size'> & { icon: string; size?: 'xs' | 's' | 'm' | 'l' }) {
  return <Button {...props} size="s" data-component="IconButton" data-size={size.toUpperCase()} className={`lc-icon-button lc-icon-button--${size} ${className}`}><Icon name={icon} size={size === 'xs' || size === 's' ? 16 : size === 'm' ? 20 : 24} /></Button>;
}
export function Dialog({ title, children, onClose, phase = 'enter', className = '', closeLabel = '关闭', closeIcon = 'close', closeOnEscape = true, closeOnBackdrop = true }: { title: ReactNode; children: ReactNode; onClose: () => void; phase?: 'enter' | 'exit'; className?: string; closeLabel?: string; closeIcon?: string; closeOnEscape?: boolean; closeOnBackdrop?: boolean }) {
  const { t } = useLocale();
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.setAttribute('closedby', closeOnEscape ? 'closerequest' : 'none');
    if (closeOnEscape) return;
    // Block the browser's Escape close request before it reaches global shortcuts.
    const blockEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !dialog.open) return;
      const targetDialog = event.target instanceof Element ? event.target.closest('dialog') : null;
      if (targetDialog && targetDialog !== dialog) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const blockCancel = (event: Event) => {
      if (event.target !== dialog) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', blockEscape, true);
    dialog.addEventListener('cancel', blockCancel);
    return () => {
      window.removeEventListener('keydown', blockEscape, true);
      dialog.removeEventListener('cancel', blockCancel);
    };
  }, [closeOnEscape]);
  useLayoutEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} data-phase={phase} inert={phase === 'exit'} className={`lc-dialog ${className}`} aria-labelledby="dialog-title" onCancel={e => { e.preventDefault(); if (closeOnEscape) onClose(); }} onClick={e => { if (closeOnBackdrop && e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}><div className="dialog-header flex items-center justify-between gap-6 mb-5"><h2 id="dialog-title" className="font-medium text-lg">{title}</h2><Button aria-label={t(closeLabel)} className="!w-8 !p-0" onClick={onClose}><Icon name={closeIcon} size={20} /></Button></div>{children}</dialog>;
}
