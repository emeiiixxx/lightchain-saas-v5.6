import { canvasLayouts, type CanvasLayout } from '../canvas-arrangement';
import { useLocale } from '../LocaleContext';
import { Button, Icon } from './ui';

type Props = {
  id: string;
  label: string;
  className: string;
  phase?: 'enter' | 'exit';
  onSelect: (layout: CanvasLayout) => void;
  onEscape?: () => void;
};

export function CanvasArrangeMenu({ id, label, className, phase, onSelect, onEscape }: Props) {
  const { locale } = useLocale();
  return <div id={id} className={`element-design-menu ${className}`} role="menu" aria-label={label} data-phase={phase} inert={phase === 'exit'} onKeyDown={event => {
    if (event.key === 'Escape' && onEscape) {
      event.preventDefault(); event.stopPropagation(); onEscape(); return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }}>
    {canvasLayouts.map(layout => <Button key={layout.value} role="menuitem" onClick={() => onSelect(layout.value)}>
      <Icon name={`canvas-arrange-${layout.value}`} size={20} />
      <span>{locale === 'en' ? layout.en : locale === 'ja' ? layout.ja : layout.label}</span>
    </Button>)}
  </div>;
}
