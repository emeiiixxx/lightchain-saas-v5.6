import type { GenerationRecord } from './CanvasLeftPanel';
import { useLocale } from '../LocaleContext';
import { GenerationImageTag } from './GenerationImageTag';
import { recordDisplayTags } from '../generation-record-display';

export function GenerationRecordTags({ record, active = true, disabled = false }: { record: GenerationRecord; active?: boolean; disabled?: boolean }) {
  const { t, locale } = useLocale();
  const showCount = !record.textEdit && record.title !== '文字编辑';
  const parameters = [record.ratio ? (record.ratio === 'auto' ? t('智能') : record.ratio) : undefined, record.resolution, showCount && record.count ? t(`${record.count}张`) : undefined].filter(Boolean);
  return <div className="generation-record-tags">
    {recordDisplayTags(record).map((tag, index) => tag.image
      ? <GenerationImageTag key={`${tag.label}-${index}`} src={tag.image} label={t(tag.label)} active={active} disabled={disabled} />
      : <span className={`generation-record-tag${tag.color ? ' generation-record-tag--color' : ''}`} key={`${tag.label}-${index}`}>{tag.color && <span className="generation-record-color-swatch" style={{ backgroundColor: tag.color }} aria-hidden="true" />}{t(tag.label)}</span>)}
    {record.title.includes('款式裂变')
      ? !!record.count && <span className="generation-record-tag">{locale === 'en' ? 'Variations: ' : locale === 'ja' ? 'バリエーション数：' : '裂变数量：'}{t(`${record.count}张`)}</span>
      : !!parameters.length && <span className="generation-record-tag">{parameters.join(' ｜ ')}</span>}
    {record.pending && <span className="generation-record-tag">{t('待生成')}</span>}
    {record.generating && <span className="generation-record-tag">{t('生成中…')}</span>}
    {record.failed && <span className="generation-record-tag">{t('图片加载失败，请重试')}</span>}
  </div>;
}
