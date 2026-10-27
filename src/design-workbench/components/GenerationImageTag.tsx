import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from '../usePresence';

// Keep the image bubble within 320px, including its padding.
export function GenerationImageTag({ src, label, active, disabled = false }: { src: string; label: string; active: boolean; disabled?: boolean }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ratio = useRef(1);
  const naturalHeight = useRef(240);
  const id = useId();
  const [open, setOpen] = useState(false);
  const shown = usePresence(active && open ? src : null);
  const [position, setPosition] = useState({ left: 0, top: 0, height: 240 });
  function keepOpen() { if (timer.current) clearTimeout(timer.current); }
  function closeSoon() { keepOpen(); timer.current = setTimeout(() => setOpen(false), 100); }
  function show() { keepOpen(); setOpen(true); }
  function place() {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - 16;
    const above = rect.top - 16;
    const maxImageWidth = Math.max(1, Math.min(320 - 8, window.innerWidth - 24));
    const height = Math.max(1, Math.min(naturalHeight.current, 240, Math.max(below, above) - 8, maxImageWidth / ratio.current));
    const width = height * ratio.current + 8;
    const top = below >= height + 8 ? rect.bottom + 4 : Math.max(8, rect.top - height - 12);
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top, height });
  }
  useLayoutEffect(() => { if (shown.value) place(); }, [shown.value]);
  useEffect(() => {
    if (!open) return;
    const close = () => { keepOpen(); setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', escape);
    window.addEventListener('pointerdown', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('pointerdown', close);
    };
  }, [open]);
  useEffect(() => { if (!active) { keepOpen(); setOpen(false); } }, [active]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <><span className="generation-record-tag generation-record-tag--image">
    <button disabled={disabled} ref={anchor} type="button" className="generation-tag-thumb" aria-label={label} aria-describedby={open && active ? id : undefined} onMouseEnter={show} onMouseLeave={closeSoon} onFocus={show} onBlur={closeSoon} onClick={show}>
      <img src={src} width={20} height={20} alt="" onLoad={event => { naturalHeight.current = event.currentTarget.naturalHeight || 1; ratio.current = event.currentTarget.naturalWidth / naturalHeight.current; }} />
    </button>{label}
  </span>{shown.value && createPortal(<div id={id} className="generation-tag-preview" data-phase={shown.phase} inert={shown.phase === 'exit'} role="region" aria-label={label} style={{ left: position.left, top: position.top }} onMouseEnter={keepOpen} onMouseLeave={closeSoon}>
    <img src={shown.value} alt={label} style={{ maxHeight: position.height }} onLoad={event => { naturalHeight.current = event.currentTarget.naturalHeight || 1; ratio.current = event.currentTarget.naturalWidth / naturalHeight.current; place(); }} />
  </div>, anchor.current?.closest('dialog') ?? document.body)}</>;
}
