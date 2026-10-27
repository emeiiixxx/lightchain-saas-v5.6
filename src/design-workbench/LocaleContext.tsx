import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { messages, type Locale } from './i18n';
import { workspaceCopy } from './workspace-copy';
const Context = createContext<{ locale: Locale; setLocale: (locale: Locale) => void; t: (text: string) => string } | null>(null);
const existing = new Map(Object.entries(messages['zh-CN']).map(([key, value]) => [value, key]));
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    try { const saved = localStorage.getItem('lc-v56-design-locale'); if (saved === 'en' || saved === 'ja') return saved; } catch { /* Storage may be unavailable. */ }
    return 'zh-CN';
  });
  useLayoutEffect(() => { document.documentElement.lang = locale; try { localStorage.setItem('lc-v56-design-locale', locale); } catch { /* Keep the in-memory selection. */ } }, [locale]);
  const t = useCallback((text: string) => {
    if (locale === 'zh-CN') return text;
    const imageCount = text.match(/^(\d+)张$/);
    if (imageCount) return locale === 'ja' ? `${imageCount[1]}枚` : `${imageCount[1]} ${Number(imageCount[1]) === 1 ? 'image' : 'images'}`;
    const translated = workspaceCopy[text]?.[locale === 'en' ? 0 : 1];
    const key = existing.get(text) as keyof typeof messages['zh-CN'] | undefined;
    return translated ?? (key ? messages[locale][key] : text);
  }, [locale]);
  return <Context.Provider value={{ locale, setLocale, t }}>{children}</Context.Provider>;
}
export function useLocale() {
  const value = useContext(Context);
  if (!value) throw new Error('useLocale requires LocaleProvider');
  return value;
}
