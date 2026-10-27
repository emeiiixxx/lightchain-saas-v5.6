import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Icon } from './ui';
import { usePresence } from '../usePresence';
import { useHoverDismiss } from '../useHoverDismiss';
import { useLocale } from '../LocaleContext';

type Entry = { label: string; icon: string } | null;
const asset = (node: string, name: string) => `menu-41-${node}-${name}`;
const entries: Record<string, Entry[]> = {
  款式: [
    { label: '局部修改', icon: asset('2799', 'imgIconImageEditingTool') },
    { label: '印花上身', icon: asset('2799', 'imgIconBusinessPatternMaterial') },
    { label: '面料替换', icon: asset('2799', 'imgIconBusinessPatternMaterial1') },
    { label: '颜色修改', icon: asset('2799', 'imgIconBusinessPatternMaterial2') },
    null,
    { label: 'AI试衣', icon: asset('2799', 'imgIconBusinessTryOnModel') },
    { label: '转3D平铺', icon: asset('2799', 'imgIconBusinessTryOnModel1') },
    { label: '多视角', icon: asset('2799', 'imgIconBusinessTryOnModel2') },
    null,
    { label: '款式裂变', icon: asset('2799', 'imgLeftIcon') },
  ],
  印花: [
    { label: '印花设计', icon: asset('2583', 'imgLeftIcon') },
    { label: '风格迁移', icon: asset('2583', 'imgIconBusinessPatternMaterial') },
    { label: '四方连续', icon: asset('2583', 'imgIconBusinessPatternMaterial1') },
  ],
  面料: [
    { label: '面料上身', icon: asset('2622', 'imgLeftIcon') },
    { label: '面料创款', icon: asset('2622', 'imgIconBusinessPatternMaterial') },
    { label: '颜色修改', icon: asset('2622', 'imgIconBusinessPatternMaterial1') },
  ],
  线稿: [
    { label: '线稿转实物', icon: asset('2700', 'imgIconLineArt') },
    { label: '实物转线稿', icon: asset('2700', 'imgIconLineArt1') },
    { label: '转矢量图', icon: asset('2700', 'imgNameVectorize') },
  ],
};
const chevron = asset('2700', 'imgStyleLinearNameChevronRight');

export function ElementMenu({ label, icon, open, onToggle, onClose, onAction }: {
  label: string; icon: string; open: boolean; onToggle: () => void; onClose: () => void; onAction: (label: string) => void;
}) {
  const { t } = useLocale();
  const shown = usePresence(open ? true : null);
  const [vectorOpen, setVectorOpen] = useState(false);
  const vector = usePresence(vectorOpen && open ? true : null);
  const menuHover = useHoverDismiss(open, onClose);
  const vectorHover = useHoverDismiss(vectorOpen && open, () => setVectorOpen(false));
  const trigger = useRef<HTMLButtonElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const vectorTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!open) setVectorOpen(false); }, [open]);
  const focusFirst = (selector: string) => requestAnimationFrame(() => anchor.current?.querySelector<HTMLButtonElement>(selector)?.focus());
  const navigate = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const menu = target.closest('[role="menu"]');
    if (!menu) return;
    const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).filter(button => button.closest('[role="menu"]') === menu);
    const index = buttons.indexOf(target as HTMLButtonElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault(); e.stopPropagation();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
    if (e.key === 'Escape' || (e.key === 'ArrowLeft' && menu.classList.contains('element-vector-menu'))) {
      e.preventDefault(); e.stopPropagation();
      if (vectorOpen) { setVectorOpen(false); vectorTrigger.current?.focus(); }
      else { onClose(); trigger.current?.focus(); }
    }
  };
  return <div ref={anchor} className="element-menu-anchor" data-workbench-menu onKeyDown={navigate} onPointerEnter={() => { menuHover.cancel(); if (!open) onToggle(); }} onPointerLeave={menuHover.schedule}>
    <button ref={trigger} type="button" className="lc-button lc-button--ghost lc-button--s element-menu-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={`element-menu-${label}`} onClick={() => { if (!open) onToggle(); }} onKeyDown={e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) onToggle(); focusFirst('.element-design-menu > button'); }
    }}><Icon name={icon} size={20} />{t(label)}<Icon name="toolbar-2907-chevron-down" size={16} className="element-menu-chevron" /></button>
    {shown.value && <div id={`element-menu-${label}`} role="menu" aria-label={t(label)} className="element-design-menu" data-phase={shown.phase} inert={shown.phase === 'exit'}>
      {entries[label].map((item, i) => !item ? <div className="element-menu-divider" role="separator" key={i} /> : item.label === '转矢量图' ?
        <div className="element-vector-anchor" key={item.label} onPointerEnter={() => { menuHover.cancel(); vectorHover.cancel(); setVectorOpen(true); }} onPointerLeave={vectorHover.schedule}>
          <button ref={vectorTrigger} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={vectorOpen} aria-controls="element-vector-menu" onClick={() => { vectorHover.cancel(); setVectorOpen(true); }} onKeyDown={e => { if (e.key === 'ArrowRight') { e.preventDefault(); setVectorOpen(true); focusFirst('.element-vector-menu > button'); } }}><Icon name={item.icon} size={20} /><span>{t(item.label)}</span><Icon name={chevron} size={16} /></button>
          {vector.value && <div id="element-vector-menu" className="element-design-menu element-vector-menu" role="menu" aria-label={t("转矢量图")} data-phase={vector.phase} inert={vector.phase === 'exit'} onBlur={e => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setVectorOpen(false); }}>
            {[['线稿转矢量', 30], ['图案转矢量', 40]].map(([name, points]) => <button type="button" role="menuitem" key={name} onClick={() => onAction(String(name))}><span>{t(String(name))}</span><span className="element-menu-cost"><Icon name={asset('2716', 'imgIconSystem')} size={16} />{points}</span></button>)}
          </div>}
        </div> : <Button role="menuitem" key={item.label} onFocus={e => { if (e.currentTarget.matches(':focus-visible')) setVectorOpen(false); }} onPointerEnter={() => { vectorHover.cancel(); setVectorOpen(false); }} onClick={() => onAction(item.label)}><Icon name={item.icon} size={20} /><span>{t(item.label)}</span></Button>)}
    </div>}
  </div>;
}
