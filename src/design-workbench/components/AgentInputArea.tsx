import { useLayoutEffect, useRef, type ReactNode } from 'react';

export function AgentInputArea({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const area = root.current;
    const body = area?.parentElement;
    if (!area || !body) return;
    // The overlay and its status card may grow. Keep the latest message above
    // both, while letting older content scroll behind the progressive backdrop.
    let previousHeight = -1;
    const reserveSpace = () => {
      const height = area.offsetHeight;
      if (height === previousHeight) return;
      previousHeight = height;
      body.style.setProperty('--agent-input-height', `${height}px`);
    };
    reserveSpace();
    const observer = new ResizeObserver(reserveSpace);
    observer.observe(area);
    return () => {
      observer.disconnect();
      body.style.removeProperty('--agent-input-height');
    };
  }, []);
  return <div ref={root} className="agent-input-area">
    <div className="agent-input-backdrop" aria-hidden="true">
      <span /><span /><span /><span /><span />
    </div>
    {children}
  </div>;
}
