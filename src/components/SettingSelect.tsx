import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from '../usePresence';
import { Icon, type IconName } from './ui';

type Props = { label: string; value: string; placeholder?: string; icon?: IconName; chevron?: ReactNode; options: { value: string; label: string }[]; onChange: (value: string) => void };

const resolutionIcons: Record<string, IconName> = { '1K': 'resolution1k', '2K': 'resolution2k', '4K': 'resolution4k' };
const ratioIcons: Record<string, IconName> = {
  auto: 'ratioAuto', '1:1': 'ratio1x1', '2:3': 'ratio2x3', '3:2': 'ratio3x2',
  '3:4': 'ratio3x4', '4:3': 'ratio4x3', '4:5': 'ratio4x5', '5:4': 'ratio5x4',
  '9:16': 'ratio9x16', '16:9': 'ratio16x9', '21:9': 'ratio21x9',
};

// 5.1 Beta Select 66:194 + DropdownMenuContent 891:4592 + Option 380:2728.
// The trigger belongs to its node. The menu belongs to the viewport's top layer.
export function SettingSelect({ label, value, placeholder, icon, chevron, options, onChange }: Props) {
  const isResolutionMenu = icon === 'fusionHd';
  const menuKind = isResolutionMenu ? 'resolution' : icon === 'fusionRatio' ? 'ratio' : undefined;
  const optionIcons = menuKind === 'ratio' ? ratioIcons : isResolutionMenu ? resolutionIcons : undefined;
  const triggerIcon = optionIcons?.[value] ?? icon;
  const [open, setOpen] = useState(false);
  const shown = usePresence(open ? true : null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const keyboardOpen = useRef(false);
  const id = useId();

  useEffect(() => {
    const outside = (target: EventTarget | null) => target instanceof Node && !trigger.current?.contains(target) && !menu.current?.contains(target);
    const dismiss = (event: PointerEvent) => {
      if (!outside(event.target)) return;
      setOpen(false);
      const active = document.activeElement;
      if (active instanceof HTMLElement && (active === trigger.current || menu.current?.contains(active))) active.blur();
    };
    const focus = (event: FocusEvent) => { if (outside(event.target)) setOpen(false); };
    const otherSelect = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) setOpen(false); };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('focusin', focus, true);
    document.addEventListener('lc-select-open', otherSelect);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('focusin', focus, true);
      document.removeEventListener('lc-select-open', otherSelect);
    };
  }, [id]);

  useLayoutEffect(() => {
    if (!shown.value || !menu.current || !trigger.current) return;
    const popup = menu.current;
    if (!popup.matches(':popover-open')) popup.showPopover();
    let frame = 0;
    const position = () => {
      const anchor = trigger.current;
      if (!anchor?.isConnected) { setOpen(false); return; }
      const rect = anchor.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) { setOpen(false); return; }
      const below = innerHeight - rect.bottom - 12, above = rect.top - 12;
      const menuSpacing = menuKind ? 4 : 8;
      const desiredHeight = options.length * 32 + Math.max(0, options.length - 1) * menuSpacing + menuSpacing * 2 + 2;
      // Ratio and resolution menus always open downward; overflow scrolls inside.
      const side = menuKind || below >= desiredHeight || below >= above ? 'bottom' : 'top';
      const available = Math.max(32, side === 'bottom' ? below : above);
      popup.dataset.side = side;
      popup.style.width = `${Math.min(Math.max(228, rect.width), innerWidth - 16)}px`;
      popup.style.maxHeight = `${available}px`;
      popup.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - popup.offsetWidth - 8))}px`;
      popup.style.top = `${side === 'bottom' ? rect.bottom + 4 : rect.top - popup.offsetHeight - 4}px`;
      if (open) frame = requestAnimationFrame(position);
    };
    position();
    if (open && keyboardOpen.current) {
      (popup.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? popup.querySelector<HTMLButtonElement>('[role="menuitemradio"]'))?.focus();
      keyboardOpen.current = false;
    }
    return () => cancelAnimationFrame(frame);
  }, [shown.value, open, options.length, menuKind]);

  function expand(fromKeyboard = false) {
    keyboardOpen.current = fromKeyboard;
    document.dispatchEvent(new CustomEvent('lc-select-open', { detail: id }));
    setOpen(true);
  }
  function close(restoreFocus: boolean) { setOpen(false); if (restoreFocus) trigger.current?.focus(); }

  return <div className="fusion-setting">
    <button ref={trigger} type="button" className="lc-setting-select" data-node-id="66:71" aria-label={label} aria-haspopup="menu" aria-controls={id} aria-expanded={open}
      onClick={() => open ? close(false) : expand()}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); expand(true); }
        if (event.key === 'Escape' && open) { event.stopPropagation(); close(false); }
      }}>
      {triggerIcon && <Icon name={triggerIcon} size={16} />}<span className="lc-setting-select-value">{options.find(option => option.value === value)?.label ?? placeholder}</span>{chevron ?? <Icon name="imgChevron" size={16} className="lc-setting-select-chevron" />}
    </button>
    {shown.value && createPortal(<div ref={menu} popover="manual" className="lc-select-popup" data-setting-kind={menuKind} data-select-popup data-overlay data-node-id="891:4592" data-phase={shown.phase} inert={shown.phase === 'exit'} role="menu" id={id} aria-label={label}
      onKeyDown={event => {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); event.stopPropagation(); buttons[next]?.focus(); }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
        if (event.key === 'Tab') { close(true); }
      }}>
      {options.map(option => <button type="button" key={option.value} className="lc-select-option" data-node-id={value === option.value ? '380:2704' : '380:2696'} role="menuitemradio" aria-checked={value === option.value} tabIndex={value === option.value ? 0 : -1}
        onClick={() => { onChange(option.value); close(true); }}>{optionIcons?.[option.value] && <Icon name={optionIcons[option.value]} size={16} className="lc-select-option-icon" />}<span className="lc-select-option-label">{option.label}</span>{value === option.value && <Icon name="check" size={16} />}</button>)}
    </div>, document.body)}
  </div>;
}
