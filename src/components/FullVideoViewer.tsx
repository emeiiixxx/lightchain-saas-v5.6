import { useEffect, useRef, useState } from 'react';
import { messages, type Locale } from '../i18n';
import type { VideoReference } from '../video-workflow';
import { FullScreenViewer } from './FullScreenViewer';
import { notify } from './Toast';

type Props = {
  video: VideoReference & { width?: number; height?: number; posterUrl?: string };
  locale: Locale;
  phase: 'enter' | 'exit';
  onClose: () => void;
};

export function FullVideoViewer({ video, locale, phase, onClose }: Props) {
  const player = useRef<HTMLVideoElement>(null);
  const [size, setSize] = useState({ width: video.width || 16, height: video.height || 9 });
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const t = messages[locale];
  useEffect(() => {
    const element = player.current;
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); element?.pause(); };
  }, []);
  useEffect(() => { if (phase === 'exit') player.current?.pause(); }, [phase]);
  const close = () => { player.current?.pause(); onClose(); };
  const fit = Math.min(
    Math.max(1, viewport.width - (viewport.width <= 680 ? 32 : 80)) / size.width,
    Math.max(1, viewport.height - 160) / size.height,
  );
  const label = locale === 'zh-CN' ? '视频预览' : locale === 'ja' ? '動画プレビュー' : 'Video preview';
  return <FullScreenViewer label={`${label} · ${video.name}`} closeLabel={t.close} phase={phase} onClose={close} className="full-video-viewer">
    <div className="full-video-stage">
      <video ref={player} src={video.url} poster={video.posterUrl} controls autoPlay playsInline aria-label={video.name}
        style={{ width: size.width * fit, height: size.height * fit }}
        onLoadedMetadata={event => {
          const element = event.currentTarget;
          if (element.videoWidth > 0 && element.videoHeight > 0) setSize({ width: element.videoWidth, height: element.videoHeight });
        }}
        onError={() => notify(locale === 'zh-CN' ? '此视频暂时无法播放，请重新上传。' : locale === 'ja' ? '動画を再生できません。再アップロードしてください。' : 'This video cannot be played. Please upload it again.', 'error')} />
    </div>
  </FullScreenViewer>;
}
