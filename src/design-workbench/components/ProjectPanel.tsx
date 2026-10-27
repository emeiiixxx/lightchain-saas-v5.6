import { useEffect, useRef } from 'react';
import { useLocale } from '../LocaleContext';
import { Button, Divider, Icon } from './ui';

// v5.3 Canvas/ProjectPanel, with the v5.4 workspace artwork from Figma 2:13785.
export function ProjectPanel({ name, onNameChange, onBack }: { name: string; onNameChange: (name: string) => void; onBack: () => void }) {
  const { t } = useLocale();
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const finishEditing = (event: PointerEvent) => {
      const input = nameInput.current;
      if (input && document.activeElement === input && !event.composedPath().includes(input)) input.blur();
    };
    // The locked canvas prevents the default pointer focus change; commit before that handler.
    window.addEventListener('pointerdown', finishEditing, true);
    return () => window.removeEventListener('pointerdown', finishEditing, true);
  }, []);
  return <section className="project-panel" data-canvas-ui aria-label={t("项目")} data-node-id="2:13785">
    <div className="project-heading flex items-center gap-1 px-3 py-2">
      <div className="workspace-icon relative size-5 shrink-0"><img src="/assets/design-workbench/workspace-bg.png" alt="" width="20" height="20" /><img className="workspace-artwork" src="/assets/design-workbench/workspace.svg" alt="" width="20" height="20" /></div>
      <span className="text-xs leading-4 text-muted">{t("设计生产工作台")}</span>
    </div>
    <div className="mx-3"><Divider /></div>
    <div className="flex items-center gap-2 p-2">
      <Button className="!w-8 !p-0" aria-label={t("返回项目")} title={t("返回项目")} onClick={onBack}><Icon name="back" size={20} /></Button>
      <Divider vertical />
      <input ref={nameInput} className="project-input min-w-0 flex-1" aria-label={t("项目名称")} placeholder={t("重命名项目")} value={name} maxLength={80} onChange={e => onNameChange(e.target.value)} onBlur={e => onNameChange(e.currentTarget.value.trim() || 'Untitle')} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur(); }} />
    </div>
  </section>;
}
