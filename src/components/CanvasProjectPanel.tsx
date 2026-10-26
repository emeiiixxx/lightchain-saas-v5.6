import { useEffect, useRef, type ReactNode } from 'react';
import { Button, Divider } from './ui';

type Props = {
  title: string;
  icon: ReactNode;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onBack: () => void;
  backLabel: string;
  renameLabel: string;
  projectLabel?: string;
  nameLabel?: string;
  nodeId?: string;
};

/** Canvas/ProjectPanel, shared by the image and video flow workspaces. */
export function CanvasProjectPanel(p: Props) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const blurOutside = (event: PointerEvent) => {
      if (input.current && document.activeElement === input.current && event.target !== input.current) input.current.blur();
    };
    document.addEventListener('pointerdown', blurOutside, true);
    return () => document.removeEventListener('pointerdown', blurOutside, true);
  }, []);
  return <section className="project-panel" data-overlay data-node-id={p.nodeId} aria-label={p.projectLabel ?? p.title}>
    <div className="project-heading flex items-center gap-1 px-3 py-2">
      <div className="workspace-icon relative size-5 shrink-0">{p.icon}</div>
      <span className="text-xs leading-4 text-muted">{p.title}</span>
    </div>
    <div className="mx-3"><Divider /></div>
    <div className="flex items-center gap-2 p-2">
      <Button size="m" icon="imgIcon1" className="!w-8 !p-0" aria-label={p.backLabel} title={p.backLabel} onClick={p.onBack} />
      <Divider vertical />
      <input ref={input} className="project-input min-w-0 flex-1" aria-label={p.nameLabel ?? p.renameLabel} placeholder={p.renameLabel}
        value={p.projectName} maxLength={80} onChange={event => p.onProjectNameChange(event.target.value)}
        onBlur={() => { if (!p.projectName.trim()) p.onProjectNameChange('Untitle'); }}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
    </div>
  </section>;
}
