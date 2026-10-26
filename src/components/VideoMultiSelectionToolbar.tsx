import type { CSSProperties } from 'react';
import { messages, type Locale } from '../i18n';
import type { VideoMultiSelection } from '../video-multi-selection';
import { MediaToolbar } from './SelectionToolbar';
import { Button, Divider } from './ui';

const copy = {
  'zh-CN': { quick: '快捷生图', storyboard: '分镜图', professional: '专业服装视频' },
  en: { quick: 'Quick image', storyboard: 'Storyboard image', professional: 'Pro fashion video' },
  ja: { quick: 'クイック画像生成', storyboard: '絵コンテ', professional: 'プロ向けファッション動画' },
};
export type VideoMultiAction = 'quick' | 'storyboard' | 'professional';
function MultiIcon({ name }: { name: VideoMultiAction | 'download' }) {
  return <span className="icon" aria-hidden="true" style={{ width: 20, height: 20,
    '--icon-url': `url("${import.meta.env.BASE_URL}assets/video-multi-toolbar/${name}.svg")` } as CSSProperties} />;
}

export function VideoMultiSelectionToolbar({ locale, selection, downloading, onAction, onDownload }: {
  locale: Locale; selection: VideoMultiSelection; downloading: boolean;
  onAction: (action: VideoMultiAction) => void; onDownload: () => void;
}) {
  const t = copy[locale];
  return <MediaToolbar label={messages[locale].selectionTools} className="media-toolbar--video media-toolbar--video-multi"
    nodeId={selection.showImageActions ? '173:30452' : selection.showVideoAction ? '173:32567' : '173:32960'}>
    {selection.showImageActions && <div className="video-multi-toolbar-group">
      <Button onClick={() => onAction('quick')}><MultiIcon name="quick" />{t.quick}</Button>
      <Button onClick={() => onAction('storyboard')}><MultiIcon name="storyboard" />{t.storyboard}</Button>
      <Divider vertical />
    </div>}
    {selection.showVideoAction && <div className="video-multi-toolbar-group">
      <Button onClick={() => onAction('professional')}><MultiIcon name="professional" />{t.professional}</Button>
      <Divider vertical />
    </div>}
    <Button className="canvas-icon-button" aria-label={messages[locale].download} title={messages[locale].download}
      disabled={downloading} onClick={onDownload}><MultiIcon name="download" /></Button>
  </MediaToolbar>;
}
