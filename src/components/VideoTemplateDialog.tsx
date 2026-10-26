import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { LibraryImage } from '../asset-library';
import { readImage } from '../canvas';
import type { Locale } from '../i18n';
import { usePresence } from '../usePresence';
import { videoAssets } from '../video-assets';
import { videoTemplateMedia, videoTemplateMessages, videoTemplates, type VideoTemplateId, type VideoTemplateImageSlot, type VideoTemplateReplacements } from '../video-templates';
import { videoWorkflowTitle } from '../video-workflow';
import { AssetPicker } from './AssetPicker';
import { GenerateTaskButton } from './GenerateTaskButton';
import { TagChip } from './TagChip';
import { VideoTemplateReferences } from './VideoTemplateReferences';
import { notify } from './Toast';
import { Button, Dialog, Divider, Icon } from './ui';
import '../video-template-dialog.css';

type UploadedImage = { url: string; name: string };
type ImageSlot = VideoTemplateImageSlot;
type TemplateUploads = Partial<Record<VideoTemplateId, Partial<Record<ImageSlot, UploadedImage>>>>;

function TemplateImageField({ locale, slot, value, onChange, onUpload, onChoose, onBusyChange, active }: {
  locale: Locale;
  slot: ImageSlot;
  value?: UploadedImage;
  onChange: (image?: UploadedImage) => void;
  onUpload: (image: LibraryImage) => void;
  onChoose: () => void;
  onBusyChange: (busy: boolean) => void;
  active: boolean;
}) {
  const t = videoTemplateMessages[locale];
  const label = slot === 'garment' ? t.garment : t.model;
  const placeholder = slot === 'garment' ? t.garmentPlaceholder : t.modelPlaceholder;
  const id = useId();
  const emptyButton = useRef<HTMLButtonElement>(null);
  const request = useRef(0);
  const dragDepth = useRef(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const busyCallback = useRef(onBusyChange); busyCallback.current = onBusyChange;
  useEffect(() => { busyCallback.current(busy); return () => busyCallback.current(false); }, [busy]);

  useEffect(() => () => { request.current++; }, []);
  useEffect(() => {
    if (!active) { request.current++; setBusy(false); setDragging(false); dragDepth.current = 0; }
  }, [active]);

  async function upload(files: File[]) {
    if (!active || files.length === 0) return;
    const version = ++request.current;
    setBusy(false);
    if (files.length !== 1) { notify(t.singleImage, 'error'); return; }
    const file = files[0];
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
      notify(t.uploadError, 'error');
      return;
    }
    setBusy(true);
    try {
      const image = await readImage(file);
      if (version !== request.current) { URL.revokeObjectURL(image.url); return; }
      onUpload(image);
      onChange({ url: image.url, name: image.name });
    } catch {
      if (version === request.current) notify(t.decodeError, 'error');
    } finally {
      if (version === request.current) setBusy(false);
    }
  }

  function dragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (active && event.dataTransfer.types.includes('Files')) { dragDepth.current++; setDragging(true); }
  }

  function choose() {
    request.current++;
    setBusy(false);
    onChoose();
  }

  return <section className="video-template-image-field" aria-labelledby={`${id}-label`}>
    <h4 id={`${id}-label`} className="video-template-visually-hidden">{label}</h4>
    <span id={`${id}-formats`} className="video-template-visually-hidden">{t.formats}</span>
    <div className="video-template-upload" data-filled={!!value} data-dragging={dragging} aria-busy={busy}
      onDragEnter={dragEnter}
      onDragOver={event => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = active ? 'copy' : 'none'; }}
      onDragLeave={event => { event.preventDefault(); event.stopPropagation(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
      onDrop={event => { event.preventDefault(); event.stopPropagation(); dragDepth.current = 0; setDragging(false); void upload(Array.from(event.dataTransfer.files)); }}>
      {value ? <>
        <div className="video-template-thumbnail">
          <img src={value.url} alt={value.name} />
          <div className="video-template-image-actions">
            <Button title={t.replace} aria-label={`${t.replace} · ${label}`} aria-haspopup="dialog" disabled={!active} onClick={choose}><Icon name="promptCoverReplace" size={16} /></Button>
            <Button title={t.remove} aria-label={`${t.remove} · ${label}`} disabled={!active} onClick={() => { request.current++; setBusy(false); onChange(); requestAnimationFrame(() => emptyButton.current?.focus()); }}><Icon name="promptTrash" size={16} /></Button>
          </div>
        </div>
        <p className="video-template-file-name">{value.name}</p>
      </> : <button ref={emptyButton} type="button" className="video-template-upload-empty" aria-label={`${label} · ${placeholder}`} aria-describedby={`${id}-formats`} aria-haspopup="dialog" disabled={!active} onClick={choose}>
        <Icon name="promptCoverAddImage" size={24} /><span>{busy ? t.reading : placeholder}</span>
      </button>}
      {busy && value && <span className="video-template-upload-status" role="status">{t.reading}</span>}
    </div>
  </section>;
}

export function VideoTemplateDialog({ locale, onClose, phase, uploads: libraryUploads, onUpload, onGenerate, onEdit }: {
  locale: Locale;
  onClose: () => void;
  phase: 'enter' | 'exit';
  uploads: LibraryImage[];
  onUpload: (image: LibraryImage) => void;
  onGenerate: (templateId: VideoTemplateId, replacements: VideoTemplateReplacements, signal: AbortSignal) => Promise<boolean>;
  onEdit: (templateId: VideoTemplateId, replacements: VideoTemplateReplacements, signal: AbortSignal) => Promise<boolean>;
}) {
  const t = videoTemplateMessages[locale];
  const id = useId();
  const [selected, setSelected] = useState<VideoTemplateId>('commerce');
  const [uploads, setUploads] = useState<TemplateUploads>({});
  const [imagePicker, setImagePicker] = useState<{ templateId: VideoTemplateId; slot: ImageSlot } | null>(null);
  const shownPicker = usePresence(phase === 'enter' ? imagePicker : null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busySlots, setBusySlots] = useState({ garment: false, model: false });
  const generationRequest = useRef<AbortController | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const template = videoTemplates.find(item => item.id === selected)!;
  const { video: videoSource, poster } = videoTemplateMedia(template);
  const canEdit = phase === 'enter' && !submitting && !busySlots.garment && !busySlots.model && !shownPicker.value
    && Boolean(template.preview && template.workflow);
  const canGenerate = canEdit && Boolean(uploads[selected]?.garment?.url || uploads[selected]?.model?.url);

  useEffect(() => () => { generationRequest.current?.abort(); generationRequest.current = null; }, []);
  useEffect(() => { if (phase === 'exit') generationRequest.current?.abort(); }, [phase]);

  function changeBusy(slot: ImageSlot, busy: boolean) {
    setBusySlots(previous => previous[slot] === busy ? previous : { ...previous, [slot]: busy });
  }

  async function submit(action: 'edit' | 'generate') {
    if (!(action === 'edit' ? canEdit : canGenerate) || generationRequest.current) return;
    const request = new AbortController();
    generationRequest.current = request;
    setSubmitting(true);
    try {
      const created = await (action === 'edit' ? onEdit : onGenerate)(selected, { ...uploads[selected] }, request.signal);
      if (created && !request.signal.aborted) close();
    } catch {
      if (!request.signal.aborted) notify(t.generateError, 'error');
    } finally {
      if (generationRequest.current === request) {
        generationRequest.current = null;
        setSubmitting(false);
      }
    }
  }

  useEffect(() => {
    const player = video.current;
    if (phase === 'exit') player?.pause();
    return () => { player?.pause(); };
  }, [phase, selected]);

  function close() { generationRequest.current?.abort(); video.current?.pause(); setImagePicker(null); onClose(); }

  function selectTemplate(next: VideoTemplateId) {
    if (next === selected) return;
    generationRequest.current?.abort(); generationRequest.current = null;
    setSubmitting(false); setBusySlots({ garment: false, model: false });
    video.current?.pause();
    setVideoFailed(false);
    setSelected(next);
  }

  function selectWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'ArrowDown') next = (index + 1) % videoTemplates.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + videoTemplates.length) % videoTemplates.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = videoTemplates.length - 1;
    else return;
    event.preventDefault();
    selectTemplate(videoTemplates[next].id);
    tabs.current[next]?.focus();
  }

  function changeImage(templateId: VideoTemplateId, slot: ImageSlot, image?: UploadedImage) {
    // The workspace owns uploaded URLs so references and upload history can share them.
    setUploads(previous => ({ ...previous, [templateId]: { ...previous[templateId], [slot]: image } }));
  }

  function chooseImage(slot: ImageSlot) {
    if (phase === 'enter' && !shownPicker.value) setImagePicker({ templateId: selected, slot });
  }

  function confirmImage(image: UploadedImage) {
    if (phase !== 'enter' || !imagePicker) return;
    changeImage(imagePicker.templateId, imagePicker.slot, { url: image.url, name: image.name });
    setImagePicker(null);
  }

  return <><Dialog title={t.title} closeLabel={t.close} onClose={close} phase={phase} className="video-template-dialog" header={false} labelledBy={`${id}-title`}>
    <aside className="video-template-sidebar">
      <h2 id={`${id}-title`}>{t.title}</h2>
      <div className="video-template-tabs" role="tablist" aria-orientation="vertical" aria-label={t.categories}>
        {videoTemplates.map((item, index) => <button key={item.id} ref={element => { tabs.current[index] = element; }} type="button" role="tab" id={`${id}-tab-${item.id}`} aria-selected={selected === item.id} aria-controls={`${id}-content`} tabIndex={selected === item.id ? 0 : -1}
          onClick={() => selectTemplate(item.id)} onKeyDown={event => selectWithKeyboard(event, index)}>{item.label[locale]}</button>)}
      </div>
    </aside>
    <Divider vertical />
    <section id={`${id}-content`} role="tabpanel" aria-labelledby={`${id}-tab-${selected}`} className={`video-template-content${template.preview ? '' : ' is-empty'}`}>
      {template.preview ? <>
        <div className="video-template-preview" data-orientation={template.preview}>
          {videoSource && !videoFailed ? <video key={selected} ref={video} src={videoSource} poster={poster} controls playsInline preload="metadata" aria-label={template.label[locale]} onError={() => setVideoFailed(true)} />
            : <><img src={poster} alt={template.label[locale]} /><p className="video-template-preview-notice" role="status">{videoFailed ? t.videoError : t.videoUnavailable}</p></>}
        </div>
        <div className="video-template-details">
          <div className="video-template-close"><Button aria-label={t.close} onClick={close}><Icon name="close" size={20} /></Button></div>
          <div className="video-template-detail-body">
            <header className="video-template-heading" data-node-id="141:24213">
              <div className="video-template-title"><h3>{template.label[locale]}</h3><p>{template.description?.[locale]}</p></div>
              {template.references && <VideoTemplateReferences key={selected} locale={locale} references={template.references} />}
              {template.workflow && <div className="video-template-configuration" data-node-id="141:24226">
                <TagChip>{videoWorkflowTitle(template.workflow.mode, locale)}</TagChip>
                <TagChip>{template.workflow.ratio} ｜ {template.workflow.resolution} ｜ {template.workflow.duration}</TagChip>
              </div>}
            </header>
            <Divider />
            <section className="video-template-uploads" key={selected} aria-labelledby={`${id}-upload-title`} aria-describedby={`${id}-upload-requirement`}>
              <header className="video-template-upload-heading">
                <h4 id={`${id}-upload-title`}>{t.uploadTitle}</h4>
                <p id={`${id}-upload-requirement`}>{t.uploadRequirement}</p>
              </header>
              <div className="video-template-upload-fields">
                <TemplateImageField locale={locale} slot="garment" value={uploads[selected]?.garment} active={phase === 'enter' && !submitting} onChange={image => changeImage(selected, 'garment', image)} onUpload={onUpload} onChoose={() => chooseImage('garment')} onBusyChange={busy => changeBusy('garment', busy)} />
                <TemplateImageField locale={locale} slot="model" value={uploads[selected]?.model} active={phase === 'enter' && !submitting} onChange={image => changeImage(selected, 'model', image)} onUpload={onUpload} onChoose={() => chooseImage('model')} onBusyChange={busy => changeBusy('model', busy)} />
              </div>
            </section>
          </div>
          <footer className="video-template-actions"><Button variant="secondary" size="m" disabled={!canEdit} onClick={() => { void submit('edit'); }}>{t.edit}</Button><GenerateTaskButton label={submitting ? t.preparing : t.generate} cost="80" disabled={!canGenerate} aria-busy={submitting} onClick={() => { void submit('generate'); }} /></footer>
        </div>
      </> : <>
        <div className="video-template-close"><Button aria-label={t.close} onClick={close}><Icon name="close" size={20} /></Button></div>
        <div className="video-template-empty"><img src={videoAssets.empty} width={128} height={128} alt="" /><h3>{t.emptyTitle}</h3><p>{t.emptyDescription}</p></div>
      </>}
    </section>
  </Dialog>
    {shownPicker.value && <AssetPicker locale={locale} phase={shownPicker.phase} uploads={libraryUploads} onUpload={onUpload} onConfirm={confirmImage} onClose={() => setImagePicker(null)} />}
  </>;
}
