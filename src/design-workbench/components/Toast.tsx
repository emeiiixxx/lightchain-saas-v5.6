import { useCallback } from 'react';
import type { ToastTone } from '../notification';

export type ToastNotice = { message: string; tone: ToastTone };

export function Toast({ notice, phase }: { notice: ToastNotice; phase: 'enter' | 'exit' }) {
  const show = useCallback((element: HTMLDivElement | null) => {
    if (element && !element.matches(':popover-open')) element.showPopover();
  }, []);

  return <div popover="manual" ref={show} data-phase={phase} data-tone={notice.tone} className="toast" role={notice.tone === 'error' ? 'alert' : 'status'}>
    <div className="toast-content">
      {notice.tone !== 'info' && <span className="toast-icon" aria-hidden="true"><img src={`/assets/design-workbench/toast-${notice.tone}.svg`} alt="" /></span>}
      <span className="toast-message">{notice.message}</span>
    </div>
  </div>;
}
