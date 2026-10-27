import './spinner.css';

// Shared original circular loading artwork for pending operations.
export function Spinner({ size = 20, active = true, className = '' }: { size?: number; active?: boolean; className?: string }) {
  return <span aria-hidden="true" className={`lc-spinner ${className}`} data-active={active} style={{ width: size, height: size }} />;
}
