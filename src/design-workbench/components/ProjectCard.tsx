import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useLocale } from '../LocaleContext';
import { usePresence } from '../usePresence';
import { ProgressiveImage } from './ProgressiveImage';
import { Button, Icon, IconButton } from './ui';
import './project-card.css';

type Props = {
  name: string;
  coverUrl?: string;
  updatedAt: number;
  onNameChange: (name: string) => void;
  onOpen: () => void;
  onMoreAction: () => void;
};

export function ProjectCard({ name, coverUrl, updatedAt, onNameChange, onOpen, onMoreAction }: Props) {
  const { t, locale } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = usePresence(menuOpen ? true : null);
  const trigger = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const moreLabel = locale === 'en' ? 'More actions' : locale === 'ja' ? 'その他の操作' : '更多操作';
  useLayoutEffect(() => {
    const element = panel.current;
    if (!menu.value || !element) return;
    element.showPopover();
    const position = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      element.style.left = `${Math.max(8, Math.min(rect.right - element.offsetWidth, innerWidth - element.offsetWidth - 8))}px`;
      element.style.top = `${Math.max(8, rect.bottom + element.offsetHeight + 8 <= innerHeight - 8 ? rect.bottom + 8 : rect.top - element.offsetHeight - 8)}px`;
    };
    position();
    element.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => {
      if (!element.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      if (element.matches(':popover-open')) element.hidePopover();
    };
  }, [menu.value]);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const minutes = Math.max(0, Math.floor((now - updatedAt) / 60_000));
  const amount = minutes < 60 ? minutes : minutes < 1440 ? Math.floor(minutes / 60) : Math.floor(minutes / 1440);
  const unit = minutes < 60 ? 'minute' : minutes < 1440 ? 'hour' : 'day';
  const ago = new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(-amount, unit);
  const modified = minutes === 0
    ? locale === 'en' ? 'Edited just now' : locale === 'ja' ? 'たった今更新' : '刚刚修改'
    : locale === 'en' ? `Edited ${ago}` : locale === 'ja' ? `${ago}に更新` : `${ago}修改`;
  return <article className="project-card" data-node-id="150:8933" data-hover-node-id="150:8966" data-menu-open={menuOpen}>
    <button type="button" className="project-card-preview" aria-label={`${t('返回画布')} · ${name}`} onClick={onOpen}>
      {coverUrl ? <ProgressiveImage src={coverUrl} alt={t('项目封面')} fit="cover" eager /> : <img className="project-card-default-cover" src="/assets/design-workbench/project-default-cover.png" alt={t('项目封面')} width={72} height={72} />}
    </button>
    <div className="project-card-info">
      <input className="project-card-name" aria-label={t('项目名称')} placeholder={t('重命名项目')} title={name} value={name} maxLength={80} onChange={event => onNameChange(event.target.value)} onBlur={event => onNameChange(event.currentTarget.value.trim() || 'Untitle')} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur(); }} />
      <time className="project-card-updated" dateTime={new Date(updatedAt).toISOString()} title={new Date(updatedAt).toLocaleString(locale)}>{modified}</time>
    </div>
    <div ref={trigger} className="project-card-more">
      <IconButton size="m" variant="tonal" icon="project-card-more" aria-label={moreLabel} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuId} onClick={() => setMenuOpen(value => !value)} onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault(); setMenuOpen(true);
        const last = event.key === 'ArrowUp';
        requestAnimationFrame(() => { const items = panel.current?.querySelectorAll('button'); items?.[last ? items.length - 1 : 0]?.focus(); });
      }} />
    </div>
    {menu.value && <div ref={panel} id={menuId} className="image-context-menu project-card-menu" popover="manual" role="menu" aria-label={moreLabel} tabIndex={-1} data-phase={menu.phase} inert={menu.phase === 'exit'} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false); trigger.current?.querySelector('button')?.focus(); return; }
      if (event.key === 'Tab') { setMenuOpen(false); trigger.current?.querySelector('button')?.focus(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const items = Array.from(event.currentTarget.querySelectorAll('button'));
      const index = items.indexOf(event.target as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index < 0 ? (event.key === 'ArrowDown' ? 0 : items.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }}>
      {[
        ['置顶', 'Pin', 'ピン留め', 'library-promptPin'],
        ['保存至资源库', 'Save to asset library', 'ライブラリに保存', 'asset-center'],
        ['删除', 'Delete', '削除', 'task-record-delete'],
      ].map(([zh, en, ja, icon]) => <Button key={zh} role="menuitem" onClick={() => { setMenuOpen(false); trigger.current?.querySelector('button')?.focus(); onMoreAction(); }}><Icon name={icon} size={20} /><span>{locale === 'en' ? en : locale === 'ja' ? ja : zh}</span></Button>)}
    </div>}
  </article>;
}
