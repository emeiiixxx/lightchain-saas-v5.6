import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LibraryImage } from '../asset-library';
import type { CanvasImage } from '../canvas';
import type { Locale } from '../i18n';
import { promptCoverMessages, readPromptCoverDataUrl } from '../prompt-cover-image';
import { usePresence } from '../usePresence';
import { AssetPicker } from './AssetPicker';
import { notify } from './Toast';
import { Button, Icon } from './ui';

export function PromptCoverField({ value, uploads, onUpload, onChange, onBusy, locale = 'zh-CN' }: {
  value?: string;
  uploads: LibraryImage[];
  onUpload: (image: LibraryImage) => void;
  onChange: (url?: string) => void;
  onBusy: (busy: boolean) => void;
  locale?: Locale;
}) {
  const t = promptCoverMessages[locale];
  const request = useRef(0);
  const emptyButton = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const picker = usePresence(pickerOpen ? true : null);
  const busyCallback = useRef(onBusy);
  busyCallback.current = onBusy;
  useEffect(() => () => { request.current++; busyCallback.current(false); }, []);

  const closePicker = () => {
    request.current++;
    setBusy(false);
    onBusy(false);
    setPickerOpen(false);
  };
  const selectCover = async (image: Omit<CanvasImage, 'x' | 'y'>) => {
    const id = ++request.current;
    setBusy(true);
    onBusy(true);
    try {
      const url = await readPromptCoverDataUrl(image.url);
      if (request.current === id) { onChange(url); setPickerOpen(false); }
    } catch {
      if (request.current === id) notify(t.error, 'error');
    } finally {
      if (request.current === id) { setBusy(false); onBusy(false); }
    }
  };

  return <>
    <section className="prompt-cover-field" aria-label={t.optional}>
      <div className="prompt-cover-label"><h3>{t.label}</h3><p>{t.formats}</p></div>
      <div className="prompt-cover-upload">
        {value ? <div className="prompt-cover-preview" data-has-cover="true" aria-busy={busy}>
          <img src={value} alt={t.label} />
          <div className="prompt-cover-actions">
            <Button size="m" aria-label={t.replace} disabled={busy} onClick={() => setPickerOpen(true)}><Icon name="promptCoverReplace" size={20} /></Button>
            <Button size="m" aria-label={t.remove} disabled={busy} onClick={() => { onChange(undefined); requestAnimationFrame(() => emptyButton.current?.focus()); }}><Icon name="promptTrash" size={20} /></Button>
          </div>
        </div> : <button ref={emptyButton} type="button" className="prompt-cover-preview" aria-label={t.upload} disabled={busy} onClick={() => setPickerOpen(true)}>
          <Icon name="promptCoverAddImage" size={24} /><span>{t.uploadImage}</span>
        </button>}
        {busy && <p className="prompt-cover-status" role="status">{t.reading}</p>}
      </div>
    </section>
    {picker.value && createPortal(<AssetPicker allowSvg locale={locale} phase={picker.phase} uploads={uploads} onUpload={onUpload} onConfirm={image => { void selectCover(image); }} onClose={closePicker} />, document.body)}
  </>;
}
