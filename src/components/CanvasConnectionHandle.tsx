import { memo, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useConnection } from '@xyflow/react';
import type { CanvasConnectionNode, CanvasMediaKind } from '../canvas-connections';
import type { Locale } from '../i18n';
import { usePresence } from '../usePresence';
import { videoNodeAssets } from '../video-node-assets';
import { Icon } from './ui';
import '../setting-select.css';

export type AddConnectionMedia = (nodeId: string, kind: CanvasMediaKind, side: 'left' | 'right') => void;
const copy = {
  'zh-CN': { add: '添加素材', image: '添加图片', video: '添加视频' },
  en: { add: 'Add media', image: 'Add image', video: 'Add video' },
  ja: { add: '素材を追加', image: '画像を追加', video: '動画を追加' },
};

export const CanvasConnectionHandle = memo(({ nodeId, side, node, connectable, reconnectable = false, reconnectHovered = false, locale = 'zh-CN', onAdd }: {
  nodeId: string; side: 'left' | 'right'; node?: CanvasConnectionNode; connectable: boolean; reconnectable?: boolean; reconnectHovered?: boolean; locale?: Locale; onAdd?: AddConnectionMedia;
}) => {
  const handleId = `free-${side}`, kind = node?.kind ?? 'editor', t = copy[locale];
  const editable = kind === 'editor' && !!onAdd;
  const [open, setOpen] = useState(false);
  const shown = usePresence(open ? true : null);
  const trigger = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number; moved: boolean; wasOpen: boolean } | null>(null);
  const releasePointer = useRef<(() => void) | null>(null);
  const id = useId();
  const available = node?.addable ?? node?.accepts ?? [];
  const feedback = useConnection(connection => {
    if (!connection.inProgress) return 'idle';
    if (connection.fromNode.id === nodeId && connection.fromHandle.id === handleId) return 'source';
    if (connection.toNode?.id === nodeId && connection.toHandle?.id === handleId && connection.isValid !== null) {
      return connection.isValid ? 'valid' : 'invalid';
    }
    return 'idle';
  });
  const connecting = useConnection(connection => connection.inProgress);

  useEffect(() => () => releasePointer.current?.(), []);
  useEffect(() => { if (!connectable || !editable || connecting) setOpen(false); }, [connectable, editable, connecting]);
  useEffect(() => {
    if (!open) return;
    const outside = (target: EventTarget | null) => target instanceof Node && !trigger.current?.contains(target) && !panel.current?.contains(target);
    const dismiss = (event: Event) => { if (outside(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true });
    };
    const otherMenu = (event: Event) => { if ((event as CustomEvent).detail !== id) setOpen(false); };
    const blur = () => setOpen(false);
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('focusin', dismiss, true);
    document.addEventListener('keydown', escape);
    document.addEventListener('lc-select-open', otherMenu);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('focusin', dismiss, true);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('lc-select-open', otherMenu);
      window.removeEventListener('blur', blur);
    };
  }, [open, id]);

  useLayoutEffect(() => {
    if (!shown.value || !panel.current) return;
    const popup = panel.current;
    if (!popup.matches(':popover-open')) popup.showPopover();
    let frame = 0;
    const position = () => {
      const anchor = trigger.current;
      if (!anchor?.isConnected || !anchor.getClientRects().length || anchor.closest('[hidden], [inert]')) { setOpen(false); return; }
      const rect = anchor.getBoundingClientRect();
      if (rect.top < 0 || rect.top > innerHeight || rect.left < 0 || rect.left > innerWidth) { setOpen(false); return; }
      let left = side === 'left' ? rect.left - popup.offsetWidth - 16 : rect.right + 16;
      if (left < 8) left = rect.right + 16;
      if (left + popup.offsetWidth > innerWidth - 8) left = rect.left - popup.offsetWidth - 16;
      popup.style.left = `${Math.max(8, Math.min(left, innerWidth - popup.offsetWidth - 8))}px`;
      popup.style.top = `${Math.max(8, Math.min(rect.top - 16, innerHeight - popup.offsetHeight - 8))}px`;
      if (open) frame = requestAnimationFrame(position);
    };
    position();
    if (open) (popup.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? popup).focus({ preventScroll: true });
    return () => cancelAnimationFrame(frame);
  }, [shown.value, open, side]);

  const expand = () => {
    if (!editable || !connectable) return;
    document.dispatchEvent(new CustomEvent('lc-select-open', { detail: id }));
    setOpen(true);
  };
  return <>
    <Handle ref={trigger} id={handleId} type="source" position={side === 'left' ? Position.Left : Position.Right}
      isConnectable={connectable} className="lc-flow-free-handle nodrag nopan" data-node-kind={kind} data-feedback={feedback}
      data-reconnectable={reconnectable || undefined} data-reconnect-hovered={reconnectHovered || undefined}
      data-add-menu={editable || undefined} role={editable ? 'button' : undefined} tabIndex={editable && connectable ? 0 : -1}
      aria-label={editable ? t.add : undefined} aria-haspopup={editable ? 'menu' : undefined} aria-controls={editable ? id : undefined} aria-expanded={editable ? open : undefined}
      onPointerDown={event => {
        if (!editable || event.button !== 0) return;
        releasePointer.current?.();
        pointer.current = { x: event.clientX, y: event.clientY, moved: false, wasOpen: open };
        setOpen(false);
        // Observe without capturing/preventing the pointer: React Flow retains
        // its native connection gesture. A drag must never become an add click.
        const moved = (next: PointerEvent) => {
          const start = pointer.current;
          if (start && Math.hypot(next.clientX - start.x, next.clientY - start.y) > 1) start.moved = true;
        };
        const release = () => {
          document.removeEventListener('pointermove', moved, true);
          document.removeEventListener('pointerup', end, true);
          document.removeEventListener('pointercancel', cancel, true);
          releasePointer.current = null;
        };
        const end = (next: PointerEvent) => { moved(next); release(); };
        const cancel = () => { if (pointer.current) pointer.current.moved = true; release(); };
        releasePointer.current = release;
        document.addEventListener('pointermove', moved, true);
        document.addEventListener('pointerup', end, true);
        document.addEventListener('pointercancel', cancel, true);
      }}
      onClick={event => {
        if (!editable) return;
        event.stopPropagation();
        // A pure click on the transparent reconnect hit area is forwarded here.
        // It must not inherit an earlier native drag's pointer state.
        const gesture = event.detail === 0 ? null : pointer.current;
        pointer.current = null;
        if (gesture?.moved) return;
        (gesture?.wasOpen ?? open) ? setOpen(false) : expand();
      }}
      onKeyDown={event => {
        if (!editable || !connectable || !['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); expand();
      }}>
      {kind === 'editor' && <span className="icon lc-flow-handle-plus" aria-hidden="true" style={{ '--icon-url': `url("${videoNodeAssets.add}")` } as CSSProperties} />}
    </Handle>
    {shown.value && createPortal(<div ref={panel} id={id} tabIndex={-1} popover="manual" role="menu" aria-label={t.add}
      className="lc-select-popup canvas-context-menu lc-flow-add-menu nodrag nopan nowheel" data-select-popup data-overlay data-side="bottom" data-phase={shown.phase} inert={shown.phase === 'exit'}
      onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
      onKeyDown={event => {
        event.stopPropagation();
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); buttons[next]?.focus(); }
        if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); setOpen(false); trigger.current?.focus({ preventScroll: true }); }
      }}>
      {(['image', 'video'] as const).map(media => <button key={media} type="button" role="menuitem" className="lc-select-option" disabled={!available.includes(media)} onClick={() => {
        setOpen(false); onAdd?.(nodeId, media, side);
      }}><Icon name={media === 'image' ? 'fusionAddImage' : 'historyVideo'} size={20} /><span>{t[media]}</span></button>)}
    </div>, document.body)}
  </>;
});
