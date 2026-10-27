import { useEffect, useId, useRef, type CSSProperties } from 'react';
import type { Locale } from '../i18n';
import { canGenerateVideoWorkflow, videoReferenceLimits, videoWorkflowReferences, videoWorkflowSize, videoWorkflowTitle, type VideoReference, type VideoWorkflow } from '../video-workflow';
import { videoNodeAssetSets, videoSettingsIcon } from '../video-node-assets';
import { Button, Icon } from './ui';
import { GenerateTaskButton } from './GenerateTaskButton';
import { ProgressiveImage } from './ProgressiveImage';
import { PromptTools } from './PromptTools';
import { VideoGenerationSettings } from './VideoGenerationSettings';
import { useVideoReferenceSort } from './useVideoReferenceSort';
import { Switch } from './Switch';
import { ReferenceSourceMenu } from './ReferenceSourceMenu';
import '../video-workflow-node.css';

const promptLimit = 5000;
const referenceVideoIcon = `${import.meta.env.BASE_URL}assets/video-node-final/reference-video-element.svg`;
const copy = {
  'zh-CN': {
    title: '服装短视频', referenceTitle: '专业服装视频',
    framesTip: '上传首尾帧图片，智能生成短视频', longTip: '支持上传图片/视频作为参考，生成最多30s视频',
    main: '主图', mainFrame: '主图（首帧）', addMain: '添加首帧图', endFrame: '尾帧图', addEnd: '添加尾帧图',
    endTip: '建议上传同一模特/背景/服装的连贯动作图', media: '参考素材', mediaTip: '支持拖拽素材调整顺序',
    image: '图片', video: '视频', imageCount: '最多9张，已上传', videoCount: '最多3个，已上传',
    addImage: '添加图片', addVideo: '添加视频', remove: '删除', preview: '预览', reorder: '按住 Alt 和左右方向键调整顺序',
    uploadImage: '上传参考图', uploadVideo: '上传参考视频', fromCanvas: '从画布中选择',
    prompt: '视频描述', placeholder: '举例:持久定格模特正面,女模特表情自信冷静,发丝与裙摆同步飘动,同时背景中的直升机起飞,随后模特转身,动作丝滑,画面流畅切换到模特上半身特写',
    expand: '展开编辑', save: '保存指令', library: '提示词库', clear: '清空', close: '关闭', count: '字数',
    smartExpand: '智能扩写',
    settings: '生成设置', generate: '开始 AI 生成', required: '请输入视频描述',
  },
  en: {
    title: 'Fashion short video', referenceTitle: 'Professional fashion video',
    framesTip: 'Upload first and last frames to generate a short video', longTip: 'Use images or videos to generate up to 30 seconds',
    main: 'Main image', mainFrame: 'Main image (first frame)', addMain: 'Add first frame', endFrame: 'Last frame', addEnd: 'Add last frame',
    endTip: 'Use continuous poses with the same model, background and clothing', media: 'Reference media', mediaTip: 'Drag media to reorder',
    image: 'Images', video: 'Videos', imageCount: 'Up to 9, uploaded ', videoCount: 'Up to 3, uploaded ',
    addImage: 'Add image', addVideo: 'Add video', remove: 'Delete', preview: 'Preview', reorder: 'Hold Alt and use left or right arrow to reorder',
    uploadImage: 'Upload reference image', uploadVideo: 'Upload reference video', fromCanvas: 'Choose from canvas',
    prompt: 'Video description', placeholder: 'Example: Hold a front view of the model with a confident, calm expression. Her hair and skirt move in the breeze as a helicopter takes off behind her. She turns smoothly, then the shot transitions to a close-up of her upper body.',
    expand: 'Expand editor', save: 'Save prompt', library: 'Prompt library', clear: 'Clear', close: 'Close', count: 'Characters',
    smartExpand: 'Smart expansion',
    settings: 'Generation settings', generate: 'Start AI generation', required: 'Enter a video description',
  },
  ja: {
    title: 'ファッション短編動画', referenceTitle: 'プロ向けファッション動画',
    framesTip: '開始・終了画像から短編動画を生成', longTip: '画像や動画を参考に最大30秒の動画を生成',
    main: 'メイン画像', mainFrame: 'メイン画像（開始）', addMain: '開始画像を追加', endFrame: '終了画像', addEnd: '終了画像を追加',
    endTip: '同じモデル・背景・服装で連続した動作の画像を推奨', media: '参考素材', mediaTip: 'ドラッグで素材の順序を変更できます',
    image: '画像', video: '動画', imageCount: '最大9枚、追加済み ', videoCount: '最大3本、追加済み ',
    addImage: '画像を追加', addVideo: '動画を追加', remove: '削除', preview: 'プレビュー', reorder: 'Alt と左右矢印キーで順序を変更',
    uploadImage: '参考画像をアップロード', uploadVideo: '参考動画をアップロード', fromCanvas: 'キャンバスから選択',
    prompt: '動画の説明', placeholder: '例：自信に満ちた落ち着いた表情のモデルを正面から捉えます。髪とスカートが風になびき、背景のヘリコプターが離陸します。モデルが滑らかに振り返り、上半身のクローズアップに切り替わります。',
    expand: '拡大編集', save: '指示を保存', library: 'プロンプト集', clear: 'クリア', close: '閉じる', count: '文字数',
    smartExpand: 'スマート拡張',
    settings: '生成設定', generate: 'AI 生成を開始', required: '動画の説明を入力してください',
  },
};

type Props = {
  node: VideoWorkflow;
  locale: Locale;
  onChange: (patch: Partial<VideoWorkflow>) => void;
  onMain: (source: 'upload' | 'canvas') => void;
  onReference: (kind: VideoReference['kind'], source: 'upload' | 'canvas') => void;
  onPreview: (reference: VideoReference) => void;
  onGenerate: () => void;
};

function NodeIcon({ src, size = 16, className = '' }: { src: string; size?: number; className?: string }) {
  return <span className={'icon video-node-icon ' + className} aria-hidden="true" style={{ width: size, height: size, '--icon-url': 'url("' + src + '")' } as CSSProperties} />;
}

export function VideoWorkflowNode({ node, locale, onChange, onMain, onReference, onPreview, onGenerate }: Props) {
  const t = copy[locale];
  const frames = node.mode === 'frames';
  const title = videoWorkflowTitle(node.mode, locale);
  const references = videoWorkflowReferences(node);
  const canGenerate = canGenerateVideoWorkflow(node);
  const frameAssets = node.main ? videoNodeAssetSets.framesFilled : videoNodeAssetSets.framesEmpty;
  const referenceAssets = references.length ? videoNodeAssetSets.referencesFilled : videoNodeAssetSets.referencesEmpty;
  const assets = frames ? frameAssets : referenceAssets;
  const expansionControl = <label className="video-prompt-expansion nodrag nopan"><span>{t.smartExpand}</span><Switch checked={node.smartExpand ?? false} aria-label={t.smartExpand} onCheckedChange={smartExpand => onChange({ smartExpand })} /></label>;
  const designId = frames ? (node.main ? '119:11242' : '84:6110') : (references.length ? '121:18150' : '121:17924');
  const root = useRef<HTMLElement>(null);
  const suppressPreviewUntil = useRef(0);
  const sorting = useVideoReferenceSort(node, onChange);
  const id = useId();
  const promptId = id + '-prompt';

  useEffect(() => {
    const blur = (event: PointerEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement && root.current?.contains(active) && event.target !== active) active.blur();
    };
    document.addEventListener('pointerdown', blur, true);
    return () => document.removeEventListener('pointerdown', blur, true);
  }, []);

  function updatePrompt(value: string) { onChange({ prompt: value.slice(0, promptLimit) }); }
  function generate() {
    if (!canGenerate) return;
    onGenerate();
  }
  function removeReference(reference: VideoReference) {
    onChange({ ...(reference.id === node.main?.id ? { main: undefined } : { references: node.references.filter(item => item.id !== reference.id) }),
      referenceOrder: references.filter(item => item.id !== reference.id).map(item => item.id) });
  }
  function finishDrag() { sorting.end(); suppressPreviewUntil.current = Date.now() + 200; }
  function thumbnail(reference: VideoReference, onRemove: () => void, index?: number) {
    const reorder = index !== undefined;
    return <div className="video-reference-tile nodrag nopan" key={reference.id} draggable={reorder}
      ref={reorder ? element => sorting.tile(reference.id, element) : undefined}
      style={reorder ? { order: index } : undefined}
      data-dragging={sorting.dragId === reference.id}
      onDragStart={event => {
        if (!reorder) { event.preventDefault(); return; }
        sorting.begin(event, reference);
      }}
      onDragEnd={finishDrag}>
      <button type="button" className="video-reference-preview" aria-label={t.preview + ' ' + reference.name} aria-describedby={reorder ? id + '-reorder' : undefined}
        onClick={() => { if (Date.now() >= suppressPreviewUntil.current) onPreview(reference); }}
        onKeyDown={event => {
          if (!reorder || !event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const items = references.filter(item => item.kind === reference.kind);
          const target = items[items.findIndex(item => item.id === reference.id) + (event.key === 'ArrowLeft' ? -1 : 1)];
          if (target) sorting.move(reference.kind, reference.id, target.id);
        }}>
        {reference.kind === 'video' ? <><video src={reference.url} muted playsInline preload="metadata" draggable={false} /><span className="video-reference-video-mark" aria-hidden="true"><NodeIcon src={referenceVideoIcon} size={12} /></span></> : <ProgressiveImage src={reference.url} alt={reference.name} width={reorder ? 64 : 48} height={reorder ? 64 : 48} />}
      </button>
      {reorder && <span className="video-reference-number" aria-hidden="true">{index + 1}</span>}
      <Button variant="tonal" className="video-reference-remove" title={t.remove} aria-label={t.remove + ' ' + reference.name} onClick={onRemove}><Icon name="close" size={12} /></Button>
    </div>;
  }
  function referenceSection(kind: VideoReference['kind']) {
    const items = references.filter(reference => reference.kind === kind);
    const visualOrder = sorting.order.filter(referenceId => items.some(reference => reference.id === referenceId));
    const addLabel = kind === 'image' ? t.addImage : t.addVideo;
    return <div className="video-reference-section" key={kind}>
      <div className="video-reference-section-label" id={id + '-' + kind}><span>{t[kind]}</span><span className="video-reference-label-divider" aria-hidden="true" /><span>{kind === 'image' ? t.imageCount : t.videoCount}<span className="video-reference-count">{items.length}</span>/{videoReferenceLimits[kind]}</span></div>
      <div ref={element => sorting.row(kind, element)} className="video-workflow-references video-reference-grid" data-reference-sorting={Boolean(sorting.dragId)} aria-labelledby={id + '-' + kind}
        onDragOver={event => sorting.over(event, kind)} onDragLeave={sorting.leave}
        onDrop={event => { sorting.drop(event, kind); suppressPreviewUntil.current = Date.now() + 200; }}>
        {items.map(reference => thumbnail(reference, () => removeReference(reference), visualOrder.indexOf(reference.id)))}
        {items.length < videoReferenceLimits[kind] && <ReferenceSourceMenu className="fusion-reference video-workflow-reference-add nodrag nopan" style={{ order: items.length }} addLabel={addLabel}
          uploadLabel={kind === 'image' ? t.uploadImage : t.uploadVideo} canvasLabel={t.fromCanvas} onChoose={source => onReference(kind, source)}><NodeIcon src={referenceAssets.addReference} size={20} /></ReferenceSourceMenu>}
      </div>
    </div>;
  }

  return <section ref={root} className="fusion-node video-workflow-node" style={videoWorkflowSize(node)} data-mode={node.mode} data-overlay data-node-id={designId} aria-label={title}>
    <header className="fusion-header video-workflow-header"><h2>{title}</h2><div className="fusion-tip"><img src={assets.tip} alt="" draggable={false} /><span>{frames ? t.framesTip : t.longTip}</span></div></header>
    <div className="fusion-content video-workflow-content">
      {frames ? <>
        <div className="fusion-field video-workflow-frame-field">
          <div className="fusion-label">{t.main}<span className="fusion-required">*</span></div>
          {node.main ? <div className="video-frame-upload">{thumbnail({ ...node.main, kind: 'image' }, () => onChange({ main: undefined }))}<span>{t.mainFrame}</span></div>
            : <ReferenceSourceMenu className="video-frame-upload video-frame-upload-empty nodrag nopan" addLabel={t.addMain} uploadLabel={t.uploadImage} canvasLabel={t.fromCanvas} onChoose={onMain}><NodeIcon src={frameAssets.addImage} size={20} /><span>{t.addMain}</span></ReferenceSourceMenu>}
        </div>
        <div className="fusion-field video-workflow-frame-field">
          <div className="fusion-label">{t.endFrame}<Button className="video-reference-info" aria-label={t.endTip} title={t.endTip} data-tooltip-side="right"><NodeIcon src={assets.info} /></Button></div>
          {node.endFrame ? <div className="video-frame-upload">{thumbnail(node.endFrame, () => onChange({ endFrame: undefined }))}<span>{t.endFrame}</span></div>
            : <ReferenceSourceMenu className="video-frame-upload video-frame-upload-empty nodrag nopan" addLabel={t.addEnd} uploadLabel={t.uploadImage} canvasLabel={t.fromCanvas} onChoose={source => onReference('image', source)}><NodeIcon src={frameAssets.addImage} size={20} /><span>{t.addEnd}</span></ReferenceSourceMenu>}
        </div>
      </> : <div className="fusion-field video-workflow-materials">
        <div className="fusion-label">{t.media}<span className="fusion-required">*</span><Button className="video-reference-info" aria-label={t.mediaTip} title={t.mediaTip} data-tooltip-side="right"><NodeIcon src={assets.info} /></Button></div>
        {referenceSection('image')}{referenceSection('video')}
        <span className="sr-only" id={id + '-reorder'}>{t.reorder}</span>
      </div>}
      <div className="fusion-field video-workflow-prompt">
        <div className="video-workflow-prompt-heading"><label className="fusion-label" htmlFor={promptId}>{t.prompt}<span className="fusion-required">*</span></label>{expansionControl}</div>
        <div className="fusion-textarea">
          <textarea id={promptId} value={node.prompt} placeholder={t.placeholder} required maxLength={promptLimit} onChange={event => updatePrompt(event.target.value)} />
          <div className="fusion-textarea-footer">
            <div className="fusion-prompt-actions"><PromptTools value={node.prompt} onChange={updatePrompt} labels={t} maxLength={promptLimit} expandedHeaderAction={expansionControl} inlineIcons={{ expand: <NodeIcon src={assets.promptExpand} />, save: <NodeIcon src={assets.promptSave} />, library: <NodeIcon src={assets.promptLibrary} /> }} /></div>
            <div className="video-prompt-assist">
              <span className="fusion-counter" aria-label={t.count}>{node.prompt.length}/{promptLimit}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="fusion-field video-workflow-settings" data-node-id="I119:11243;2575:3889;165:29865"><span className="fusion-label">{t.settings}</span>
        <div className="fusion-settings">
          <VideoGenerationSettings locale={locale} value={node} onChange={onChange} autoIcon={assets.auto}
            includeModeInSummary summaryIcon={videoSettingsIcon}
            chevron={<NodeIcon src={assets.chevron} className="lc-setting-select-chevron" />} />
        </div>
      </div>
    </div>
    <footer className="fusion-node-action video-workflow-action">
      <GenerateTaskButton label={t.generate} cost="999" costIcon={<NodeIcon src={videoNodeAssetSets.framesEmpty.generateStar} />} className="fusion-generate" disabled={!canGenerate} onClick={generate} />
    </footer>
  </section>;
}

