import { DownloadFormatMenu } from './DownloadFormatMenu';
import { exportImage, type DownloadFormat } from '../download-image';
import { prepareMainImage } from '../asset-library';
import { useEffect, useState } from 'react';
import type { GenerationRecord } from './CanvasLeftPanel';
import { useLocale } from '../LocaleContext';
import type { Notify } from '../notification';
import { demoNotice } from '../demo-feedback';
import { Button, Divider, Icon } from './ui';
import { TaskResultPlaceholder } from './TaskResultPlaceholder';
import { ProgressiveImage } from './ProgressiveImage';
import { GenerationRecordTags } from './GenerationRecordTags';
import { recordHasPrompt, recordHasPromptActions } from '../generation-record-display';
import { ElementSendMenu } from './ElementSendMenu';
import { TaskRecordMoreMenu } from './TaskRecordMoreMenu';
import { useRecordResultRatio } from '../useRecordResultRatio';

type Props = {
  record: GenerationRecord; selectedIndex: number; active: boolean;
  onSelect: (index: number) => void; onLibrary: () => void;
  onSave: (anchor: HTMLElement, content: string) => void;
  onCopy: (text: string) => void; onNotify: Notify;
  onRegenerate: () => void; onDeleteImage: () => void;
};
export function TaskDetailPanel({ record, selectedIndex, active, onSelect, onLibrary, onSave, onCopy, onNotify, onRegenerate, onDeleteImage }: Props) {
  const { t, locale } = useLocale();
  const aspectRatio = useRecordResultRatio(record);
  const [sendOpen, setSendOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const assetLabel = locale === 'en' ? 'Save to assets' : locale === 'ja' ? 'アセットに保存' : '保存至资源库';
  const compactLibraryLabel = locale === 'en' ? 'Prompts' : locale === 'ja' ? 'プロンプト集' : '提示词库';
  const compactSavePromptLabel = locale === 'en' ? 'Save' : locale === 'ja' ? '保存' : '保存';
  useEffect(() => {
    if (!sendOpen && !downloadOpen) return;
    const outside = (event: PointerEvent) => { if (!(event.target instanceof Element) || !event.target.closest('[data-workbench-menu]')) { setSendOpen(false); setDownloadOpen(false); } };
    window.addEventListener('pointerdown', outside);
    return () => window.removeEventListener('pointerdown', outside);
  }, [sendOpen, downloadOpen]);
  useEffect(() => { setSendOpen(false); setDownloadOpen(false); }, [selectedIndex, active]);
  const selected = record.images[selectedIndex];
  const disabled = !selected || selected.status === 'failed' || selected.status === 'generating';
  const unavailable = () => onNotify(demoNotice(locale));
  const download = async (format: DownloadFormat) => {
    const image = record.images[selectedIndex];
    if (!image || disabled || downloading) return;
    setDownloading(true);
    try {
      const name = `${t(record.title)}-${selectedIndex + 1}`;
      const loaded = await prepareMainImage({ id: image.url, url: image.url, name });
      await exportImage(loaded.image, name, format);
    } catch (error) { onNotify(error instanceof Error && error.message === '当前浏览器不支持此格式导出，请选择其他格式' ? t(error.message) : t('下载失败，请重试。'), 'error'); }
    finally { setDownloading(false); }
  };
  return <aside className="task-detail-panel" data-task-controls aria-label={locale === 'en' ? 'Task details' : locale === 'ja' ? 'タスク詳細' : '任务详情'}>
    <div className="task-detail-info">
      <header><div className="task-detail-heading-text"><h2>{t(record.title)}</h2><time>{record.time}</time></div>{record.replayable && <Button className="task-detail-regenerate" variant="outline" size="s" disabled={disabled || record.generating || record.pending} onClick={onRegenerate}><Icon name="task-record-regenerate-small" size={16} />{t('再次生成')}</Button>}</header>
      <nav className="task-detail-thumbnails" aria-label={t('图片缩略图')}>
        {record.images.map((image, index) => <button type="button" key={`${image.url}-${index}`} style={{ aspectRatio }} aria-label={`${t('查看大图')} · ${index + 1}`} disabled={image.status === 'failed' || image.status === 'generating'} aria-current={index === selectedIndex ? 'true' : undefined} onClick={() => onSelect(index)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -4 : 4;
          const available = record.images.flatMap((item, i) => item.status === 'failed' || item.status === 'generating' ? [] : [i]);
          const target = Math.max(0, Math.min(record.images.length - 1, index + step));
          const next = event.key === 'Home' ? available[0] : event.key === 'End' ? available.at(-1)
            : step > 0 ? available.find(i => i >= target) : [...available].reverse().find(i => i <= target);
          if (next === undefined) return;
          onSelect(next); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
        }}>{image.status === 'failed' || image.status === 'generating' ? <TaskResultPlaceholder status={image.status} /> : <ProgressiveImage src={image.url} alt="" eager fit="contain" />}</button>)}
      </nav>
      <GenerationRecordTags record={record} active={active && !disabled} disabled={disabled} />
      {recordHasPrompt(record) && <div className="generation-record-prompt task-detail-prompt">
        <p>{t(record.prompt!)}</p>
        {recordHasPromptActions(record) && <div className="generation-record-actions">
          <Button disabled={disabled} onClick={onLibrary} aria-label={t('提示词库')} title={t('提示词库')}><Icon name="generation-record-imgLeftIcon" size={16} />{compactLibraryLabel}</Button><Divider vertical />
          <Button disabled={disabled} onClick={event => onSave(event.currentTarget, t(record.prompt!))} aria-label={t('保存提示词')} title={t('保存提示词')}><Icon name="generation-record-imgLeftIcon1" size={16} />{compactSavePromptLabel}</Button><Divider vertical />
          <Button disabled={disabled} onClick={() => onCopy(t(record.prompt!))}><Icon name="generation-record-imgLeftIcon2" size={16} />{t('复制')}</Button>
        </div>}
      </div>}
    </div>
    <div className="task-detail-actions">
      <ElementSendMenu withLabel disabled={disabled} open={!disabled && sendOpen} onToggle={() => { setDownloadOpen(false); setSendOpen(value => !value); }} onClose={() => setSendOpen(false)} onSend={unavailable} /><Divider vertical />
      <Button size="s" disabled={disabled} onClick={unavailable} aria-label={assetLabel}><Icon name="asset-center" size={16} />{assetLabel}</Button><Divider vertical />
      <DownloadFormatMenu open={!disabled && downloadOpen} disabled={disabled || downloading} onToggle={() => { setSendOpen(false); setDownloadOpen(value => !value); }} onClose={() => setDownloadOpen(false)} onSelect={format => void download(format)} /><Divider vertical />
      <TaskRecordMoreMenu detail onDelete={onDeleteImage} />
    </div>
  </aside>;
}
