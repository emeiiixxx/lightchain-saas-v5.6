import { useId, type CSSProperties } from 'react';
import { messages, type Locale } from '../i18n';
import type { DownloadFormat } from '../download-image';
import { DownloadFormatMenu } from './DownloadFormatMenu';
import { MediaToolbar } from './SelectionToolbar';
import { ToolbarHoverMenu } from './ToolbarHoverMenu';
import { Button, Divider } from './ui';

const copy = {
  'zh-CN': { material: '素材生成', video: '视频生成', quickEdit: '快捷生图', multiView: '多视角', storyboardImage: '分镜图', gridSplit: '宫格图切分', fashionVideo: '服装短视频', multiReference: '专业服装视频', storyboard: '分镜成片', videoRemake: '视频复刻', upscale: '高清放大' },
  en: { material: 'Generate assets', video: 'Generate video', quickEdit: 'Quick image', multiView: 'Multiple views', storyboardImage: 'Storyboard image', gridSplit: 'Split grid image', fashionVideo: 'Fashion video', multiReference: 'Pro fashion video', storyboard: 'Storyboard video', videoRemake: 'Video remake', upscale: 'Upscale' },
  ja: { material: '素材生成', video: '動画生成', quickEdit: 'クイック画像生成', multiView: 'マルチビュー', storyboardImage: '絵コンテ', gridSplit: 'グリッド画像分割', fashionVideo: 'ファッション動画', multiReference: 'プロ向けファッション動画', storyboard: '絵コンテから動画', videoRemake: '動画再現', upscale: '高解像度化' },
};

type ToolbarIconName = 'material' | 'video' | 'chevron' | 'remake' | 'cutout' | 'upscale' | 'save-asset' | 'download' | 'send' | 'quick-edit' | 'multi-view' | 'storyboard-image' | 'grid-split' | 'fashion-video' | 'multi-reference' | 'storyboard-video';
function ToolbarIcon({ name }: { name: ToolbarIconName }) {
  const size = name === 'upscale' ? 16 : 20;
  return <span aria-hidden="true" className="icon" style={{ width: size, height: size, '--icon-url': `url("${import.meta.env.BASE_URL}assets/video-image-toolbar-20261023/${name}.svg")` } as CSSProperties} />;
}

export type VideoSelectionAction = 'cutout' | 'fashionVideo' | 'multiReference' | 'storyboard' | 'quickEdit' | 'multiView' | 'storyboardImage' | 'gridSplit' | 'videoRemake' | 'upscale' | 'saveAsset' | 'sendImage';
type Props = { locale: Locale; onAction: (action: VideoSelectionAction) => void; onDownload: (format: DownloadFormat) => void; downloading?: boolean };

export function VideoSelectionToolbar({ locale, onAction, onDownload, downloading }: Props) {
  const t = messages[locale], v = copy[locale];
  const group = useId();
  return <MediaToolbar label={t.selectionTools} nodeId="113:8879" className="media-toolbar--video media-toolbar--video-image">
    <div className="video-image-toolbar-group">
      <ToolbarHoverMenu label={v.material} icon={<ToolbarIcon name="quick-edit" />} chevron={<ToolbarIcon name="chevron" />} group={group} nodeId="113:9464" items={[
        { label: v.quickEdit, icon: <ToolbarIcon name="material" />, onSelect: () => onAction('quickEdit') },
        { label: v.multiView, icon: <ToolbarIcon name="multi-view" />, onSelect: () => onAction('multiView') },
        { label: v.storyboardImage, icon: <ToolbarIcon name="storyboard-image" />, onSelect: () => onAction('storyboardImage') },
        { label: v.gridSplit, icon: <ToolbarIcon name="grid-split" />, onSelect: () => onAction('gridSplit') },
      ]} />
      <ToolbarHoverMenu label={v.video} icon={<ToolbarIcon name="video" />} chevron={<ToolbarIcon name="chevron" />} group={group} nodeId="113:9502" items={[
        { label: v.fashionVideo, icon: <ToolbarIcon name="fashion-video" />, onSelect: () => onAction('fashionVideo') },
        { label: v.multiReference, icon: <ToolbarIcon name="multi-reference" />, onSelect: () => onAction('multiReference') },
        { label: v.storyboard, icon: <ToolbarIcon name="storyboard-video" />, onSelect: () => onAction('storyboard') },
        { label: v.videoRemake, icon: <ToolbarIcon name="remake" />, onSelect: () => onAction('videoRemake') },
      ]} />
      <Divider vertical />
    </div>
    <div className="video-image-toolbar-group">
      <Button onClick={() => onAction('cutout')}><ToolbarIcon name="cutout" />{t.cutout}</Button>
      <Button onClick={() => onAction('upscale')}><ToolbarIcon name="upscale" />{v.upscale}</Button>
      <Divider vertical />
    </div>
    <div className="video-image-toolbar-group">
      <Button className="canvas-icon-button" aria-label={t.saveAsset} title={t.saveAsset} onClick={() => onAction('saveAsset')}><ToolbarIcon name="save-asset" /></Button>
      <DownloadFormatMenu locale={locale} disabled={downloading} onSelect={onDownload} icon={<ToolbarIcon name="download" />} menuGroup={group} />
      <Button className="canvas-icon-button" aria-label={t.sendImage} title={t.sendImage} onClick={() => onAction('sendImage')}><ToolbarIcon name="send" /></Button>
    </div>
  </MediaToolbar>;
}
