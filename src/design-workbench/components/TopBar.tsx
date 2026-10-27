import { useEffect, useState } from 'react';
import { Button, Divider, Icon } from './ui';
import { usePresence } from '../usePresence';
import { useLocale } from '../LocaleContext';

const locales = [{ value: 'zh-CN', label: '简体中文' }, { value: 'en', label: 'English' }, { value: 'ja', label: '日本語' }] as const;
const copy = {
  'zh-CN': { language: '语言', help: '帮助中心', support: '联系客服', credits: '购买积分', switchLight: '切换到浅色模式', switchDark: '切换到深色模式' },
  en: { language: 'Language', help: 'Help center', support: 'Contact support', credits: 'Buy credits', switchLight: 'Switch to light mode', switchDark: 'Switch to dark mode' },
  ja: { language: '言語', help: 'ヘルプ', support: 'お問い合わせ', credits: 'クレジット購入', switchLight: 'ライトモードに切り替え', switchDark: 'ダークモードに切り替え' },
};

// Shared shell copied from v5.3. Its AI try-on route belongs to that project.
export function TopBar({ theme, onThemeChange, onModal }: { theme: 'dark' | 'light'; onThemeChange: (theme: 'dark' | 'light') => void; onModal: (modal: 'help' | 'support' | 'points') => void }) {
  const { locale, setLocale } = useLocale();
  const [menu, setMenu] = useState(false);
  const shownMenu = usePresence(menu ? true : null);
  const t = copy[locale];
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => { if (!(e.target instanceof Element) || !e.target.closest('[data-menu]')) setMenu(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    window.addEventListener('pointerdown', close); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', key); };
  }, [menu]);
  return <header className="topbar flex items-center justify-between gap-2 px-6">
    <div className="flex items-center gap-6 min-w-0">
      <div className="brand flex items-center gap-2 shrink-0" aria-label="Lightchain">
        <img src="/assets/design-workbench/imgContainerLightchainLogo01.svg" alt="" width="24" height="24" />
        <Icon name="imgContainerLightchainLogo02" size={113} className="wordmark" />
      </div>
      <div className="flex items-center gap-2">
        <div className="relative" data-menu>
          <button className="language-trigger flex items-center gap-2 h-8 px-2 rounded-lg" aria-label={t.language} aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <Icon name="imgIconSystem" /><span className="language-label">{locales.find(l => l.value === locale)?.label}</span><Icon name="imgChevron" size={16} />
          </button>
          {shownMenu.value && <div data-phase={shownMenu.phase} inert={shownMenu.phase === 'exit'} className="popover language-menu" aria-label={t.language}>
            {locales.map(l => <button key={l.value} className="menu-option" aria-pressed={locale === l.value} onClick={() => { setLocale(l.value); setMenu(false); }}>{l.label}<Icon name="check" size={16} className={locale === l.value ? 'option-check is-selected' : 'option-check'} /></button>)}
          </div>}
        </div>
        <Button className="theme-toggle !w-8 !p-0" aria-label={theme === 'dark' ? t.switchLight : t.switchDark} title={theme === 'dark' ? t.switchLight : t.switchDark} onClick={() => { onThemeChange(theme === 'dark' ? 'light' : 'dark'); setMenu(false); }}>
          <Icon name={theme === 'dark' ? 'theme-moon' : 'theme-sun'} size={18} />
        </Button>
      </div>
    </div>
    <div className="topbar-actions flex items-center gap-4 shrink-0">
      <Button icon="imgIconSystem1" className="help-button" onClick={() => onModal('help')} title={t.help}><span className="header-action-label">{t.help}</span></Button>
      <Button icon="imgIconSystem2" className="support-button" onClick={() => onModal('support')} title={t.support}><span className="header-action-label">{t.support}</span></Button>
      <button className="purchase-button" onClick={() => onModal('points')}>
        <span>{t.credits}</span><Divider vertical /><span className="purchase-cost"><Icon name="imgIconSystem3" size={16} /><span className="purchase-balance">99999</span></span>
      </button>
      <span className="avatar"><img src="/assets/design-workbench/imgImageFill.png" alt="" width="32" height="32" /></span>
    </div>
  </header>;
}
