import { useLocale } from '../LocaleContext';
import { usePresence } from '../usePresence';
import type { AgentRequestState } from '../useAgentRequests';
import { AgentArtwork } from './AgentConversation';
import { Button } from './ui';
import './agent-request-status.css';

const assetRoot = '/assets/design-workbench/agent-chat-20261028/';

// Figma 25:16721: native SVG dimensions are preserved inside scaled slots.
function ThinkingArtwork() {
  return <span className="agent-thinking-artwork" aria-hidden="true">
    <img className="agent-thinking-face" src={`${assetRoot}thinking-face.svg`} alt="" />
    <span className="agent-thinking-eye agent-thinking-eye--left" />
    <span className="agent-thinking-eye agent-thinking-eye--right" />
    <span className="agent-thinking-question"><img src={`${assetRoot}thinking-question.svg`} alt="" /></span>
    <span className="agent-thinking-star"><img src={`${assetRoot}thinking-star-visible.svg`} alt="" /></span>
    <span className="agent-thinking-star agent-thinking-star--small"><img src={`${assetRoot}thinking-star-small-visible.svg`} alt="" /></span>
  </span>;
}

export function AgentRequestStatus({ state, onRetry, disabled }: {
  state: AgentRequestState | null;
  onRetry: () => void;
  disabled: boolean;
}) {
  const { t } = useLocale();
  const shown = usePresence(state);
  const error = shown.value !== 'thinking';
  const label = t(shown.value === 'thinking' ? '思考中...' : shown.value === 'reconnecting' ? '网络异常，重连中...' : '请求失败，请重试');
  return <div className="agent-request-status-slot" data-open={state !== null} aria-hidden={state === null} inert={state === null}>
    <div className="agent-request-status-clip">
      {shown.value && <div className="agent-request-status" data-tone={error ? 'error' : 'thinking'}>
        <div className="agent-request-status-content">
          {error ? <AgentArtwork name="request-error" size={20} /> : <ThinkingArtwork />}
          <span role="status" className="agent-request-status-label" title={label}>{label}</span>
          {error && <Button variant="danger" className="agent-request-retry" disabled={disabled} onClick={onRetry}>{t('立即重试')}</Button>}
        </div>
      </div>}
    </div>
  </div>;
}
