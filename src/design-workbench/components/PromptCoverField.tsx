import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from '../LocaleContext';
import type { Notify } from '../notification';
import { usePresence } from '../usePresence';
import type { LibraryImage } from '../asset-library';
import type { CanvasImage } from '../useCanvas';
import { AssetPicker } from './AssetPicker';
import { Icon, IconButton } from './ui';

export function PromptCoverField({ value, uploads, onUpload, onChange, onBusy, onNotify }: {
  value?: string; uploads: LibraryImage[]; onUpload: (image: LibraryImage) => void;
  onChange: (url?: string) => void; onBusy: (busy: boolean) => void;
  onNotify: Notify;
}) {
  const { t, locale } = useLocale();
  const request = useRef(0);
  const emptyButton = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const picker = usePresence(pickerOpen ? true : null);
  const busyCallback = useRef(onBusy); busyCallback.current = onBusy;
  useEffect(() => () => { request.current++; busyCallback.current(false); }, []);
  const closePicker = () => { request.current++; setBusy(false); onBusy(false); setPickerOpen(false); };

  const selectCover = async (image: Omit<CanvasImage, 'x' | 'y'>) => {
    const id = ++request.current;
    setBusy(true); onBusy(true);
    try {
      const response = await fetch(image.url);
      if (!response.ok) throw new Error('cover_fetch_failed');
      const blob = await response.blob();
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('invalid_image'));
        reader.onerror = () => reject(reader.error);
        reader.onabort = () => reject(new Error('aborted'));
        reader.readAsDataURL(blob);
      });
      if (request.current === id) { onChange(url); setPickerOpen(false); }
    } catch {
      if (request.current === id) onNotify('封面图上传失败，请使用20 MB以内的JPG、PNG、WebP或SVG图片', 'error');
    } finally {
      if (request.current === id) { setBusy(false); onBusy(false); }
    }
  };

  return <>
    <section className="prompt-cover-field" aria-label={t('封面图（非必填）')}>
      <div className="prompt-cover-label"><h3>{t('封面图')}</h3><p>{t('支持 JPG、PNG、WebP、SVG，单张图片不超过 20 MB')}</p></div>
      <div className="prompt-cover-upload">
        {value ? <div className="prompt-cover-preview" data-has-cover="true" aria-busy={busy}>
          <img src={value} alt={t('封面图')} />
          <div className="prompt-cover-actions">
            <IconButton size="m" icon="prompt-cover-replace" aria-label={t('替换封面图')} disabled={busy} onClick={() => setPickerOpen(true)}/>
            <IconButton size="m" icon="library-promptTrash" aria-label={t('移除封面图')} disabled={busy} onClick={() => { onChange(undefined); requestAnimationFrame(() => emptyButton.current?.focus()); }}/>
          </div>
        </div> : <button ref={emptyButton} type="button" className="prompt-cover-preview" aria-label={t('上传封面图')} disabled={busy} onClick={() => setPickerOpen(true)}>
          <Icon name="prompt-cover-add-image" size={24}/><span>{t('上传图片')}</span>
        </button>}
        {busy && <p className="prompt-cover-status" role="status">{t('正在读取封面图')}</p>}
      </div>
    </section>
    {picker.value && createPortal(<AssetPicker locale={locale} phase={picker.phase} uploads={uploads} onUpload={onUpload} onConfirm={image => { void selectCover(image); }} onClose={closePicker} />, document.body)}
  </>;
}
