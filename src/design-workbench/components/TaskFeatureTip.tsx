import { useLayoutEffect, useRef, useState } from 'react';
import { useLocale } from '../LocaleContext';
import { usePresence } from '../usePresence';
import { IconButton } from './ui';
import './task-feature-tip.css';
import { readDemoState, writeDemoState } from '../demo-storage';

export function TaskFeatureTip({ expanded, blankClickVersion }: { expanded: boolean; blankClickVersion: number }) {
  const { locale } = useLocale();
  // Demo remembers dismissal in this browser; production scopes it to the account.
  const [dismissed, setDismissed] = useState(() => readDemoState('task-tip-dismissed', false));
  const initialBlankClick = useRef(blankClickVersion);
  const shown = usePresence(dismissed || expanded || blankClickVersion !== initialBlankClick.current ? null : true);
  useLayoutEffect(() => {
    if (expanded || blankClickVersion !== initialBlankClick.current) setDismissed(true);
  }, [expanded, blankClickVersion]);
  useLayoutEffect(() => { if (dismissed) writeDemoState('task-tip-dismissed', true); }, [dismissed]);
  const root = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!shown.value || expanded) return;
    const anchor = document.getElementById('canvas-task-entry');
    const bubble = root.current;
    if (!anchor || !bubble) return;
    const edge = anchor.closest('.left-tools') ?? anchor;
    const update = () => {
      const button = anchor.getBoundingClientRect();
      const boundary = edge.getBoundingClientRect();
      const next = {
        left: Math.max(8, Math.min(boundary.right + 8, window.innerWidth - bubble.offsetWidth - 8)),
        top: Math.max(8, Math.min(button.top + button.height / 2 - bubble.offsetHeight / 2, window.innerHeight - bubble.offsetHeight - 8)),
      };
      setPosition(previous => previous?.left === next.left && previous.top === next.top ? previous : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(anchor); observer.observe(edge); observer.observe(bubble);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, [expanded, locale, shown.value]);
  if (!shown.value) return null;
  const label = locale === 'en' ? '🎉 Task history is here. Find your completed results anytime.' : locale === 'ja' ? '🎉 タスク履歴が登場。完了した結果をいつでも確認できます' : '🎉 新增任务记录，随时找回已完成的结果';
  const closeLabel = locale === 'en' ? 'Dismiss feature announcement' : locale === 'ja' ? '新機能のお知らせを閉じる' : '关闭功能上新提示';
  return <div ref={root} className="task-feature-tip" data-canvas-ui data-node-id="137:7113" data-phase={shown.phase} inert={shown.phase === 'exit'} style={{ ...position, visibility: position ? 'visible' : 'hidden' }}>
    <span className="task-feature-tip-arrow" aria-hidden="true"><img src="/assets/design-workbench/task-feature-tip-arrow.svg" alt="" /></span>
    <div className="task-feature-tip-body">
      <p role="status">{label}</p>
      <IconButton size="xs" icon="task-feature-tip-close" aria-label={closeLabel} onClick={() => setDismissed(true)} />
    </div>
  </div>;
}
