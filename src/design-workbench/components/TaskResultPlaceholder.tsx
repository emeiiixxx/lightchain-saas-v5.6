import { useLocale } from '../LocaleContext';
import { Button } from './ui';
import { GeneratingPlaceholder } from './GeneratingPlaceholder';
import './task-result-placeholder.css';

type Props = {
  status: 'failed' | 'generating';
  size?: 'thumbnail' | 'large';
  onRetry?: () => void;
};

// Original EmptyIcon layers from Figma 264:6518, shared by the large state 264:6593.
function FailureArtwork() {
  return <span className="task-failure-artwork" aria-hidden="true">
    <span className="task-failure-shadow"><span /></span>
    <img className="task-failure-glass" src="/assets/design-workbench/task-failure/glass.png" alt="" draggable={false} />
    <span className="task-failure-light"><span className="task-failure-light-front"><span /></span><span className="task-failure-light-back"><span /></span></span>
  </span>;
}

export function TaskResultPlaceholder({ status, size = 'thumbnail', onRetry }: Props) {
  const { t } = useLocale();
  return <span className={`task-result-placeholder task-result-placeholder--${size}`} data-node-id={size === 'large' ? '264:6593' : '264:6518'} aria-label={t(status === 'failed' ? '生成失败' : '生成中…')}>
    {status === 'generating' ? <GeneratingPlaceholder style={{ inset: 0 }} /> : <span className="task-result-state-message">
      <span className="task-result-state-content"><FailureArtwork />{size === 'large' && <span className="task-result-failure-title">{t('生成失败')}</span>}</span>
      {onRetry && <Button className="task-result-retry" size="s" variant="primary" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onRetry(); }}>{t('重新生成')}</Button>}
    </span>}
  </span>;
}
