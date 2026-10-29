import { ProgressiveImage } from './ProgressiveImage';
import { PromptTools } from './PromptTools';
import { useEffect, useId, useRef, useState } from 'react';
import { assets } from '../assets';
import { fusionReferences, workflowReferenceLimit, workflowHeight, type CanvasImage, type FusionSettings } from '../canvas';
import { ReferenceSourceMenu } from './ReferenceSourceMenu';
import { GenerateTaskButton } from './GenerateTaskButton';
import type { Locale } from '../i18n';
import { Button, Divider, Icon } from './ui';
import { SettingSelect } from './SettingSelect';
import { useVideoReferenceSort } from './useVideoReferenceSort';
import type { VideoWorkflow } from '../video-workflow';

const copy = {
  'zh-CN': { title: '一键融合', tip: '可通过指令和参考图一键融合', main: '主图', mask: '添加示意', reference: '参考图', add: '添加参考图', canvas: '从画布中选择', replace: '替换参考图', remove: '移除参考图', prompt: '融合指令', placeholder: '请输入融合指令', expand: '展开编辑', save: '保存指令', library: '提示词库', count: '字数', clear: '清空', settings: '生成设置', ratio: '图片比例', auto: '自动', resolution: '分辨率', generate: '开始 AI 生成', required: '请输入融合指令', saved: '指令已保存', empty: '暂无保存的指令', close: '关闭', done: '完成' },
  en: { title: 'Instant fusion', tip: 'Fuse with a prompt and reference image', main: 'Main image', mask: 'Edit mask', reference: 'Reference image', add: 'Add reference', canvas: 'Choose from canvas', replace: 'Replace reference', remove: 'Remove reference', prompt: 'Fusion prompt', placeholder: 'Enter a fusion prompt', expand: 'Expand editor', save: 'Save prompt', library: 'Prompt library', count: 'Characters', clear: 'Clear', settings: 'Generation settings', ratio: 'Aspect ratio', auto: 'Auto', resolution: 'Resolution', generate: 'Start AI generation', required: 'Enter a fusion prompt', saved: 'Prompt saved', empty: 'No saved prompts', close: 'Close', done: 'Done' },
  ja: { title: 'ワンクリック融合', tip: '指示と参考画像でワンクリック融合', main: 'メイン画像', mask: 'マスク編集', reference: '参考画像', add: '参考画像を追加', canvas: 'キャンバスから選択', replace: '参考画像を変更', remove: '参考画像を削除', prompt: '融合の指示', placeholder: '融合の指示を入力', expand: '拡大編集', save: '指示を保存', library: 'プロンプト集', count: '文字数', clear: 'クリア', settings: '生成設定', ratio: '画像比率', auto: '自動', resolution: '解像度', generate: 'AI 生成を開始', required: '融合の指示を入力してください', saved: '指示を保存しました', empty: '保存した指示はありません', close: '閉じる', done: '完了' },
};


const lingerieCopy = {
  'zh-CN': { title: '内衣试衣', tip: '内衣专用AI试衣工具', main: '服装图', addMain: '添加服装图', reference: '模特图', add: '添加模特图', remove: '移除模特图', prompt: '试衣描述', placeholder: '请输入试衣描述', required: '请输入试衣描述' },
  en: { title: 'Lingerie try-on', tip: 'AI try-on for lingerie', main: 'Garment image', addMain: 'Add garment image', reference: 'Model image', add: 'Add model image', remove: 'Remove model image', prompt: 'Try-on description', placeholder: 'Enter a try-on description', required: 'Enter a try-on description' },
  ja: { title: '下着試着', tip: '下着専用AI試着ツール', main: '衣服画像', addMain: '衣服画像を追加', reference: 'モデル画像', add: 'モデル画像を追加', remove: 'モデル画像を削除', prompt: '試着の説明', placeholder: '試着の説明を入力', required: '試着の説明を入力してください' },
};

const mergeCopy = {
  'zh-CN': { title: '合拼生图', tip: '上传多张参考图,合并生成新图', uploaded: (limit: number) => `最多${limit}张，已上传` },
  en: { title: 'Merge & generate', tip: 'Combine reference images into a new image', uploaded: (limit: number) => `Up to ${limit}, added` },
  ja: { title: '結合して生成', tip: '複数の参考画像を結合して新しい画像を生成', uploaded: (limit: number) => `最大${limit}枚、追加済み` },
};

const referenceCopy = {
  'zh-CN': { help: '参考图排序说明', hint: '支持拖拽素材调整顺序', added: (limit: number) => `最多${limit}张，已添加` },
  en: { help: 'About reference order', hint: 'Drag references to change their order', added: (limit: number) => `Up to ${limit}, added` },
  ja: { help: '参考画像の並び順について', hint: '素材をドラッグして順序を変更できます', added: (limit: number) => `最大${limit}枚、追加済み` },
};

type Props = { image: CanvasImage; locale: Locale; onChange: (patch: Partial<FusionSettings>) => void; onAddMain: () => void; onReference: (source: 'upload' | 'canvas') => void; onEditGuide: () => void; onGenerate: () => void };
export function FusionNode({ image, locale, onChange, onAddMain, onReference, onEditGuide, onGenerate }: Props) {
  const settings = image.fusion!;
  const lingerie = settings.kind === 'lingerie';
  const merge = settings.kind === 'merge';
  const t = merge ? { ...copy[locale], ...mergeCopy[locale] } : lingerie ? { ...copy[locale], ...lingerieCopy[locale] } : copy[locale];
  const referenceLimit = workflowReferenceLimit(settings);
  const references = fusionReferences(settings);
  const supportsReferenceSorting = !lingerie;
  const sortNode: VideoWorkflow = {
    id: image.id, x: image.x, y: image.y, mode: 'references', generationMode: 'fast',
    references: references.map(({ id, name, url }) => ({ id, name, url, kind: 'image' })),
    prompt: settings.prompt, resolution: settings.resolution, duration: '5s', ratio: settings.ratio, audio: 'auto',
  };
  const sorting = useVideoReferenceSort(sortNode, patch => {
    if (!supportsReferenceSorting || !patch.referenceOrder) return;
    const byId = new Map(references.map(reference => [reference.id, reference]));
    const ordered = patch.referenceOrder.flatMap(id => {
      const reference = byId.get(id);
      if (!reference) return [];
      byId.delete(id);
      return [reference];
    });
    const next = [...ordered, ...byId.values()];
    if (next.some((reference, index) => reference.id !== references[index]?.id)) onChange({ references: next, reference: undefined });
  });
  const referenceText = referenceCopy[locale];
  const reorderHint = referenceText.hint;
  const guide = settings.drawingGuide?.sourceUrl === image.url ? settings.drawingGuide : undefined;
  const guideLabel = guide ? (locale === 'zh-CN' ? '编辑示意' : locale === 'ja' ? 'ガイドを編集' : 'Edit guide') : t.mask;
  const prompt = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLElement>(null);
  const [error, setError] = useState(false);
  const promptId = useId();
  useEffect(() => {
    const blur = (event: PointerEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement && root.current?.contains(active) && event.target !== active) active.blur();
    };
    document.addEventListener('pointerdown', blur, true);
    return () => document.removeEventListener('pointerdown', blur, true);
  }, []);
  useEffect(() => { if (image.nodeOnly) setError(false); }, [image.nodeOnly]);
  function updatePrompt(value: string) { onChange({ prompt: value.slice(0, 2000) }); setError(false); }
  return <section ref={root} className={`fusion-node${!merge && image.nodeOnly ? ' is-empty' : ''}${lingerie ? ' lingerie-node' : ''}${merge ? ' merge-node' : ''}`} style={merge ? { height: workflowHeight(settings) } : undefined} data-overlay data-node-id={merge ? (!references.length ? '177:6191' : references.length === referenceLimit ? '177:6100' : '177:7186') : lingerie ? (image.nodeOnly ? '136:17414' : '136:17371') : (image.nodeOnly ? '107:5118' : '35:6422')} data-source-image={image.id} aria-label={t.title}>
    <header className="fusion-header"><h2>{t.title}</h2><div className="fusion-tip"><img src={assets.fusionTip} alt="" width={20} height={20} /><span>{t.tip}</span></div></header>
    <div className="fusion-content">
      {!merge && <>{image.nodeOnly ? <button className="fusion-add-main" onClick={onAddMain}><Icon name="fusionAddImage" size={20}/>{lingerie ? lingerieCopy[locale].addMain : locale === 'zh-CN' ? '添加主图' : locale === 'ja' ? 'メイン画像を追加' : 'Add main image'}</button> : <div className="fusion-main"><span className="fusion-main-preview"><ProgressiveImage src={image.url} alt={t.main} width={40} height={40}/>{guide && <img className="fusion-guide-preview" src={guide.previewUrl} alt="" aria-hidden="true" draggable={false}/>}</span><span>{t.main}</span>{!lingerie && <Button variant="outline" className="fusion-mask" aria-label={guideLabel} onClick={onEditGuide}><Icon name="fusionBrush" size={20}/></Button>}</div>}<Divider /></>}
      <div className="fusion-field" data-node-id={supportsReferenceSorting ? '6:13063' : undefined}><span className="fusion-label">{t.reference}{supportsReferenceSorting ? <>
        <Button variant="ghost" className="fusion-reference-help nodrag nopan" aria-label={referenceText.help} title={reorderHint} data-tooltip-side="right" data-node-id="6:13066"><Icon name="fusionReferenceInfo" size={16} /></Button>
        <Divider vertical />
        <span className="fusion-reference-summary">{referenceText.added(referenceLimit)}<span className="fusion-reference-current">{references.length}</span>/{referenceLimit}</span>
      </> : merge ? <><span className="merge-count-divider"/><span className="merge-reference-count">{mergeCopy[locale].uploaded(referenceLimit)} <span>{references.length}</span>/{referenceLimit}</span></> : !lingerie && <span className="fusion-reference-count">{references.length} / {referenceLimit}</span>}</span>
        {supportsReferenceSorting && <span className="sr-only" id={`${promptId}-reference-sort`}>{reorderHint}</span>}
        <div className={`fusion-references${supportsReferenceSorting ? ' fusion-references--sortable nowheel' : ''}`} role={supportsReferenceSorting ? 'group' : undefined} aria-label={supportsReferenceSorting ? t.reference : undefined}
          ref={supportsReferenceSorting ? element => sorting.row('image', element) : undefined}
          data-reference-sorting={supportsReferenceSorting && Boolean(sorting.dragId)}
          onWheel={supportsReferenceSorting ? event => event.stopPropagation() : undefined}
          onDragOver={supportsReferenceSorting ? event => sorting.over(event, 'image') : undefined}
          onDragLeave={supportsReferenceSorting ? sorting.leave : undefined}
          onDrop={supportsReferenceSorting ? event => sorting.drop(event, 'image') : undefined}>
          {references.map((reference, index) => {
            const position = supportsReferenceSorting ? sorting.order.indexOf(reference.id) : index;
            return <div className={`fusion-reference-wrap${supportsReferenceSorting ? ' nodrag nopan' : ''}`} key={supportsReferenceSorting || merge ? reference.id : reference.url}
              role={supportsReferenceSorting ? 'group' : undefined}
              aria-label={supportsReferenceSorting ? `${t.reference} ${position + 1}: ${reference.name}` : undefined}
              aria-describedby={supportsReferenceSorting ? `${promptId}-reference-sort` : undefined}
              draggable={supportsReferenceSorting}
              ref={supportsReferenceSorting ? element => sorting.tile(reference.id, element) : undefined}
              style={supportsReferenceSorting ? { order: position } : undefined}
              data-dragging={supportsReferenceSorting && sorting.dragId === reference.id}
              onDragStart={supportsReferenceSorting ? event => {
                if ((event.target as Element).closest('.fusion-reference-remove')) { event.preventDefault(); return; }
                sorting.begin(event, { ...reference, kind: 'image' });
              } : undefined}
              onDragEnd={supportsReferenceSorting ? sorting.end : undefined}>
            <div className="fusion-reference"><ProgressiveImage src={reference.url} alt={reference.name} /></div>
            {supportsReferenceSorting && <span className="fusion-reference-number" aria-hidden="true">{position + 1}</span>}
            <Button variant="tonal" className="fusion-reference-remove" aria-label={`${t.remove} ${position + 1}`} title={t.remove} onClick={() => onChange({ references: references.filter((_, i) => i !== index), reference: undefined })}><Icon name="close" size={merge || supportsReferenceSorting ? 12 : 16} /></Button>
          </div>; })}
          {references.length < referenceLimit && <ReferenceSourceMenu style={supportsReferenceSorting ? { order: references.length } : undefined} addLabel={t.add} canvasLabel={t.canvas} onChoose={onReference}>{supportsReferenceSorting ? <Icon name="fusionReferenceAdd" size={20} /> : undefined}</ReferenceSourceMenu>}
        </div>
      </div>
      <div className="fusion-field"><label className="fusion-label" htmlFor={promptId}>{t.prompt}<span className="fusion-required">*</span></label><div className={`fusion-textarea${error ? ' has-error' : ''}`}>
        <textarea ref={prompt} id={promptId} value={settings.prompt} placeholder={t.placeholder} required maxLength={2000} aria-invalid={error} aria-describedby={error ? `${promptId}-error` : undefined} onChange={e => updatePrompt(e.target.value)} />
        <div className="fusion-textarea-footer"><div className="fusion-prompt-actions"><PromptTools key={image.nodeOnly ? 'empty' : 'main'} value={settings.prompt} onChange={updatePrompt} labels={t} /></div><span className="fusion-counter" aria-label={t.count}>{settings.prompt.length}/2000</span><Button variant="secondary" className="fusion-clear" onClick={() => updatePrompt('')}>{t.clear}</Button></div>
      </div>{error && <p className={merge ? 'sr-only' : 'fusion-error'} id={`${promptId}-error`} role="alert">{t.required}</p>}</div>
      <div className="fusion-field"><span className="fusion-label">{t.settings}</span><div className="fusion-settings"><SettingSelect label={t.ratio} value={settings.ratio} icon="fusionRatio" options={['auto', '1:1', '3:4', '4:3', '9:16', '16:9'].map(value => ({value, label: value === 'auto' ? t.auto : value}))} onChange={ratio => onChange({ ratio })} /><SettingSelect label={t.resolution} value={settings.resolution} icon="fusionHd" options={['1K', '2K', '4K'].map(value => ({value,label:value}))} onChange={resolution => onChange({ resolution })} /></div></div>
    </div>
    <footer className="fusion-node-action">
      <GenerateTaskButton label={t.generate} cost="999" className="fusion-generate" onClick={() => { if (merge ? !references.length : image.nodeOnly) { if (merge) onReference('upload'); else onAddMain(); return; } if (!lingerie && !settings.prompt.trim()) { setError(true); prompt.current?.focus(); } else onGenerate(); }} />
    </footer>
  </section>;
}
