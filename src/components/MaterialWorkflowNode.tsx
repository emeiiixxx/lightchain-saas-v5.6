import { useEffect, useId, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import type { Locale } from '../i18n';
import { canGenerateMaterialWorkflow, materialReferenceLimit, materialWorkflowHasBackView, materialWorkflowSize, materialWorkflowTitle, materialWorkflowViews, type MaterialView, type MaterialWorkflow } from '../material-workflow';
import { videoNodeAssetSets } from '../video-node-assets';
import { materialGenerationAssets } from '../material-generation-settings-assets';
import type { VideoReference, VideoWorkflow } from '../video-workflow';
import { Button, Icon } from './ui';
import { ChoiceChip } from './ChoiceChip';
import { GenerateTaskButton } from './GenerateTaskButton';
import { MaterialGenerationSettings } from './MaterialGenerationSettings';
import { ProgressiveImage } from './ProgressiveImage';
import { PromptTools } from './PromptTools';
import { Switch } from './Switch';
import { ReferenceSourceMenu } from './ReferenceSourceMenu';
import { useVideoReferenceSort } from './useVideoReferenceSort';
import '../video-workflow-node.css';
import '../material-workflow.css';

const promptLimit = 2000;
const views: MaterialView[] = ['front', 'left45', 'left', 'right45', 'right', 'back'];
const copy = {
  'zh-CN': {
    quickTip: '上传参考图，输入描述快速生成素材', tip: '功能介绍描述', references: '参考图',
    referenceTip: '支持拖拽图片调整顺序', uploaded: '最多9张，已上传', add: '添加图片', addBack: '添加背面参考图',
    uploadReference: '上传参考图', fromCanvas: '从画布中选择',
    remove: '删除', preview: '预览', reorder: '按住 Alt 和左右方向键调整顺序',
    view: '选择视角', front: '正面', left45: '左45°', left: '左侧', right45: '右45°', right: '右侧', back: '背面', backReference: '背面参考图',
    storyboard: '分镜配置', crop: '裁切配置', four: '四宫格', nine: '九宫格',
    prompt: '生图描述', placeholder: '请输入服装、人物动作、场景等', smartExpand: '智能扩写',
    expand: '展开编辑', save: '保存指令', library: '提示词库', clear: '清空', close: '关闭', count: '字数',
    settings: '生成设置', generate: '开始 AI 生成',
  },
  en: {
    quickTip: 'Add references and a prompt to generate images', tip: 'Feature description', references: 'References',
    referenceTip: 'Drag images to reorder', uploaded: 'Up to 9, added ', add: 'Add image', addBack: 'Add back reference',
    uploadReference: 'Upload reference image', fromCanvas: 'Choose from canvas',
    remove: 'Delete', preview: 'Preview', reorder: 'Hold Alt and use left or right arrow to reorder',
    view: 'Choose view', front: 'Front', left45: 'Left 45°', left: 'Left', right45: 'Right 45°', right: 'Right', back: 'Back', backReference: 'Back reference',
    storyboard: 'Storyboard layout', crop: 'Crop layout', four: '2 × 2 grid', nine: '3 × 3 grid',
    prompt: 'Image description', placeholder: 'Describe clothing, poses, settings, and more', smartExpand: 'Smart expand',
    expand: 'Expand editor', save: 'Save prompt', library: 'Prompt library', clear: 'Clear', close: 'Close', count: 'Characters',
    settings: 'Generation settings', generate: 'Start AI generation',
  },
  ja: {
    quickTip: '参考画像と説明から素材をすばやく生成', tip: '機能の説明', references: '参考画像',
    referenceTip: 'ドラッグで画像の順序を変更できます', uploaded: '最大9枚、追加済み', add: '画像を追加', addBack: '背面の参考画像を追加',
    uploadReference: '参考画像をアップロード', fromCanvas: 'キャンバスから選択',
    remove: '削除', preview: 'プレビュー', reorder: 'Alt と左右矢印キーで順序を変更',
    view: 'アングルを選択', front: '正面', left45: '左45°', left: '左側', right45: '右45°', right: '右側', back: '背面', backReference: '背面の参考画像',
    storyboard: '絵コンテの構成', crop: '分割設定', four: '4分割', nine: '9分割',
    prompt: '画像の説明', placeholder: '服装、人物の動作、背景などを入力', smartExpand: 'スマート拡張',
    expand: '拡大編集', save: '指示を保存', library: 'プロンプト集', clear: 'クリア', close: '閉じる', count: '文字数',
    settings: '生成設定', generate: 'AI 生成を開始',
  },
};

type Props = {
  node: MaterialWorkflow;
  locale: Locale;
  onChange: (patch: Partial<MaterialWorkflow>) => void;
  onReference: (field: 'references' | 'back', source: 'upload' | 'canvas') => void;
  onPreview: (reference: VideoReference) => void;
  onGenerate: () => void;
};

function NodeIcon({ src, size = 16, className = '' }: { src: string; size?: number; className?: string }) {
  return <span className={`icon video-node-icon ${className}`} aria-hidden="true" style={{ width: size, height: size, '--icon-url': `url("${src}")` } as CSSProperties} />;
}

function navigateChoices(event: KeyboardEvent<HTMLDivElement>, selectOnFocus = true) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault(); event.stopPropagation();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
    : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
  if (selectOnFocus) buttons[next]?.click();
}

export function MaterialWorkflowNode({ node, locale, onChange, onReference, onPreview, onGenerate }: Props) {
  const t = copy[locale];
  const id = useId();
  const root = useRef<HTMLElement>(null);
  const suppressPreviewUntil = useRef(0);
  const references = node.references;
  const single = node.kind === 'gridSplit';
  const supportsReferenceSorting = materialReferenceLimit(node.kind) > 1;
  const requiresReferences = node.kind !== 'quick';
  const hasPrompt = node.kind === 'quick' || node.kind === 'storyboard';
  const hasSettings = node.kind === 'quick' || node.kind === 'multiView';
  const selectedViews = materialWorkflowViews(node);
  const hasBackView = materialWorkflowHasBackView(node);
  const canGenerate = canGenerateMaterialWorkflow(node);
  const assets = references.length ? videoNodeAssetSets.referencesFilled : videoNodeAssetSets.referencesEmpty;
  const title = materialWorkflowTitle(node.kind, locale);
  const sortNode: VideoWorkflow = {
    id: node.id, x: node.x, y: node.y, mode: 'references', generationMode: 'fast',
    references, prompt: node.prompt, resolution: node.resolution, duration: '5s', ratio: node.ratio, audio: 'auto',
  };
  const sorting = useVideoReferenceSort(sortNode, patch => {
    if (!supportsReferenceSorting || !patch.referenceOrder) return;
    const byId = new Map(references.map(reference => [reference.id, reference]));
    const ordered = patch.referenceOrder.flatMap(referenceId => {
      const reference = byId.get(referenceId);
      if (!reference) return [];
      byId.delete(referenceId);
      return [reference];
    });
    onChange({ references: [...ordered, ...byId.values()] });
  });
  const designId = node.kind === 'quick' ? references.length ? '141:24359' : '141:24357'
    : node.kind === 'multiView' ? hasBackView ? '141:25509' : '141:25185'
    : node.kind === 'storyboard' ? '141:25380' : '141:25857';

  useEffect(() => {
    const blur = (event: PointerEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement && root.current?.contains(active) && event.target !== active) active.blur();
    };
    document.addEventListener('pointerdown', blur, true);
    return () => document.removeEventListener('pointerdown', blur, true);
  }, []);

  function updatePrompt(value: string) { onChange({ prompt: value.slice(0, promptLimit) }); }
  function toggleView(view: MaterialView) {
    const next = selectedViews.includes(view) ? selectedViews.filter(item => item !== view) : [...selectedViews, view];
    onChange({ view: views.filter(item => next.includes(item)) });
  }
  function generate() {
    if (!canGenerate) return;
    onGenerate();
  }
  function finishDrag() { sorting.end(); suppressPreviewUntil.current = Date.now() + 200; }
  function thumbnail(reference: VideoReference, field: 'references' | 'back', index?: number) {
    const reorder = field === 'references' && supportsReferenceSorting;
    return <div className="video-reference-tile nodrag nopan" key={reference.id} draggable={reorder}
      ref={reorder ? element => sorting.tile(reference.id, element) : undefined}
      style={reorder ? { order: index } : undefined} data-dragging={reorder && sorting.dragId === reference.id}
      onDragStart={event => { if (!reorder) { event.preventDefault(); return; } sorting.begin(event, reference); }} onDragEnd={finishDrag}>
      <button type="button" className="video-reference-preview" aria-label={`${t.preview} ${reference.name}`} aria-describedby={reorder ? `${id}-reorder` : undefined}
        onClick={() => { if (Date.now() >= suppressPreviewUntil.current) onPreview(reference); }}
        onKeyDown={event => {
          if (!reorder || !event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const target = references[references.findIndex(item => item.id === reference.id) + (event.key === 'ArrowLeft' ? -1 : 1)];
          if (target) sorting.move('image', reference.id, target.id);
        }}>
        <ProgressiveImage src={reference.url} alt={reference.name} width={64} height={64} />
      </button>
      {reorder && index !== undefined && <span className="video-reference-number" aria-hidden="true">{index + 1}</span>}
      <Button variant="tonal" className="video-reference-remove" title={t.remove} aria-label={`${t.remove} ${reference.name}`}
        onClick={() => onChange(field === 'back' ? { back: undefined } : { references: references.filter(item => item.id !== reference.id) })}>
        <Icon name="close" size={12} />
      </Button>
    </div>;
  }
  const expansionControl = <label className="video-prompt-expansion nodrag nopan"><span>{t.smartExpand}</span>
    <Switch checked={node.smartExpand} aria-label={t.smartExpand} onCheckedChange={smartExpand => onChange({ smartExpand })} />
  </label>;
  const gridLabel = single ? t.crop : t.storyboard;

  return <section ref={root} className="fusion-node material-workflow-node" lang={locale} style={materialWorkflowSize(node)}
    data-overlay data-source-image={node.id} data-kind={node.kind} data-node-id={designId} aria-label={title}>
    <header className="fusion-header material-workflow-header">
      <h2>{title}</h2>
      <div className="fusion-tip"><img src={materialGenerationAssets.tip} alt="" width={20} height={20} /><span>{node.kind === 'quick' ? t.quickTip : t.tip}</span></div>
    </header>
    <div className="fusion-content material-workflow-content">
      <div className="fusion-field material-reference-field">
        <div className="material-reference-heading" id={`${id}-references`}>
          <span className="fusion-label">{t.references}{requiresReferences && <span className="fusion-required">*</span>}</span>
          {supportsReferenceSorting && <><Button className="material-reference-info nodrag nopan" aria-label={t.referenceTip} title={t.referenceTip}><NodeIcon src={assets.info} /></Button>
            <span className="video-reference-label-divider" aria-hidden="true" />
            <span className="material-reference-count">{t.uploaded}<span>{references.length}</span>/{materialReferenceLimit(node.kind)}</span></>}
        </div>
        <div ref={supportsReferenceSorting ? element => sorting.row('image', element) : undefined} className="video-workflow-references material-reference-row nowheel" data-canvas-scroll="wheel"
          data-reference-sorting={Boolean(sorting.dragId)} aria-labelledby={`${id}-references`}
          onDragOver={supportsReferenceSorting ? event => sorting.over(event, 'image') : undefined} onDragLeave={supportsReferenceSorting ? sorting.leave : undefined}
          onDrop={supportsReferenceSorting ? event => { sorting.drop(event, 'image'); suppressPreviewUntil.current = Date.now() + 200; } : undefined}
          onWheel={event => { if (event.ctrlKey || event.metaKey || event.altKey) return; event.stopPropagation(); if (!event.deltaX) event.currentTarget.scrollLeft += event.deltaY; }}>
          {references.map(reference => thumbnail(reference, 'references', sorting.order.indexOf(reference.id)))}
          {references.length < materialReferenceLimit(node.kind) && <ReferenceSourceMenu className="fusion-reference video-workflow-reference-add nodrag nopan" style={{ order: references.length }}
            addLabel={t.add} uploadLabel={t.uploadReference} canvasLabel={t.fromCanvas} onChoose={source => onReference('references', source)}><NodeIcon src={assets.addReference} size={20} /></ReferenceSourceMenu>}
        </div>
      </div>
      {node.kind === 'multiView' && <div className="fusion-field material-view-field">
        <div className="fusion-label" id={`${id}-view`}>{t.view}<span className="fusion-required">*</span></div>
        <div className="material-choice-group material-view-choices" role="group" aria-labelledby={`${id}-view`} onKeyDown={event => navigateChoices(event, false)}>
          {views.map(view => <ChoiceChip key={view} selected={selectedViews.includes(view)} onClick={() => toggleView(view)}>{t[view]}</ChoiceChip>)}
        </div>
        {hasBackView && <div className="fusion-field material-back-field">
          <div className="fusion-label">{t.backReference}<span className="fusion-required">*</span></div>
          <div className="material-back-reference">
            {node.back ? thumbnail(node.back, 'back') : <ReferenceSourceMenu className="fusion-reference video-workflow-reference-add nodrag nopan" addLabel={t.addBack}
              uploadLabel={t.uploadReference} canvasLabel={t.fromCanvas} onChoose={source => onReference('back', source)}><NodeIcon src={assets.addReference} size={20} /></ReferenceSourceMenu>}
          </div>
        </div>}
      </div>}
      {(node.kind === 'storyboard' || single) && <div className="fusion-field material-grid-field">
        <div className="fusion-label" id={`${id}-grid`}>{gridLabel}<span className="fusion-required">*</span></div>
        <div className="material-choice-group" role="group" aria-labelledby={`${id}-grid`} onKeyDown={navigateChoices}>
          {([4, 9] as const).map(grid => <ChoiceChip key={grid} selected={node.grid === grid} onClick={() => onChange({ grid })}>{grid === 4 ? t.four : t.nine}</ChoiceChip>)}
        </div>
      </div>}
      {hasPrompt && <div className="fusion-field material-workflow-prompt">
        <div className="material-prompt-heading"><label className="fusion-label" htmlFor={`${id}-prompt`}>{t.prompt}<span className="fusion-required">*</span></label>{node.kind === 'quick' && expansionControl}</div>
        <div className="fusion-textarea">
          <textarea id={`${id}-prompt`} className="nodrag nopan nowheel" value={node.prompt} placeholder={t.placeholder} required maxLength={promptLimit}
            onChange={event => updatePrompt(event.target.value)} onWheel={event => event.stopPropagation()} />
          <div className="fusion-textarea-footer">
            <div className="fusion-prompt-actions nodrag nopan"><PromptTools value={node.prompt} onChange={updatePrompt} labels={t} maxLength={promptLimit}
              expandedHeaderAction={node.kind === 'quick' ? expansionControl : undefined}
              inlineIcons={{ expand: <NodeIcon src={assets.promptExpand} />, save: <NodeIcon src={assets.promptSave} />, library: <NodeIcon src={assets.promptLibrary} /> }} /></div>
            <span className="fusion-counter" aria-label={t.count}>{node.prompt.length}/{promptLimit}</span>
          </div>
        </div>
      </div>}
      {hasSettings && <div className="fusion-field material-generation-field">
        <span className="fusion-label">{t.settings}</span>
        <MaterialGenerationSettings locale={locale} ratio={node.ratio} resolution={node.resolution} count={node.count} onChange={onChange}
          chevron={<NodeIcon src={assets.chevron} className="lc-setting-select-chevron" />} />
      </div>}
    </div>
    <footer className="fusion-node-action material-workflow-action nodrag nopan">
      <GenerateTaskButton label={t.generate} cost="20" costIcon={<NodeIcon src={assets.generateStar} />} disabled={!canGenerate} onClick={generate} />
    </footer>
    {supportsReferenceSorting && <span className="sr-only" id={`${id}-reorder`}>{t.reorder}</span>}
  </section>;
}
