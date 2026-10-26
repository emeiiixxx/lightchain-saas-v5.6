import { useEffect, useRef, type ReactNode } from 'react';
import { Button, Icon } from './ui';

type Props = {
  label: string;
  closeLabel: string;
  phase: 'enter' | 'exit';
  onClose: () => void;
  children: ReactNode;
  className?: string;
  nodeId?: string;
  closeNodeId?: string;
};

// Images and videos share the same full-viewport top layer and focus lifecycle.
export function FullScreenViewer({ label, closeLabel, phase, onClose, children, className = '', nodeId, closeNodeId }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    return () => {
      element.close();
      if (previous?.isConnected && !previous.closest('[hidden], [inert]')) previous.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className={`full-image-viewer ${className}`} data-phase={phase} data-node-id={nodeId} inert={phase === 'exit'} aria-label={label}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    {children}
    <Button className="full-image-close" aria-label={closeLabel} onClick={onClose} data-node-id={closeNodeId}><Icon name="close" size={20} /></Button>
  </dialog>;
}
