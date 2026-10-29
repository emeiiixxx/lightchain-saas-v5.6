import { useLocale } from '../LocaleContext';
import { GenerationImageTag } from './GenerationImageTag';
import { Button, Icon } from './ui';
import '../agent-composer-attachments.css';

export type AgentComposerAttachment = {
  id: string;
  name: string;
  kind: 'file' | 'image';
  url?: string;
  provisional?: boolean;
  locking?: boolean;
};

export type AgentComposerAttachmentsProps = {
  items: AgentComposerAttachment[];
  onRemove: (id: string) => void;
  disabled?: boolean;
};

export function AgentComposerAttachments({ items, onRemove, disabled = false }: AgentComposerAttachmentsProps) {
  const { t } = useLocale();
  if (!items.length) return null;

  let imageNumber = 0;
  return <div className="agent-composer-attachments">
    {items.map(item => {
      const label = item.kind === 'image' ? `${t('图片')}${++imageNumber}` : item.name;
      return <div
        key={item.id}
        className="agent-composer-attachments__chip"
        data-kind={item.kind}
        data-provisional={!!item.provisional}
        title={item.name}
      >
        {item.kind === 'image' && item.url
          ? <GenerationImageTag src={item.url} label={label} active={!disabled} disabled={disabled} />
          : <span className="agent-composer-attachments__content">
            <span className={`agent-composer-attachments__icon agent-composer-attachments__icon--${item.kind}`}>
              <Icon name={`agent-add-${item.kind}`} size={16} />
            </span>
            <span className="agent-composer-attachments__label">{label}</span>
          </span>}
        <Button
          className="agent-composer-attachments__remove"
          aria-label={`${t('移除')} ${label}`}
          disabled={disabled}
          onClick={() => onRemove(item.id)}
        >
          <Icon name="agent-composer-20261029/close" size={16} />
        </Button>
        {item.locking && !item.provisional && <span className="agent-composer-attachments__lock-shine" aria-hidden="true" />}
      </div>;
    })}
  </div>;
}
