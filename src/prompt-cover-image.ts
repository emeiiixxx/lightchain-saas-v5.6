import { readImage, type CanvasImage } from './canvas';

const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const COVER_MAX_BYTES = 20 * 1024 * 1024;

export const promptCoverMessages = {
  'zh-CN': {
    label: '封面图', optional: '封面图（非必填）', formats: '支持 JPG、PNG、WebP、SVG，单张图片不超过 20 MB',
    upload: '上传封面图', uploadImage: '上传图片', replace: '替换封面图', remove: '移除封面图', reading: '正在读取封面图',
    error: '封面图上传失败，请使用 20 MB 以内的 JPG、PNG、WebP 或 SVG 图片', limit: '封面图最多支持 1 张，请选择单张图片。',
  },
  en: {
    label: 'Cover image', optional: 'Cover image (optional)', formats: 'JPG, PNG, WebP or SVG · Up to 20 MB per image',
    upload: 'Upload cover image', uploadImage: 'Upload image', replace: 'Replace cover image', remove: 'Remove cover image', reading: 'Reading cover image',
    error: 'Could not upload the cover. Use a JPG, PNG, WebP or SVG image up to 20 MB.', limit: 'Choose one cover image.',
  },
  ja: {
    label: 'カバー画像', optional: 'カバー画像（任意）', formats: 'JPG・PNG・WebP・SVG、1 枚あたり 20 MB まで',
    upload: 'カバー画像をアップロード', uploadImage: '画像をアップロード', replace: 'カバー画像を変更', remove: 'カバー画像を削除', reading: 'カバー画像を読み込み中',
    error: 'カバー画像を読み込めませんでした。20 MB 以下の JPG・PNG・WebP・SVG 画像を選択してください。', limit: 'カバー画像は 1 枚選択してください。',
  },
};

// SVG support belongs to the prompt cover picker; ordinary canvas uploads keep
// their existing raster-only contract.
export async function readPromptCoverImage(file: File): Promise<Omit<CanvasImage, 'x' | 'y'>> {
  if (file.type !== 'image/svg+xml') return readImage(file);
  if (file.size > COVER_MAX_BYTES) throw new Error('invalid_image');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('invalid_image');
    const width = Math.min(360, image.naturalWidth);
    return { id: crypto.randomUUID(), name: file.name, url, width, height: width * image.naturalHeight / image.naturalWidth };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function readPromptCoverDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('cover_fetch_failed');
  const blob = await response.blob();
  const type = blob.type.split(';')[0].toLowerCase();
  if (!COVER_TYPES.includes(type) || blob.size > COVER_MAX_BYTES) throw new Error('invalid_image');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('invalid_image'));
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(new Error('aborted'));
    reader.readAsDataURL(blob.type === type ? blob : blob.slice(0, blob.size, type));
  });
}
