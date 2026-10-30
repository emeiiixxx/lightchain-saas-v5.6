import { useLayoutEffect, useRef, useState } from 'react';
import './editable-filename.css';

const filenameSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const exceedsFilenameLimit = (value: string) => (filenameSegmenter
  ? Array.from(filenameSegmenter.segment(value)).length : Array.from(value.normalize('NFC')).length) > 100;
const lengthError = () => document.documentElement.lang.startsWith('ja') ? 'ファイル名は100文字以内で入力してください'
  : document.documentElement.lang.startsWith('en') ? 'File names can contain up to 100 characters' : '文件名最多100个字符';

/** Edit the basename only; the file's real format remains unchanged. */
export function EditableFilename({ name, onRename, autoEdit = false, onEditingEnd, onValidationError, followPointer = false, className = '' }: {
  name: string; onRename?: (name: string) => void; autoEdit?: boolean; onEditingEnd?: () => void;
  onValidationError?: (message: string) => void; followPointer?: boolean; className?: string;
}) {
  const suffix = name.match(/\.[^.]+$/)?.[0] ?? '';
  const basename = suffix ? name.slice(0, -suffix.length) : name;
  const [editing, setEditing] = useState(autoEdit);
  const [draft, setDraft] = useState(basename);
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useLayoutEffect(() => { if (editing) { input.current?.focus({ preventScroll: true }); input.current?.select(); } }, [editing]);
  const finish = (save: boolean) => {
    if (finished.current) return;
    const value = draft.trim();
    // Validate on save, not while typing; existing long names are left untouched.
    if (save && value && value + suffix !== name && exceedsFilenameLimit(value)) {
      setInvalid(true);
      const message = lengthError();
      if (onValidationError) onValidationError(message);
      else window.dispatchEvent(new CustomEvent('lc-toast', { detail: { message, tone: 'error' } }));
      return;
    }
    finished.current = true;
    if (save && value && value + suffix !== name) onRename?.(value + suffix);
    setEditing(false); onEditingEnd?.();
  };
  return <span className={`editable-filename nodrag nopan ${className}`} data-tooltip={editing ? undefined : name} data-tooltip-position={followPointer ? 'pointer' : 'pointer-stationary'}
    onDoubleClick={event => {
      if (!onRename) return;
      event.preventDefault(); event.stopPropagation(); if (editing) return; finished.current = false; setInvalid(false); setDraft(basename); setEditing(true);
    }} onPointerDown={event => event.stopPropagation()} onClick={event => { if (editing) event.stopPropagation(); }}>
    {editing ? <input ref={input} className="editable-filename-input" aria-label="文件名" aria-invalid={invalid || undefined} value={draft}
      onChange={event => { setDraft(event.target.value); setInvalid(false); }} onBlur={() => finish(true)}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); finish(event.key === 'Enter'); }
      }} onCopy={event => event.stopPropagation()} onPaste={event => event.stopPropagation()} onCut={event => event.stopPropagation()} /> : name}
  </span>;
}
