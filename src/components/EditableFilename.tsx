import { useLayoutEffect, useRef, useState } from 'react';
import './editable-filename.css';

/** Edit the basename only; the file's real format remains unchanged. */
export function EditableFilename({ name, onRename, autoEdit = false, onEditingEnd, className = '' }: {
  name: string; onRename?: (name: string) => void; autoEdit?: boolean; onEditingEnd?: () => void; className?: string;
}) {
  const suffix = name.match(/\.[^.]+$/)?.[0] ?? '';
  const basename = suffix ? name.slice(0, -suffix.length) : name;
  const [editing, setEditing] = useState(autoEdit);
  const [draft, setDraft] = useState(basename);
  const input = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useLayoutEffect(() => { if (editing) { input.current?.focus({ preventScroll: true }); input.current?.select(); } }, [editing]);
  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const value = draft.trim();
    if (save && value && value + suffix !== name) onRename?.(value + suffix);
    setEditing(false); onEditingEnd?.();
  };
  return <span className={`editable-filename nodrag nopan ${className}`} data-tooltip={editing ? undefined : name}
    onDoubleClick={event => {
      if (!onRename) return;
      event.preventDefault(); event.stopPropagation(); if (editing) return; finished.current = false; setDraft(basename); setEditing(true);
    }} onPointerDown={event => event.stopPropagation()} onClick={event => { if (editing) event.stopPropagation(); }}>
    {editing ? <input ref={input} className="editable-filename-input" aria-label="文件名" value={draft}
      onChange={event => setDraft(event.target.value)} onBlur={() => finish(true)}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); finish(event.key === 'Enter'); }
      }} onCopy={event => event.stopPropagation()} onPaste={event => event.stopPropagation()} onCut={event => event.stopPropagation()} /> : name}
  </span>;
}
