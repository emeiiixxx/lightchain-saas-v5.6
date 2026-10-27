import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useLocale } from '../LocaleContext';
import { usePresence } from '../usePresence';
import { useHoverDismiss } from '../useHoverDismiss';
import { modelDestinations, sendDestinations, type SendDestinationId } from '../send-destinations';
import { Button, Icon } from './ui';

export function ElementSendMenu({ open, onToggle, onClose, onSend, withLabel = false, disabled = false }: { disabled?: boolean; withLabel?: boolean; open: boolean; onToggle: () => void; onClose: () => void; onSend: (destination: SendDestinationId) => void }) {
  const { locale } = useLocale();
  const label = locale === 'en' ? 'Send to' : locale === 'ja' ? '送信先' : '发送至';
  const text = (item: { zh: string; en: string; ja: string }) => locale === 'en' ? item.en : locale === 'ja' ? item.ja : item.zh;
  const trigger = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const submenu = useRef<HTMLDivElement>(null);
  const modelTrigger = () => panel.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
  const [modelOpen, setModelOpen] = useState(false);
  const shown = usePresence(open ? true : null);
  const shownModel = usePresence(open && modelOpen ? true : null);
  const modelHover = useHoverDismiss(open && modelOpen, () => setModelOpen(false));
  const cancelClose = modelHover.cancel;
  const close = () => { cancelClose(); setModelOpen(false); onClose(); };
  const send = (id: SendDestinationId) => { close(); onSend(id); };
  useEffect(() => {
    if (!open) setModelOpen(false);
  }, [open]);

  useLayoutEffect(() => {
    if (!shown.value || !panel.current) return;
    const element = panel.current;
    element.showPopover();
    let frame = 0;
    const position = () => {
      const rect = trigger.current?.getBoundingClientRect(); if (!rect) return;
      const left = `${Math.max(16, Math.min(rect.left, window.innerWidth - element.offsetWidth - 16))}px`;
      const below = rect.bottom + 8;
      const top = `${Math.max(16, below + element.offsetHeight <= window.innerHeight - 16 ? below : rect.top - element.offsetHeight - 8)}px`;
      if (element.style.left !== left) element.style.left = left;
      if (element.style.top !== top) element.style.top = top;
      frame = requestAnimationFrame(position);
    };
    position();
    return () => { cancelAnimationFrame(frame); if (element.matches(':popover-open')) element.hidePopover(); };
  }, [shown.value]);

  useLayoutEffect(() => {
    if (!shownModel.value || !submenu.current) return;
    const element = submenu.current;
    element.showPopover();
    let frame = 0;
    const position = () => {
      const parent = panel.current?.getBoundingClientRect();
      const row = modelTrigger()?.getBoundingClientRect();
      if (!parent || !row) return;
      const right = parent.right - 4;
      const flip = right + element.offsetWidth > window.innerWidth - 16;
      const side = flip ? 'left' : 'right';
      const left = `${Math.max(16, flip ? parent.left - element.offsetWidth + 4 : right)}px`;
      const top = `${Math.max(16, Math.min(row.top - 9, window.innerHeight - element.offsetHeight - 16))}px`;
      if (element.dataset.side !== side) element.dataset.side = side;
      if (element.style.left !== left) element.style.left = left;
      if (element.style.top !== top) element.style.top = top;
      frame = requestAnimationFrame(position);
    };
    position();
    return () => { cancelAnimationFrame(frame); if (element.matches(':popover-open')) element.hidePopover(); };
  }, [shownModel.value]);

  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(':scope > button'));
    const index = items.indexOf(event.target as HTMLButtonElement);
    items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };
  const enterModel = () => {
    cancelClose(); setModelOpen(true);
    requestAnimationFrame(() => submenu.current?.querySelector('button')?.focus());
  };
  const activateItem = (hasSubmenu: boolean) => {
    cancelClose(); setModelOpen(hasSubmenu);
  };
  return <div ref={trigger} className={`element-menu-anchor${withLabel ? ' element-send-with-label' : ''}`} data-workbench-menu onPointerEnter={cancelClose} onPointerLeave={event => {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) modelHover.schedule();
  }}>
    <Button disabled={disabled} className="workbench-tool element-menu-trigger" aria-label={label} title={withLabel ? undefined : label} aria-haspopup="menu" aria-expanded={open} aria-controls="element-send-menu" onClick={onToggle} onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault(); if (!open) onToggle();
      const last = event.key === 'ArrowUp';
      requestAnimationFrame(() => { const items = panel.current?.querySelectorAll<HTMLButtonElement>(':scope > button'); items?.[last ? items.length - 1 : 0]?.focus(); });
    }}><Icon name="element-send" size={withLabel ? 16 : 20} />{withLabel && <span>{label}</span>}</Button>
    {shown.value && <div ref={panel} id="element-send-menu" className="element-design-menu element-send-menu" popover="manual" role="menu" aria-label={label} data-canvas-ui data-workbench-menu data-phase={shown.phase} inert={shown.phase === 'exit'} onPointerEnter={cancelClose} onPointerLeave={event => {
      if (!(event.relatedTarget instanceof Node) || !submenu.current?.contains(event.relatedTarget)) modelHover.schedule();
    }} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); trigger.current?.querySelector('button')?.focus(); return; }
      navigate(event);
    }}>
      {sendDestinations.map(item => 'children' in item
        ? <Button key={item.id} role="menuitem" aria-haspopup="menu" aria-expanded={open && modelOpen} aria-controls="element-send-model-menu" onPointerEnter={() => activateItem(true)} onClick={enterModel} onKeyDown={event => {
          if (event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); enterModel(); }
        }}><span>{text(item)}</span><Icon name="menu-41-2700-imgStyleLinearNameChevronRight" size={16} /></Button>
        : <Button key={item.id} role="menuitem" onPointerEnter={() => activateItem(false)} onFocus={event => { if (event.currentTarget.matches(':focus-visible')) activateItem(false); }} onClick={() => send(item.id)}><span>{text(item)}</span></Button>)}
    </div>}
    {shownModel.value && <div ref={submenu} id="element-send-model-menu" className="element-design-menu element-send-menu element-send-submenu" data-phase={shownModel.phase} inert={shownModel.phase === 'exit'} popover="manual" role="menu" aria-label={text(sendDestinations[1])} data-canvas-ui data-workbench-menu onPointerEnter={cancelClose} onPointerLeave={event => {
      const next = event.relatedTarget;
      if (!(next instanceof Node) || (!panel.current?.contains(next) && !event.currentTarget.contains(next))) modelHover.schedule();
    }} onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); modelTrigger()?.focus(); setModelOpen(false); return;
      }
      navigate(event);
    }}>
      {modelDestinations.map(item => <Button key={item.id} role="menuitem" onPointerEnter={cancelClose} onClick={() => send(item.id)}><span>{text(item)}</span></Button>)}
    </div>}
  </div>;
}
