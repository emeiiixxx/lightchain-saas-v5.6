import { ProgressiveImage } from './ProgressiveImage';
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Divider, Icon } from './ui';
import { demoAssets, multiDemoAssets, prepareMainImage, type LibraryImage } from '../asset-library';
import { readImage, type CanvasImage } from '../canvas';
import { messages, type Locale } from '../i18n';
import { promptCoverMessages, readPromptCoverImage } from '../prompt-cover-image';
import { readVideoReference, videoReferenceUploadMessages, type UploadedVideo } from '../video-reference-upload';
import { prepareVideoCanvasMedia, type VideoCanvasMedia } from '../video-canvas-media';

const sources = ['historyUploads', 'generationHistory', 'personalAssets', 'teamAssets', 'platformAssets'] as const;
type PickerAsset = LibraryImage | UploadedVideo;
function isVideoAsset(asset: PickerAsset): asset is UploadedVideo { return 'kind' in asset && asset.kind === 'video'; }
const videoOnlyMessages = {
  'zh-CN': { hint: '点击 / 拖放视频到此处', drop: '将视频拖放到这里', limit: '每次请选择一个视频。', error: '视频读取失败，请选择当前浏览器可播放的视频。' },
  en: { hint: 'Click or drop a video here', drop: 'Drop a video here', limit: 'Choose one video at a time.', error: 'Unable to read this video. Choose a video this browser can play.' },
  ja: { hint: 'クリック、または動画をドロップ', drop: 'ここに動画をドロップ', limit: '動画を 1 つ選択してください。', error: '動画を読み込めません。このブラウザーで再生できる動画を選択してください。' },
};
type Props = {
  allowSvg?: boolean;
  mediaKind?: 'image' | 'video';
  maxCount?: number;
  excludedUrls?: string[];
  limitMessage?: string;
  locale: Locale;
  phase: 'enter' | 'exit';
  uploads: LibraryImage[];
  videoUploads?: UploadedVideo[];
  onUpload: (image: LibraryImage) => void;
  onVideoUpload?: (video: UploadedVideo) => void;
  onConfirm: (image: Omit<CanvasImage, 'x' | 'y'>) => void;
  onConfirmVideo?: (video: UploadedVideo) => void;
  onConfirmBatch?: (images: Omit<CanvasImage, 'x' | 'y'>[]) => void;
  onConfirmMediaBatch?: (media: Omit<VideoCanvasMedia, 'x' | 'y'>[]) => void;
  onClose: () => void;
};

export function AssetPicker({ locale, phase, uploads, videoUploads = [], onUpload, onVideoUpload, onConfirm, onConfirmVideo, onConfirmBatch, onConfirmMediaBatch, onClose, maxCount = 20, excludedUrls = [], limitMessage, allowSvg = false, mediaKind }: Props) {
  const t = messages[locale];
  const multiple = !!onConfirmBatch || !!onConfirmMediaBatch;
  const allowVideo = mediaKind !== 'image' && (!!onConfirmMediaBatch || (!!onConfirmVideo && !multiple));
  const videoOnly = mediaKind === 'video';
  const videoText = videoReferenceUploadMessages[locale];
  const uploadText = videoOnly ? videoOnlyMessages[locale] : videoText;
  const [chosen, setChosen] = useState<PickerAsset[]>([]);
  const [localVideos, setLocalVideos] = useState<UploadedVideo[]>([]);
  const [source, setSource] = useState<(typeof sources)[number]>('historyUploads');
  const [query, setQuery] = useState('');
  const [usingId, setUsingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'limit' | 'read' | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const locked = useRef(false);
  const active = useRef(true);
  const pendingVideoRead = useRef<AbortController | null>(null);
  const unclaimedVideos = useRef(new Map<string, UploadedVideo>());
  useEffect(() => {
    active.current = phase === 'enter';
    return () => {
      active.current = false; request.current++; pendingVideoRead.current?.abort();
      unclaimedVideos.current.forEach(video => URL.revokeObjectURL(video.url));
      unclaimedVideos.current.clear();
    };
  }, [phase]);
  const historyAssets: PickerAsset[] = [...(videoOnly ? [] : uploads), ...(allowVideo ? [...videoUploads, ...localVideos] : []), ...(videoOnly ? [] : multiple ? multiDemoAssets : demoAssets)];
  const candidates = source === 'historyUploads' ? [...new Map(historyAssets.map(asset => [asset.url, asset])).values()] : [];
  const visible = candidates.filter(asset => !excludedUrls.includes(asset.url)).filter(asset => asset.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  function close() {
    active.current = false; request.current++; pendingVideoRead.current?.abort(); onClose();
  }

  async function upload(files: FileList | File[]) {
    if (!active.current || locked.current || !files.length) return;
    if (multiple ? files.length + chosen.length > maxCount : files.length !== 1) { setError('limit'); return; }
    if (mediaKind && Array.from(files).some(file => videoOnly
      ? !allowVideo || !file.type.startsWith('video/')
      : !['image/png', 'image/jpeg', 'image/webp', ...(allowSvg ? ['image/svg+xml'] : [])].includes(file.type))) {
      setError('read'); return;
    }
    const id = ++request.current;
    locked.current = true; setBusy(true); setError(null);
    try {
      if (!multiple && allowVideo && onConfirmVideo && files[0].type.startsWith('video/')) {
        const controller = new AbortController();
        pendingVideoRead.current = controller;
        let video: UploadedVideo | undefined;
        try {
          video = await readVideoReference(files[0], controller.signal);
          if (!active.current || id !== request.current || controller.signal.aborted) return;
          onConfirmVideo(video);
          video = undefined;
        } finally {
          if (video) URL.revokeObjectURL(video.url);
          if (pendingVideoRead.current === controller) pendingVideoRead.current = null;
        }
        return;
      }
      const controller = new AbortController();
      pendingVideoRead.current = controller;
      const results = await Promise.allSettled(Array.from(files).map(file => allowVideo && file.type.startsWith('video/') ? readVideoReference(file, controller.signal) : (allowSvg ? readPromptCoverImage : readImage)(file)));
      if (pendingVideoRead.current === controller) pendingVideoRead.current = null;
      const loaded: PickerAsset[] = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
      if (!active.current || id !== request.current) { loaded.forEach(asset => URL.revokeObjectURL(asset.url)); return; }
      loaded.forEach(asset => {
        if (!isVideoAsset(asset)) onUpload(asset);
        else if (onVideoUpload) onVideoUpload(asset);
        else { unclaimedVideos.current.set(asset.url, asset); setLocalVideos(previous => [...previous, asset]); }
      });
      if (!multiple && loaded[0]) {
        const image = await prepareMainImage(loaded[0]);
        if (active.current && id === request.current) onConfirm(image);
        return;
      }
      if (multiple) setChosen(previous => [...previous, ...loaded]);
      if (results.some(result => result.status === 'rejected')) setError('read');
      setSource('historyUploads'); setQuery('');
    } catch (error) {
      if (active.current && id === request.current && !(error instanceof DOMException && error.name === 'AbortError')) setError('read');
    }
    finally { if (active.current && id === request.current) { locked.current = false; setBusy(false); } }
  }

  async function useAsset(asset: PickerAsset) {
    if (locked.current || !active.current) return;
    if ((videoOnly && !isVideoAsset(asset)) || (mediaKind === 'image' && isVideoAsset(asset))) return;
    const id = ++request.current;
    locked.current = true; setBusy(true); setError(null);
    try {
      setUsingId(asset.id);
      if (isVideoAsset(asset)) {
        if (onConfirmVideo) { unclaimedVideos.current.delete(asset.url); onConfirmVideo(asset); }
        return;
      }
      const image = await prepareMainImage(asset);
      if (active.current && id === request.current) onConfirm(image);
    } catch { if (active.current && id === request.current) setError('read'); }
    finally { if (active.current && id === request.current) { locked.current = false; setBusy(false); } }
  }

  function toggleAsset(asset: PickerAsset) {
    if (locked.current || !active.current) return;
    if ((videoOnly && !isVideoAsset(asset)) || (mediaKind === 'image' && isVideoAsset(asset))) return;
    if (chosen.some(item => item.id === asset.id)) {
      setChosen(previous => previous.filter(item => item.id !== asset.id)); setError(null);
    } else if (chosen.length >= maxCount) setError('limit');
    else { setChosen(previous => [...previous, asset]); setError(null); }
  }

  async function confirmBatch() {
    if ((!onConfirmBatch && !onConfirmMediaBatch) || !chosen.length || chosen.length > maxCount || locked.current || !active.current) return;
    const id = ++request.current;
    locked.current = true; setBusy(true); setError(null);
    try {
      const prepared = await Promise.all(chosen.map(asset => isVideoAsset(asset) ? prepareVideoCanvasMedia(asset) : prepareMainImage(asset)));
      if (active.current && id === request.current) {
        chosen.forEach(asset => { if (isVideoAsset(asset)) unclaimedVideos.current.delete(asset.url); });
        if (onConfirmMediaBatch) onConfirmMediaBatch(prepared);
        else onConfirmBatch?.(prepared);
      }
    } catch { if (active.current && id === request.current) setError('read'); }
    finally { if (active.current && id === request.current) { locked.current = false; setBusy(false); } }
  }

  return <Dialog title={t.chooseAssets} closeLabel={t.close} onClose={close} phase={phase} className="asset-picker">
    <div className="asset-filters" data-node-id={multiple ? "17:1864" : "50:24167"}>
      <div className="asset-tabs" role="tablist" aria-label={t.assetSources}>
        {sources.map((item, index) => <button type="button" key={item} role="tab" id={`asset-tab-${item}`} aria-controls="asset-grid" aria-selected={source === item} tabIndex={source === item ? 0 : -1}
          onClick={() => setSource(item)} onKeyDown={event => {
            const next = event.key === 'ArrowRight' ? (index + 1) % sources.length : event.key === 'ArrowLeft' ? (index + sources.length - 1) % sources.length : event.key === 'Home' ? 0 : event.key === 'End' ? sources.length - 1 : -1;
            if (next >= 0) { event.preventDefault(); setSource(sources[next]); document.getElementById(`asset-tab-${sources[next]}`)?.focus(); }
          }}>{t[item]}</button>)}
      </div>
      <label className="asset-search"><Icon name="search" size={20} /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t.searchAssets} aria-label={t.searchAssets} /></label>
    </div>
    <Divider />
    <div className="asset-grid" id="asset-grid" role="tabpanel" aria-labelledby={`asset-tab-${source}`} data-node-id={multiple ? "17:1938" : "50:24177"} aria-busy={busy}>
      {source === 'historyUploads' && !query.trim() && <button type="button" className={`asset-upload ${dragOver ? 'is-over' : ''}`} disabled={busy} aria-label={t.localUpload} onClick={() => input.current?.click()}
        onDragOver={event => { event.preventDefault(); if (event.dataTransfer.types.includes('Files')) setDragOver(true); }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false); }}
        onDrop={event => { event.preventDefault(); event.stopPropagation(); setDragOver(false); void upload(event.dataTransfer.files); }}>
        <Icon name="upload" size={32} /><span className="asset-upload-title">{busy ? t.reading : dragOver ? (allowVideo ? uploadText.drop : t.dropImagesHere) : t.localUpload}</span><span className="asset-upload-hint">{dragOver && !busy ? t.releaseToUpload : allowVideo ? uploadText.hint : allowSvg ? promptCoverMessages[locale].formats : t.localUploadHint}</span>
      </button>}
      {visible.map(asset => multiple ? <button type="button" key={asset.id} className="asset-card asset-card--multiple" aria-label={asset.name} aria-pressed={chosen.some(item => item.id === asset.id)} disabled={busy} onClick={() => toggleAsset(asset)}>
        <ProgressiveImage src={isVideoAsset(asset) ? asset.posterUrl : asset.url} alt="" />
        {isVideoAsset(asset) && <span className="asset-video-marker" aria-hidden="true"><Icon name="historyVideo" size={16} /></span>}
        <span className="asset-checkbox" aria-hidden="true"><Icon name="selectionCheck" size={24} /></span>
      </button> : <div key={asset.id} className="asset-card" onClick={() => void useAsset(asset)}>
        <ProgressiveImage src={isVideoAsset(asset) ? asset.posterUrl : asset.url} alt={asset.name} />
        {isVideoAsset(asset) && <span className="asset-video-marker" aria-hidden="true"><Icon name="historyVideo" size={16} /></span>}
        <span className="asset-card-scrim" aria-hidden="true" />
        <div className="asset-card-actions">
          <Button variant="primary" size="m" disabled={busy} aria-label={`${t.useAsset} · ${asset.name}`}>
            {busy && usingId === asset.id ? t.reading : t.useAsset}
          </Button>
        </div>
      </div>)}
      {!visible.length && (source !== 'historyUploads' || query.trim()) && <div className="asset-empty">{query.trim() ? t.noSearchResults : t.noAssets}</div>}
    </div>
    <input ref={input} type="file" hidden multiple={multiple} accept={videoOnly ? 'video/*' : allowVideo ? 'image/png,image/jpeg,image/webp,video/*' : allowSvg ? 'image/png,image/jpeg,image/webp,image/svg+xml' : 'image/png,image/jpeg,image/webp'} onChange={event => { if (event.target.files) void upload(event.target.files); event.target.value = ''; }} />
    {error && <p className="asset-error error-message" role="alert">{error === 'limit' ? (multiple ? (limitMessage || (allowVideo ? videoText.batchLimit.replace('{count}', String(maxCount)) : t.batchImageLimit)) : allowVideo ? uploadText.limit : allowSvg ? promptCoverMessages[locale].limit : t.mainImageLimit) : allowVideo ? uploadText.error : allowSvg ? promptCoverMessages[locale].error : t.uploadError}</p>}
    {multiple && <footer className="asset-footer" data-node-id="17:1865">
      <div className="asset-counter" role="status"><span>{t.selectedCount}</span><strong>{chosen.length} / {maxCount}</strong></div>
      <Button variant="secondary" size="m" onClick={close}>{t.cancel}</Button>
      <Button variant="primary" size="m" disabled={!chosen.length || busy} onClick={() => void confirmBatch()}>{busy ? t.reading : t.confirm}</Button>
    </footer>}
  </Dialog>;
}
