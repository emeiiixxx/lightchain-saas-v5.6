import { useEffect, useId, useRef, useState } from 'react';
import { assets } from '../assets';
import { batchMainImages, fusionReferences, MAX_BATCH_MAIN_IMAGES, MAX_FUSION_REFERENCES, type CanvasImage, type FusionSettings } from '../canvas';
import type { Locale } from '../i18n';
import { GenerateTaskButton } from './GenerateTaskButton';
import { ProgressiveImage } from './ProgressiveImage';
import { PromptTools } from './PromptTools';
import { ReferenceSourceMenu } from './ReferenceSourceMenu';
import { SettingSelect } from './SettingSelect';
import { Button, Icon } from './ui';
import './batch-edit-node.css';

const copy = {
  'zh-CN': {
    title: '批量编辑', tip: '批量编辑：多图共用一组节点进行批量生图', main: '主图', addMain: '添加主图', removeMain: '移除主图',
    reference: '参考图', addReference: '添加参考图', removeReference: '移除参考图', canvas: '从画布中选择', uploaded: `最多${MAX_FUSION_REFERENCES}张，已上传`,
    prompt: '融合指令', placeholder: '请输入融合指令', required: '请输入融合指令', expand: '展开编辑', save: '保存指令', library: '提示词库', clear: '清空', close: '关闭',
    count: '字数', ratio: '图片比例', auto: '自动', resolution: '分辨率', outputs: '生成数量', unit: '张', generate: '开始 AI 生成',
  },
  en: {
    title: 'Batch edit', tip: 'Batch edit: generate for multiple images with one shared node', main: 'Main image', addMain: 'Add main image', removeMain: 'Remove main image',
    reference: 'References', addReference: 'Add reference', removeReference: 'Remove reference', canvas: 'Choose from canvas', uploaded: `Up to ${MAX_FUSION_REFERENCES}, added `,
    prompt: 'Fusion prompt', placeholder: 'Enter a fusion prompt', required: 'Enter a fusion prompt', expand: 'Expand editor', save: 'Save prompt', library: 'Prompt library', clear: 'Clear', close: 'Close',
    count: 'Characters', ratio: 'Aspect ratio', auto: 'Auto', resolution: 'Resolution', outputs: 'Output count', unit: ' images', generate: 'Generate',
  },
  ja: {
    title: '一括編集', tip: '一括編集：複数の画像で同じノード設定を使って生成', main: 'メイン画像', addMain: 'メイン画像を追加', removeMain: 'メイン画像を削除',
    reference: '参考画像', addReference: '参考画像を追加', removeReference: '参考画像を削除', canvas: 'キャンバスから選択', uploaded: `最大${MAX_FUSION_REFERENCES}枚、追加済み`,
    prompt: '融合の指示', placeholder: '融合の指示を入力', required: '融合の指示を入力してください', expand: '拡大編集', save: '指示を保存', library: 'プロンプト集', clear: 'クリア', close: '閉じる',
    count: '文字数', ratio: '画像比率', auto: '自動', resolution: '解像度', outputs: '生成枚数', unit: '枚', generate: 'AI 生成',
  },
};

type Props = {
  image: CanvasImage;
  locale: Locale;
  onChange: (patch: Partial<FusionSettings>) => void;
  onMainImages: (source: 'upload' | 'canvas') => void;
  onReference: (source: 'upload' | 'canvas') => void;
  onGenerate: () => void;
};

// Figma 696:7197 / 696:6657. Main inputs are independent from shared references.
export function BatchEditNode({ image, locale, onChange, onMainImages, onReference, onGenerate }: Props) {
  const settings = image.fusion!;
  const mainImages = batchMainImages(settings);
  const references = fusionReferences(settings);
  const t = copy[locale];
  const promptId = useId();
  const prompt = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const blur = (event: PointerEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement && root.current?.contains(active) && event.target !== active) active.blur();
    };
    document.addEventListener('pointerdown', blur, true);
    return () => document.removeEventListener('pointerdown', blur, true);
  }, []);

  function updatePrompt(value: string) {
    onChange({ prompt: value.slice(0, 2000) });
    setError(false);
  }

  function generate() {
    if (!mainImages.length) { onMainImages('upload'); return; }
    if (!settings.prompt.trim()) { setError(true); prompt.current?.focus(); return; }
    onGenerate();
  }

  return <section ref={root} className="fusion-node batch-edit-node" data-overlay data-node-id={references.length ? '696:6657' : '696:7197'} data-source-image={image.id} aria-label={t.title}>
    <header className="batch-edit-header">
      <div className="fusion-tip batch-edit-tip"><img src={assets.batchTip} alt="" width={20} height={20} /><span>{t.tip}</span></div>
    </header>
    <div className="batch-edit-body">
      <div className="batch-main-list nodrag nowheel" data-canvas-scroll role="group" aria-label={`${t.main} ${mainImages.length}/${MAX_BATCH_MAIN_IMAGES}`} onWheel={event => event.stopPropagation()}>
        {mainImages.length < MAX_BATCH_MAIN_IMAGES && <ReferenceSourceMenu addLabel={t.addMain} canvasLabel={t.canvas} onChoose={onMainImages} className="batch-main-card batch-add-main">
          <span className="batch-main-add-tile"><Icon name="batchAdd" size={20} /></span><span className="batch-main-label">{t.addMain}</span>
        </ReferenceSourceMenu>}
        {mainImages.map((main, index) => <div className="batch-main-card" key={main.id}>
          <span className="batch-main-preview"><ProgressiveImage src={main.url} alt={main.name} width={40} height={40} /></span>
          <span className="batch-main-label">{t.main}{index + 1}</span>
          <Button variant="tonal" className="batch-main-remove" aria-label={`${t.removeMain} ${index + 1}`} title={t.removeMain} onClick={() => onChange({ mainImages: mainImages.filter((_, i) => i !== index) })}><Icon name="batchClose" size={16 * 2 / 3} /></Button>
        </div>)}
      </div>
      <div className="batch-edit-fields">
        <div className="batch-reference-field">
          <div className="batch-reference-heading"><span className="fusion-label">{t.reference}</span><span className="batch-reference-divider" aria-hidden="true" /><span className="batch-reference-count">{t.uploaded}<span>{references.length}</span>/{MAX_FUSION_REFERENCES}</span></div>
          <div className="batch-references">
            {references.map((reference, index) => <div className="fusion-reference-wrap" key={reference.id}>
              <div className="fusion-reference"><ProgressiveImage src={reference.url} alt={reference.name} width={48} height={48} /></div>
              <Button variant="tonal" className="fusion-reference-remove" aria-label={`${t.removeReference} ${index + 1}`} title={t.removeReference} onClick={() => onChange({ references: references.filter((_, i) => i !== index), reference: undefined })}><Icon name="batchClose" size={16 * 2 / 3} /></Button>
            </div>)}
            {references.length < MAX_FUSION_REFERENCES && <ReferenceSourceMenu addLabel={t.addReference} canvasLabel={t.canvas} onChoose={onReference}><Icon name="batchAddImage" size={20} /></ReferenceSourceMenu>}
          </div>
        </div>
        <div className={`fusion-textarea batch-edit-prompt${error ? ' has-error' : ''}`}>
          <textarea ref={prompt} id={promptId} aria-label={t.prompt} value={settings.prompt} placeholder={t.placeholder} required maxLength={2000} aria-invalid={error} aria-describedby={error ? `${promptId}-error` : undefined} onChange={event => updatePrompt(event.target.value)} onWheel={event => event.stopPropagation()} />
          <div className="fusion-textarea-footer"><div className="fusion-prompt-actions"><PromptTools value={settings.prompt} onChange={updatePrompt} labels={t} /></div><span className="fusion-counter" aria-label={t.count}>{settings.prompt.length}/2000</span><Button variant="secondary" className="fusion-clear" onClick={() => updatePrompt('')}>{t.clear}</Button></div>
          {error && <p className="sr-only" id={`${promptId}-error`} role="alert">{t.required}</p>}
        </div>
        <footer className="batch-edit-settings">
          <SettingSelect label={t.ratio} value={settings.ratio} icon="fusionRatio" options={['auto', '1:1', '3:4', '4:3', '9:16', '16:9'].map(value => ({ value, label: value === 'auto' ? t.auto : value }))} onChange={ratio => onChange({ ratio })} />
          <SettingSelect label={t.resolution} value={settings.resolution} icon="fusionHd" options={['1K', '2K', '4K'].map(value => ({ value, label: value }))} onChange={resolution => onChange({ resolution })} />
          <span className="batch-output-count" aria-label={`${t.outputs} ${mainImages.length}`}>{mainImages.length}{t.unit}</span>
          <GenerateTaskButton label={t.generate} cost="999" onClick={generate} />
        </footer>
      </div>
    </div>
  </section>;
}
