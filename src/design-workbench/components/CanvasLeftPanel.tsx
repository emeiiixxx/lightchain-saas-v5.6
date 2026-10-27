import { GenerationRecordTags } from './GenerationRecordTags';
import type { TextEditInput } from '../text-edit';
import { recordHasPrompt, recordHasPromptActions } from '../generation-record-display';
import { TaskDetailPanel } from './TaskDetailPanel';
import { demoNotice } from '../demo-feedback';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocale } from '../LocaleContext';
import type { Notify } from '../notification';
import { usePresence } from '../usePresence';
import { prepareMainImage, type LibraryImage } from '../asset-library';
import type { CanvasImage } from '../useCanvas';
import { Button, Dialog, Divider, Icon, IconButton } from './ui';
import { ProgressiveImage } from './ProgressiveImage';
import { TaskResultPlaceholder } from './TaskResultPlaceholder';
import { GeneratingPlaceholder } from './GeneratingPlaceholder';
import { FullImageViewer } from './FullImageViewer';
import { createPortal } from 'react-dom';
import { PromptLibrary, SavePrompt } from './PromptLibrary';
import { useSavedPrompts } from '../useSavedPrompts';
import { TaskRecordMoreMenu } from './TaskRecordMoreMenu';
import { downloadRecordGroup } from '../download-record-group';
import type { DownloadFormat } from '../download-image';
import { useRecordResultRatio } from '../useRecordResultRatio';

export type LeftPanelTab = 'layers' | 'assets' | 'history';
export type GenerationRecord = {
  textEdit?: TextEditInput;
  /** Local showcase outputs used when replaying a simulated feature. */
  demoOutputUrls?: string[];
  supportsPrompt?: boolean; printMode?: 'position' | 'repeat';
  sourceId?: string; replayable?: boolean; resultRatio?: string;
  id: string; title: string; time: string; prompt?: string; pending?: boolean; generating?: boolean; failed?: boolean; ratio?: string; resolution?: string;
  tags: { label: string; image?: string; color?: string }[];
  count?: number;
  resultHeight?: number;
  images: { id?: string; url: string; height: number; status?: 'failed' | 'generating' | 'success' }[];
};

function RecordResults({ record, eager, onOpen }: { record: GenerationRecord; eager: boolean; onOpen: (index: number) => void }) {
  const { t } = useLocale();
  const aspectRatio = useRecordResultRatio(record);
  const count = record.images.length || record.count || 1;
  return <div className={`generation-record-images ${count >= 4 ? 'generation-record-images--four' : ''}`}>
    {record.images.length ? record.images.map((item, index) => <div className="generation-record-result" key={item.id ?? `${item.url}-${index}`} style={{ aspectRatio }}>
      {item.status === 'failed' || item.status === 'generating'
        ? <TaskResultPlaceholder status={item.status} />
        : <button className="generation-record-result-open" type="button" aria-label={`${t('查看大图')} · ${t(record.title)} ${index + 1}`} onClick={() => onOpen(index)}><ProgressiveImage src={item.url} alt="" eager={eager} fit="contain" /></button>}
    </div>) : Array.from({ length: count }, (_, index) => <div className="generation-record-loading" key={index} style={{ aspectRatio }}><GeneratingPlaceholder style={{ inset: 0 }} /></div>)}
  </div>;
}
const tabs = [
  { value: 'layers', label: '图层', en: 'Layers', ja: 'レイヤー', icon: 'generation-record-imgDefaultIcon' },
  { value: 'assets', label: '资产', en: 'Assets', ja: '素材', icon: 'generation-record-imgDefaultIcon1' },
  { value: 'history', label: '任务', en: 'Tasks', ja: 'タスク', icon: 'generation-record-imgDefaultIcon2' },
] as const;

export function CanvasLeftPanel({ tab, hasSelectedElement, onTabChange, onClose, records, uploads, onUpload, onNotify, onRegenerate, onDeleteRecord, onDeleteResult, layersDisabled = false }: {
  hasSelectedElement: boolean; layersDisabled?: boolean;
  tab: LeftPanelTab | null; onTabChange: (tab: LeftPanelTab) => void; onClose: () => void;
  records: GenerationRecord[]; uploads: LibraryImage[]; onUpload: (image: LibraryImage) => void; onNotify: Notify;
  onRegenerate: (record: GenerationRecord) => void; onDeleteRecord: (id: string) => void; onDeleteResult: (id: string, index: number) => void;
}) {
  const { t, locale } = useLocale();
  const compactLibraryLabel = locale === 'en' ? 'Prompts' : locale === 'ja' ? 'プロンプト集' : '提示词库';
  const compactSavePromptLabel = locale === 'en' ? 'Save' : locale === 'ja' ? '保存' : '保存';
  const shown = usePresence(tab);
  const switcher = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<CSSProperties>({ visibility: 'hidden' });
  const { entries, store } = useSavedPrompts(onNotify);
  const [saveTarget, setSaveTarget] = useState<{ anchor: HTMLElement; content: string } | null>(null);
  const shownSave = usePresence(saveTarget);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const library = usePresence(libraryOpen ? true : null);
  const [preview, setPreview] = useState<{ image: Pick<CanvasImage, 'url' | 'name' | 'width' | 'height'>; record: GenerationRecord; index: number } | null>(null);
  const shownPreview = usePresence(preview);
  const previewRequest = useRef(0);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'record'; record: GenerationRecord } | { kind: 'image'; record: GenerationRecord; index: number } | null>(null);
  const shownDelete = usePresence(deleteTarget);
  useLayoutEffect(() => {
    const element = switcher.current;
    if (!element) return;
    const update = () => {
      const active = element.querySelector<HTMLButtonElement>('[aria-selected="true"]');
      if (active) setIndicator({ left: active.offsetLeft, top: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.querySelectorAll('button').forEach(button => observer.observe(button));
    return () => observer.disconnect();
  }, [shown.value, locale]);
  const copyPrompt = async (text: string) => {
    try { await navigator.clipboard.writeText(text); onNotify('提示词已复制', 'success'); }
    catch { onNotify('复制失败，请重试', 'error'); }
  };
  const openImage = async (record: GenerationRecord, index: number, closeOnError = false) => {
    if (!record.images[index] || record.images[index].status === 'failed' || record.images[index].status === 'generating') return;
    const result = record.images[index];
    const url = result.url;
    const name = `${t(record.title)} ${index + 1}`;
    const request = ++previewRequest.current;
    try {
      const image = await prepareMainImage({ id: url, url, name });
      if (request === previewRequest.current) setPreview({ image, record, index });
    } catch { if (request === previewRequest.current) { onNotify('图片加载失败，请重试', 'error'); if (closeOnError) setPreview(null); } }
  };
  const allRecords = records;
  const previewRecord = shownPreview.value
    ? shownPreview.phase === 'exit' ? shownPreview.value.record : allRecords.find(record => record.id === shownPreview.value!.record.id) ?? shownPreview.value.record
    : null;
  const successfulResults = previewRecord?.images.flatMap((image, index) =>
    image.status === 'failed' || image.status === 'generating' ? [] : [{ ...image, index }]) ?? [];
  const deleteRecord = (record: GenerationRecord) => {
    onDeleteRecord(record.id);
    if (preview?.record.id === record.id) { previewRequest.current++; setPreview(null); }
  };
  const deleteResult = (record: GenerationRecord, index: number) => {
    const current = allRecords.find(item => item.id === record.id);
    if (!current || !current.images[index]) return;
    const images = current.images.filter((_, imageIndex) => imageIndex !== index);
    onDeleteResult(record.id, index);
    previewRequest.current++;
    const available = images.flatMap((image, i) => image.status === 'failed' || image.status === 'generating' ? [] : [i]);
    const next = available.find(i => i >= index) ?? available.at(-1);
    if (next === undefined) setPreview(null);
    else void openImage({ ...current, images }, next, true);
  };
  const downloadGroup = async (record: GenerationRecord, format: DownloadFormat) => {
    try { await downloadRecordGroup(record.images.filter(image => image.status !== 'failed' && image.status !== 'generating'), t(record.title), format); }
    catch (error) { onNotify(error instanceof Error && error.message === '当前浏览器不支持此格式导出，请选择其他格式' ? t(error.message) : t('下载失败，请重试。'), 'error'); }
  };
  return <>
    {shown.value && <aside id="canvas-left-sidebar" className="canvas-left-panel" aria-label={t(tabs.find(item => item.value === shown.value)!.label)} data-canvas-ui data-node-id="66:4715" data-phase={shown.phase} inert={shown.phase === 'exit'} onKeyDown={event => { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
      <header className="left-panel-header">
        <div ref={switcher} className="right-panel-switcher left-panel-switcher" role="tablist" aria-label={t('画布功能栏')}>
          <span className="switcher-indicator" style={indicator} aria-hidden="true" />
          {tabs.map(item => <button disabled={layersDisabled && item.value === 'layers'} key={item.value} id={`left-panel-tab-${item.value}`} type="button" role="tab" data-tooltip={t(item.label)} aria-label={t(item.label)} aria-selected={shown.value === item.value} aria-controls="left-panel-content" tabIndex={shown.value === item.value ? 0 : -1} onClick={() => onTabChange(item.value)} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            const available = tabs.filter(tab => !layersDisabled || tab.value !== 'layers');
            const index = available.findIndex(tab => tab.value === item.value);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + available.length) % available.length;
            onTabChange(available[next].value); document.getElementById(`left-panel-tab-${available[next].value}`)?.focus();
          }}><Icon name={item.icon} size={16} /><span className="left-panel-tab-label">{locale === 'en' ? item.en : locale === 'ja' ? item.ja : item.label}</span></button>)}
        </div>
        <IconButton className="left-panel-close" size="l" icon="generation-record-imgIcon" aria-label={t('收起左侧栏')} onClick={onClose} />
      </header>
      <div id="left-panel-content" className="left-panel-content" role="tabpanel" aria-labelledby={`left-panel-tab-${shown.value}`}>
        {shown.value !== 'history' ? <div className="left-panel-placeholder">{shown.value === 'layers' && !hasSelectedElement ? t('暂无图层') : demoNotice(locale)}</div>  : !allRecords.length ? <div className="generation-record-empty" data-node-id="163:11702">
          <img src="/assets/design-workbench/task-record-empty.png" alt="" width={128} height={128} />
          <div className="generation-record-empty-copy"><h3>{t('暂无任务记录')}</h3><p>{t('上传图片开始你的设计')}</p></div>
        </div> : <div className="generation-record-list">
          {allRecords.map((record, index) => <article className="generation-record" key={record.id}>
            <div className="generation-record-info">
              <div className="generation-record-heading"><div className="generation-record-heading-text"><h3>{t(record.title)}</h3><time>{record.time}</time></div><TaskRecordMoreMenu canDownload={record.images.some(image => image.status !== 'failed' && image.status !== 'generating')} canRegenerate={!record.generating && !record.pending} showRegenerate={record.replayable === true} onDownload={format => void downloadGroup(record, format)} onRegenerate={() => onRegenerate(record)} onDelete={() => setDeleteTarget({ kind: 'record', record })} /></div>
              <GenerationRecordTags record={record} active={tab === 'history'} />
              {recordHasPrompt(record) && <div className="generation-record-prompt">
                <p data-tooltip={t(record.prompt!)} data-tooltip-truncated-only>{t(record.prompt!)}</p>
                {recordHasPromptActions(record) && <div className="generation-record-actions">
                  <Button onClick={() => setLibraryOpen(true)} aria-label={t('提示词库')} title={t('提示词库')}><Icon name="generation-record-imgLeftIcon" size={16} />{compactLibraryLabel}</Button><Divider vertical />
                  <Button aria-haspopup="dialog" aria-expanded={saveTarget?.content === t(record.prompt!)} aria-label={t('保存提示词')} title={t('保存提示词')} onClick={event => setSaveTarget({ anchor: event.currentTarget, content: t(record.prompt!) })}><Icon name="generation-record-imgLeftIcon1" size={16} />{compactSavePromptLabel}</Button><Divider vertical />
                  <Button onClick={() => void copyPrompt(t(record.prompt!))}><Icon name="generation-record-imgLeftIcon2" size={16} />{t('复制')}</Button>
                </div>}
              </div>}
            </div>
            {record.generating && !record.images.length && <RecordResults record={record} eager={index === 0} onOpen={() => {}} />}
            {!record.generating && !record.pending && !record.failed && !record.images.length && <p className="text-xs text-muted">{t('暂无结果图片')}</p>}
            {!!record.images.length && <RecordResults record={record} eager={index === 0} onOpen={imageIndex => void openImage(record, imageIndex)} />}
          </article>)}
        </div>}
      </div>
    </aside>}
    {shownPreview.value && previewRecord && <FullImageViewer image={shownPreview.value.image} images={successfulResults.map(item => ({ url: item.url, name: `${t(shownPreview.value!.record.title)} ${item.index + 1}` }))} selectedIndex={successfulResults.findIndex(item => item.index === shownPreview.value!.index)} onSelect={index => void openImage(previewRecord, successfulResults[index].index)} locale={locale} phase={shownPreview.phase} onClose={() => { previewRequest.current++; setPreview(null); }} details={<TaskDetailPanel record={previewRecord} selectedIndex={shownPreview.value.index} active={shownPreview.phase !== 'exit'} onSelect={index => void openImage(previewRecord, index)} onLibrary={() => setLibraryOpen(true)} onSave={(anchor, content) => setSaveTarget({ anchor, content })} onCopy={text => void copyPrompt(text)} onNotify={onNotify} onRegenerate={() => { onRegenerate(previewRecord); previewRequest.current++; setPreview(null); }} onDeleteImage={() => setDeleteTarget({ kind: 'image', record: previewRecord, index: shownPreview.value!.index })} />} />}
    {shownDelete.value && createPortal(<Dialog title={t('删除确认')} className="task-delete-dialog" closeIcon="task-delete-close" phase={shownDelete.phase} onClose={() => setDeleteTarget(null)}><p className="task-delete-dialog-description">{t(shownDelete.value.kind === 'record' ? '删除这条任务记录？删除后不可恢复，画布图片会保留。' : shownDelete.value.record.images.length === 1 ? '删除最后一张结果图后，该任务记录也会从列表移除。删除后不可恢复，画布图片会保留。' : '从记录中删除这张结果图？删除后不可恢复，画布图片会保留。')}</p><footer className="task-delete-dialog-actions"><Button size="m" variant="secondary" onClick={() => setDeleteTarget(null)}>{t('取消')}</Button><Button size="m" variant="danger" onClick={() => { const target = shownDelete.value!; if (target.kind === 'image') deleteResult(target.record, target.index); else deleteRecord(target.record); setDeleteTarget(null); }}>{t('确认删除')}</Button></footer></Dialog>, document.body)}
    {library.value && createPortal(<PromptLibrary phase={library.phase} entries={entries} uploads={uploads} onUpload={onUpload} onStore={store} onNotify={onNotify} onClose={() => setLibraryOpen(false)} />, document.body)}
    {shownSave.value && createPortal(<SavePrompt anchor={shownSave.value.anchor} phase={shownSave.phase} onClose={() => setSaveTarget(null)} onSave={async name => {
      const result = await store([{ id: crypto.randomUUID(), name, content: shownSave.value!.content }, ...entries]);
      if (result.ok) { setSaveTarget(null); onNotify('提示词已保存', 'success'); } else { onNotify(result.message, 'error'); }
    }} />, shownSave.value.anchor.closest('dialog') ?? document.body)}
  </>;
}
