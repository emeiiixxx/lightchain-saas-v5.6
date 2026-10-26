import type { VideoReference } from './video-workflow';

export type UploadedVideo = VideoReference & {
  kind: 'video';
  width: number;
  height: number;
  duration: number;
  posterUrl: string;
};

export const videoReferenceUploadMessages = {
  'zh-CN': {
    hint: '点击 / 拖放图片或视频到此处；图片支持 PNG、JPG、WebP，每张不超过 20 MB',
    drop: '将图片或视频拖放到这里',
    limit: '每次请选择一张图片或一个视频。',
    batchLimit: '单次最多选择 {count} 个素材。',
    error: '素材读取失败。请选择 PNG、JPG、WebP 图片（每张不超过 20 MB），或当前浏览器可播放的视频。',
  },
  en: {
    hint: 'Click or drop an image or video here. PNG, JPG or WebP images: up to 20 MB each.',
    drop: 'Drop an image or video here',
    limit: 'Choose one image or video at a time.',
    batchLimit: 'Choose up to {count} assets at a time.',
    error: 'Unable to read this file. Choose a PNG, JPG or WebP image up to 20 MB, or a video this browser can play.',
  },
  ja: {
    hint: 'クリック、または画像・動画をドロップ。画像は PNG・JPG・WebP、1 枚あたり 20 MB まで。',
    drop: 'ここに画像または動画をドロップ',
    limit: '画像または動画を 1 つ選択してください。',
    batchLimit: '一度に選択できる素材は {count} 個までです。',
    error: '素材を読み込めません。20 MB 以下の PNG・JPG・WebP 画像、またはこのブラウザーで再生できる動画を選択してください。',
  },
};

// Ownership of the returned URL passes to the caller. Failures and cancellation
// release it here; the temporary video element never remains attached or playing.
export async function readVideoReference(file: File, signal: AbortSignal): Promise<UploadedVideo> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!file.type.startsWith('video/')) throw new Error('invalid_video');
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        video.removeEventListener('loadedmetadata', metadata);
        video.removeEventListener('loadeddata', ready);
        video.removeEventListener('error', failed);
        signal.removeEventListener('abort', aborted);
        if (error) reject(error); else resolve();
      };
      const validMetadata = () => video.videoWidth > 0 && video.videoHeight > 0 && Number.isFinite(video.duration) && video.duration > 0;
      const metadata = () => {
        if (!validMetadata()) finish(new Error('invalid_video'));
        else if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) finish();
      };
      const ready = () => finish(validMetadata() ? undefined : new Error('invalid_video'));
      const failed = () => finish(new Error('unplayable_video'));
      const aborted = () => finish(new DOMException('Aborted', 'AbortError'));
      video.addEventListener('loadedmetadata', metadata);
      video.addEventListener('loadeddata', ready);
      video.addEventListener('error', failed);
      signal.addEventListener('abort', aborted, { once: true });
      try { video.src = url; video.load(); }
      catch (error) { finish(error instanceof Error ? error : new Error('invalid_video')); }
    });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const poster = document.createElement('canvas');
    poster.width = video.videoWidth;
    poster.height = video.videoHeight;
    const context = poster.getContext('2d');
    if (!context) throw new Error('video_poster_unavailable');
    context.drawImage(video, 0, 0, poster.width, poster.height);
    const posterUrl = poster.toDataURL('image/jpeg', .92);
    if (posterUrl === 'data:,') throw new Error('video_poster_unavailable');
    return { id: crypto.randomUUID(), name: file.name, url, kind: 'video', width: video.videoWidth, height: video.videoHeight, duration: video.duration, posterUrl };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}
