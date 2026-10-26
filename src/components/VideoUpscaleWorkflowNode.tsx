import { useId, type CSSProperties, type KeyboardEvent } from 'react';
import type { Locale } from '../i18n';
import type { UploadedVideo } from '../video-reference-upload';
import { videoNodeAssetSets } from '../video-node-assets';
import { canGenerateVideoUpscaleWorkflow, videoUpscaleResolutions, videoUpscaleWorkflowSize, videoUpscaleWorkflowTitle, type VideoUpscaleWorkflow } from '../video-upscale-workflow';
import { Button, Icon } from './ui';
import { ChoiceChip } from './ChoiceChip';
import { GenerateTaskButton } from './GenerateTaskButton';
import { ProgressiveImage } from './ProgressiveImage';
import { VideoIcon } from './VideoIcon';
import '../video-upscale-workflow.css';

const copy = {
  'zh-CN': { tip: '功能介绍描述', video: '视频素材', add: '上传视频', preview: '播放', remove: '删除', resolution: '清晰度配置', generate: '开始 AI 生成' },
  en: { tip: 'Feature description', video: 'Video asset', add: 'Upload video', preview: 'Play', remove: 'Delete', resolution: 'Resolution', generate: 'Start AI generation' },
  ja: { tip: '機能の説明', video: '動画素材', add: '動画をアップロード', preview: '再生', remove: '削除', resolution: '解像度設定', generate: 'AI 生成を開始' },
};

const uploadIcon = `${import.meta.env.BASE_URL}assets/video-upscale/add.svg`;

type Props = {
  node: VideoUpscaleWorkflow;
  locale: Locale;
  onChange: (patch: Partial<VideoUpscaleWorkflow>) => void;
  onUpload: () => void;
  onPreview: (video: UploadedVideo) => void;
  onGenerate: () => void;
};

function navigateResolutions(event: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  const index = buttons.indexOf(event.target as HTMLButtonElement);
  if (index < 0 || !buttons.length) return;
  event.preventDefault();
  event.stopPropagation();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
    : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
  buttons[next].focus();
  buttons[next].click();
}

export function VideoUpscaleWorkflowNode({ node, locale, onChange, onUpload, onPreview, onGenerate }: Props) {
  const t = copy[locale];
  const id = useId();
  const title = videoUpscaleWorkflowTitle(locale);
  const assets = videoNodeAssetSets.framesEmpty;
  const canGenerate = canGenerateVideoUpscaleWorkflow(node);

  return <section className="fusion-node video-upscale-workflow-node" lang={locale} style={videoUpscaleWorkflowSize()}
    data-overlay data-source-image={node.id} data-node-id="175:33379" aria-label={title}>
    <header className="fusion-header video-upscale-workflow-header">
      <h2>{title}</h2>
      <div className="fusion-tip"><img src={assets.tip} alt="" width={20} height={20} /><span>{t.tip}</span></div>
    </header>
    <div className="fusion-content video-upscale-workflow-content">
      <div className="fusion-field video-upscale-source-field">
        <div className="fusion-label" id={`${id}-video`}>{t.video}<span className="fusion-required">*</span></div>
        <div className="video-upscale-source" aria-labelledby={`${id}-video`}>
          {node.video ? <>
            <button type="button" className="video-upscale-preview nodrag nopan" aria-label={`${t.preview} ${node.video.name}`}
              onClick={() => { if (node.video) onPreview(node.video); }}>
              <ProgressiveImage src={node.video.posterUrl} alt={node.video.name} width={node.video.width} height={node.video.height} fit="contain" />
              <span className="video-upscale-play" aria-hidden="true"><VideoIcon name="playVideo" size={24} /></span>
            </button>
            <Button variant="tonal" className="video-upscale-remove nodrag nopan" title={t.remove} aria-label={`${t.remove} ${node.video.name}`}
              onClick={() => onChange({ video: undefined })}><Icon name="close" size={12} /></Button>
          </> : <button type="button" className="video-upscale-empty nodrag nopan" onClick={onUpload}>
            <span className="icon video-upscale-upload-icon" aria-hidden="true" style={{ width: 24, height: 24, '--icon-url': `url("${uploadIcon}")` } as CSSProperties} /><span>{t.add}</span>
          </button>}
        </div>
      </div>
      <div className="fusion-field video-upscale-resolution-field">
        <div className="fusion-label" id={`${id}-resolution`}>{t.resolution}<span className="fusion-required">*</span></div>
        <div className="video-upscale-resolutions" role="group" aria-labelledby={`${id}-resolution`} onKeyDown={navigateResolutions}>
          {videoUpscaleResolutions.map(resolution => <ChoiceChip key={resolution} selected={node.resolution === resolution}
            onClick={() => onChange({ resolution })}>{resolution}</ChoiceChip>)}
        </div>
      </div>
    </div>
    <footer className="fusion-node-action video-upscale-workflow-action">
      <GenerateTaskButton className="nodrag nopan" label={t.generate} cost="20" disabled={!canGenerate} onClick={() => { if (canGenerate) onGenerate(); }}
        costIcon={<span className="icon" aria-hidden="true" style={{ width: 16, height: 16, '--icon-url': `url("${assets.generateStar}")` } as CSSProperties} />} />
    </footer>
  </section>;
}
