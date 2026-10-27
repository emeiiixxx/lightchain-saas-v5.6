import { imageBounds } from '../canvas-selection';
import { demoNotice } from '../demo-feedback';
import type { Notify } from '../notification';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { AssetPicker } from './AssetPicker';
import { GenerationSettings } from './GenerationSettings';
import { readImage } from '../readImage';
import type { LibraryImage } from '../asset-library';
import { useLocale } from '../LocaleContext';
import { usePresence } from '../usePresence';
import { type CanvasImage, useCanvas } from '../useCanvas';
import { Button, Divider, Icon, IconButton } from './ui';
import { PromptLibrary, SavePrompt } from './PromptLibrary';
import { useSavedPrompts } from '../useSavedPrompts';

export type CanvasEditTool = '局部修改' | '印花上身' | 'AI试衣';
type Reference = { id: string; name: string; url: string };
export type QuickEditDraft = { value: string; references: Reference[]; ratio: string; resolution: string; count: string; printMode?: 'position' | 'repeat' };
export const createQuickEditDraft = (): QuickEditDraft => ({ value: '', references: [], ratio: 'auto', resolution: '2K', count: '1' });
const MIN_COMPOSER_HEIGHT = 276;
const MAX_COMPOSER_HEIGHT = 400;
const COMPOSER_CHROME_HEIGHT = 212;
export function QuickEditComposer({ board, image, phase, onClose, onSubmit, uploads, onUpload, draft, onDraftChange, generating = false, localEdit = false, tool = '局部修改', onAdjustPrint, onNotify }: {
  localEdit?: boolean; tool?: CanvasEditTool; onAdjustPrint?: (draft: QuickEditDraft) => void; onNotify: Notify;
  board: ReturnType<typeof useCanvas>; image: CanvasImage; phase: 'enter' | 'exit'; onClose: () => void;
  onSubmit: (request: string, draft: QuickEditDraft) => void; uploads: LibraryImage[]; onUpload: (image: LibraryImage) => void; generating?: boolean;
  draft: QuickEditDraft; onDraftChange: Dispatch<SetStateAction<QuickEditDraft>>;
}) {
  const { t, locale } = useLocale();
  const { value, references, ratio, resolution, count } = draft;
  const copy = locale === 'en' ? { hint: 'Tell me what to change, e.g. make the collar a V-neck', draw: 'Draw edit area', reference: 'Reference', source: 'Source image', generate: 'Generate' } : locale === 'ja' ? { hint: '変更内容を入力してください（例：襟をVネックに）', draw: '編集範囲を描画', reference: '参考画像', source: '元画像', generate: '生成' } : { hint: '告诉我你想怎么改，如：把领子变V领', draw: '绘制修改区域', reference: '参考图', source: '原图', generate: '生成' };
  const printApply = localEdit && tool === '印花上身';
  const tryOn = localEdit && tool === 'AI试衣';
  const autoGrow = localEdit && !printApply;
  const [autoHeight, setAutoHeight] = useState(MIN_COMPOSER_HEIGHT);
  const autoHeightRef = useRef(MIN_COMPOSER_HEIGHT);
  const referenceLimit = printApply || tryOn ? 1 : 4;
  const referenceLabel = printApply ? t('印花') : tryOn ? t('模特') : copy.reference;
  const referenceLimitMessage = printApply ? t('最多添加1张印花图片') : tryOn ? t('最多添加1张模特图片') : t('最多添加4张参考图片');
  const toolTitle = localEdit ? t(tool) : t('快捷编辑');
  const panelTitle = localEdit && tool === '局部修改' ? t('局部编辑') : toolTitle;
  const inputIcon = (name: string, fallback: string) => autoGrow ? `input-expand/${name}` : fallback;
  const canSubmit = tryOn ? references.length === 1 : !!value.trim();
  const [dock, setDock] = useState({ left: 16, width: 800 });
  const setValue = (value: string) => onDraftChange(previous => ({ ...previous, value }));
  const setReferences: Dispatch<SetStateAction<Reference[]>> = update => onDraftChange(previous => ({ ...previous, references: typeof update === 'function' ? update(previous.references) : update }));
  const setRatio = (ratio: string) => onDraftChange(previous => ({ ...previous, ratio }));
  const setResolution = (resolution: string) => onDraftChange(previous => ({ ...previous, resolution }));
  const setCount = (count: string) => onDraftChange(previous => ({ ...previous, count }));
  const [menu, setMenu] = useState<'settings' | 'model' | null>(null);
  const shownMenu = usePresence(menu);
  const { entries: savedPrompts, store: storePrompts } = useSavedPrompts(onNotify);
  const [savePromptAnchor, setSavePromptAnchor] = useState<HTMLElement | null>(null);
  const shownSavePrompt = usePresence(savePromptAnchor);
  const [promptLibraryOpen, setPromptLibraryOpen] = useState(false);
  const shownPromptLibrary = usePresence(promptLibraryOpen ? true : null);
  const focusInputAfterApply = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCapacity, setPickerCapacity] = useState(4);
  const shownPicker = usePresence(pickerOpen ? true : null);
  const modelAnchor = useRef<HTMLDivElement>(null);
  const modelInput = useRef<HTMLInputElement>(null);
  const settingsAnchor = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const resizeInput = useCallback(() => {
    const element = textarea.current;
    if (!autoGrow || !element?.clientWidth) return;
    const { height, flex, overflowY } = element.style;
    const scrollTop = element.scrollTop;
    const chromeHeight = Math.max(COMPOSER_CHROME_HEIGHT, (root.current?.offsetHeight ?? MIN_COMPOSER_HEIGHT) - element.offsetHeight);
    // Measure the text independently of the current flex height so deletion can shrink it.
    element.style.flex = 'none';
    element.style.height = '0px';
    element.style.overflowY = 'hidden';
    const nextHeight = Math.min(MAX_COMPOSER_HEIGHT, Math.max(MIN_COMPOSER_HEIGHT, chromeHeight + element.scrollHeight));
    element.style.height = height;
    element.style.flex = flex;
    element.style.overflowY = overflowY;
    element.scrollTop = scrollTop;
    autoHeightRef.current = nextHeight;
    setAutoHeight(nextHeight);
  }, [autoGrow]);
  useLayoutEffect(resizeInput, [resizeInput, value, dock.width, locale, error]);
  useEffect(() => {
    let active = true;
    void document.fonts.ready.then(() => { if (active) resizeInput(); });
    document.fonts.addEventListener('loadingdone', resizeInput);
    return () => { active = false; document.fonts.removeEventListener('loadingdone', resizeInput); };
  }, [resizeInput]);
  useEffect(() => {
    if (shownPromptLibrary.value || !focusInputAfterApply.current) return;
    focusInputAfterApply.current = false;
    const input = textarea.current;
    if (input) { input.focus({ preventScroll: true }); input.setSelectionRange(input.value.length, input.value.length); }
  }, [shownPromptLibrary.value]);
  const active = useRef(true);
  const reading = useRef(false);
  const [height, setHeight] = useState(localEdit ? 280 : 140);
  const focusCompleted = useRef(false);
  const close = useRef(onClose); close.current = onClose;
  useLayoutEffect(() => {
    if (!localEdit || phase === 'exit') return;
    const { left, right } = board.editingViewport(true);
    const width = Math.min(800, Math.max(0, right - left));
    setDock({ left: (left + right - width) / 2, width });
    // The fixed composer overlaps the image bottom by 24px (88px dock inset minus 24px).
    const composerHeight = autoGrow ? Math.min(autoHeightRef.current, Math.max(0, board.size.height - 104)) : root.current?.offsetHeight ?? height;
    return board.focusImage(image.id, composerHeight + 64, {
      animate: true,
      staged: !focusCompleted.current,
      onComplete: () => { focusCompleted.current = true; },
    });
  // Content height is deliberately excluded: typing must not move or zoom the canvas.
  }, [localEdit, autoGrow, phase, image.id, height, board.size.width, board.size.height, board.editingViewport, board.focusImage]);
  // Focus once on entry. Subsequent camera, image and input changes only move the composer.
  useLayoutEffect(() => {
    if (localEdit || phase === 'exit') return;
    return board.focusImage(image.id, (root.current?.offsetHeight ?? 140) + 112, { animate: true, ignorePanels: false });
  }, [localEdit, phase, image.id, board.focusImage]);
  useEffect(() => { textarea.current?.focus({ preventScroll: true }); }, [localEdit]);
  useEffect(() => { active.current = phase === 'enter'; return () => { active.current = false; }; }, [phase]);
  useLayoutEffect(() => {
    if (autoGrow) return;
    const element = root.current; if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight)); observer.observe(element);
    return () => observer.disconnect();
  }, [autoGrow]);
  useLayoutEffect(() => { const element = textarea.current; if (element && !autoGrow) { element.style.height = '64px'; element.style.height = `${Math.min(180, Math.max(64, element.scrollHeight))}px`; } }, [value, autoGrow]);
  useEffect(() => {
    const dismiss = (e: PointerEvent) => {
      if (!menu || (settingsAnchor.current?.contains(e.target as Node) || modelAnchor.current?.contains(e.target as Node))) return;
      setMenu(null);
      // Dismiss the nested menu before the canvas can clear the selected image and its editor.
      if (e.button === 0 && e.target === board.canvasRef.current) {
        e.preventDefault();
        e.stopPropagation();
        settingsAnchor.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (savePromptAnchor) { setSavePromptAnchor(null); savePromptAnchor.focus({ preventScroll: true }); }
      else if (menu) { setMenu(null); if (menu === 'model') modelAnchor.current?.querySelector<HTMLButtonElement>('button')?.focus(); else textarea.current?.focus(); }
      else { close.current(); board.canvasRef.current?.focus(); }
    };
    window.addEventListener('pointerdown', dismiss, true); window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('pointerdown', dismiss, true); window.removeEventListener('keydown', escape, true); };
  }, [menu, board.canvasRef, savePromptAnchor]);
  useEffect(() => {
    if (menu === 'model') modelAnchor.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [menu]);
  const submit = () => {
    if (!canSubmit || generating || phase === 'exit') return;
    onSubmit([value.trim() || toolTitle, `${t('编辑图片')}：${image.name}`, ...references.map(ref => `${t('参考图片')}：${ref.name}`), `${ratio === 'auto' ? t('智能') : ratio} | ${resolution} | ${t(`${count}张`)}`].join('\n'), draft);
  };
  const addFiles = async (files: FileList) => {
    if (reading.current) return;
    if (files.length + references.length > referenceLimit) { setError(referenceLimitMessage); return; }
    reading.current = true;
    try {
      const results = await Promise.allSettled(Array.from(files).map(readImage));
      const loaded = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
      if (!active.current) { loaded.forEach(item => URL.revokeObjectURL(item.url)); return; }
      loaded.forEach(onUpload);
      setReferences(previous => [...previous, ...loaded].slice(0, referenceLimit));
      setError(results.some(result => result.status === 'rejected') ? t('支持 JPG、PNG、WebP、SVG，单张图片不超过 20 MB') : '');
    } finally { reading.current = false; }
  };
  const confirmReferences = (items: Omit<CanvasImage, 'x' | 'y'>[]) => {
    setReferences(previous => [...previous, ...items.filter(item => !previous.some(ref => ref.url === item.url))].slice(0, referenceLimit));
    setPickerOpen(false); setError('');
  };
  const openReferences = () => {
    setMenu(null);
    if (references.length >= referenceLimit) { setError(referenceLimitMessage); return; }
    setPickerCapacity(referenceLimit - references.length); setPickerOpen(true);
  };
  const width = Math.min(480, Math.max(0, board.size.width - 32));
  const bounds = imageBounds(image);
  const left = (bounds.x + bounds.width / 2) * board.camera.zoom + board.camera.x;
  const top = (bounds.y + bounds.height) * board.camera.zoom + board.camera.y + 24;
  return <><div ref={root} className={`quick-edit-composer ${localEdit ? 'local-edit-composer' : 'agent-composer'} ${printApply ? 'print-apply-composer' : tryOn ? 'try-on-composer' : ''} ${autoGrow ? 'local-edit-composer--auto-grow' : ''}`} role="region" aria-label={panelTitle} data-canvas-ui data-workbench-menu data-phase={phase} inert={phase === 'exit'} style={(localEdit ? { left: dock.left, bottom: 88, width: dock.width, ...(autoGrow ? { height: autoHeight, maxHeight: Math.max(0, board.size.height - 104) } : {}) } : { left, top, width: 'max-content', minWidth: width, maxWidth: Math.max(0, board.size.width - 32), transform: 'translateX(-50%)' }) as CSSProperties}>
    {localEdit && <header className="local-edit-header"><div className="local-edit-heading"><h2>{panelTitle}</h2>{printApply && <p className="tool-input-hint"><Icon name="tool-info" size={16} /><span>{t('服装建议为平铺图，若您的图片非平铺图，建议使用“转3D平铺”后再次使用')}</span></p>}</div><IconButton icon={inputIcon('close', 'close')} size="m" aria-label={`${t('关闭')} ${panelTitle}`} onClick={onClose} /></header>}
    <div className={localEdit ? 'local-edit-input agent-composer' : 'quick-edit-input'}>
    <div className={autoGrow ? 'local-edit-content' : 'quick-edit-content'}>
    {localEdit && <div className="local-edit-media" data-component="Canvas/ToolMediaRow">
      <div className="local-edit-image" data-component="Image/Asset" title={image.name}><img src={image.url} alt={copy.source} /></div>
      {references.map(ref => <div className="local-edit-image local-edit-reference" data-component="Upload/ImageTile" key={ref.id} title={ref.name}><img src={ref.url} alt={ref.name} /><IconButton variant="tonal" size="s" icon="close" aria-label={`${t('移除')} ${ref.name}`} onClick={() => setReferences(previous => previous.filter(item => item.id !== ref.id))} /></div>)}
      {references.length < referenceLimit && (tryOn ? <div className="model-upload-anchor" ref={modelAnchor}>
        <Button className="local-edit-upload" aria-label={t('添加模特图')} aria-haspopup="menu" aria-expanded={menu === 'model'} aria-controls="try-on-model-menu" onClick={() => setMenu(menu === 'model' ? null : 'model')}><Icon name={inputIcon('add-image', 'quick-edit-imgIcon')} size={24} /><span>{referenceLabel}</span></Button>
        {shownMenu.value === 'model' && <div className="model-upload-menu" id="try-on-model-menu" onKeyDown={event => {
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === 'ArrowDown' ? (index + 1) % items.length : event.key === 'ArrowUp' ? (index + items.length - 1) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1;
          if (next >= 0) { event.preventDefault(); items[next]?.focus(); }
        }} role="menu" aria-label={t('添加模特图')} data-phase={shownMenu.phase} inert={shownMenu.phase === 'exit'}>
          <span className="model-upload-menu-title">{t('添加模特图')}</span>
          <Button role="menuitem" icon="upload" onClick={() => { setMenu(null); modelInput.current?.click(); }}>{t('本地上传')}</Button>
          <Button role="menuitem" onClick={() => { setMenu(null); onNotify(t('模特库选择将在后续 Demo 中演示')); }}>{t('模特库选择')}</Button>
        </div>}
      </div> : <Button className="local-edit-upload" aria-label={`${t('添加图片')} · ${referenceLabel}`} aria-haspopup="dialog" onClick={openReferences}><Icon name={inputIcon('add-image', 'quick-edit-imgIcon')} size={24} /><span>{referenceLabel}</span></Button>)}
    </div>}
    {!localEdit && references.length > 0 && <div className="quick-edit-references">{references.map((ref, index) => <div className="quick-edit-chip" key={ref.id}><img src={ref.url} alt="" /><span title={ref.name}>{t('图片')}{index + 1}</span><Button aria-label={`${t('移除')} ${ref.name}`} onClick={() => { setReferences(prev => prev.filter(item => item.id !== ref.id)); setError(''); }}><Icon name="quick-edit-imgIconSystem" size={16} /></Button></div>)}</div>}
    {!printApply && <textarea ref={textarea} aria-label={t('设计需求')} placeholder={localEdit ? copy.hint : t('描述你想如何修改这张图片')} value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} onPaste={e => { if (e.clipboardData.files.length) { e.preventDefault(); void addFiles(e.clipboardData.files); } }} />}
    {error && <p className="quick-edit-error" role="status">{error}</p>}
    </div>
    {printApply ? <div className="print-apply-footer">
      <div className="print-mode-switch" role="group" aria-label={t('印花方式')}>
        <Button aria-pressed={draft.printMode !== 'repeat'} onClick={() => onDraftChange(previous => ({ ...previous, printMode: 'position' }))}><Icon name="print-target-position-linear" size={16} />{t('指定位置')}</Button>
        <Button aria-pressed={draft.printMode === 'repeat'} onClick={() => onDraftChange(previous => ({ ...previous, printMode: 'repeat' }))}><Icon name="print-seamless-repeat" size={16} />{t('满印')}</Button>
      </div>
      <Button variant="primary" size="m" disabled={!references.length || generating} onClick={() => onAdjustPrint?.(draft)}>{t('调整印花位置')}</Button>
    </div> : <div className="quick-edit-footer">
      <div className="quick-edit-actions">
        {localEdit ? <Button icon={inputIcon('inpaint', 'prop-imgNameInpaint')} onClick={() => { setMenu(null); onNotify(demoNotice(locale)); }}>{copy.draw}</Button> : <IconButton size="m" icon="quick-edit-imgIcon" className="quick-edit-add" aria-label={t('添加图片')} aria-haspopup="dialog" onClick={openReferences} />}
        <Divider vertical />
        <div ref={settingsAnchor} className="quick-edit-menu-anchor"><Button className="quick-edit-settings-trigger" aria-haspopup="dialog" aria-controls="quick-edit-generation-settings" aria-label={t('生成设置')} aria-expanded={menu === 'settings'} onClick={() => setMenu(menu === 'settings' ? null : 'settings')}><Icon name={ratio === 'auto' ? inputIcon('ratio-auto', 'parameter-auto') : `parameter-${ratio.replace(':', '-')}`} size={20} /><span>{ratio === 'auto' ? t('智能') : ratio} ｜ {resolution} ｜ {t(`${count}张`)}</span><Icon name={inputIcon('chevron-down', 'quick-edit-imgChevron')} size={16} /></Button>
          {shownMenu.value === 'settings' && <GenerationSettings anchor={settingsAnchor} phase={shownMenu.phase} ratio={ratio} resolution={resolution} count={count} onRatioChange={setRatio} onResolutionChange={setResolution} onCountChange={setCount} />}

        </div>
      </div>
      <div className="quick-edit-submit">
        <IconButton size="s" icon={inputIcon('save-prompt', 'tool-input-save-prompt')} aria-label={t('保存提示词')} title={t('保存提示词')} disabled={!value.trim()} onClick={event => { setMenu(null); setSavePromptAnchor(event.currentTarget); }} />
        <IconButton size="s" icon={inputIcon('prompt-library', 'tool-input-prompt-library')} aria-label={t('提示词库')} title={t('提示词库')} onClick={() => { setMenu(null); setPromptLibraryOpen(true); }} />
        <Divider vertical />
        <span className="quick-edit-credits"><Icon name={inputIcon('credits', 'quick-edit-imgIconSystem1')} size={16} />{t('30 / 张')}</span><button className="agent-send" disabled={!canSubmit || generating} aria-label={localEdit ? copy.generate : t('发送设计需求')} data-tooltip={localEdit ? copy.generate : t('发送设计需求')} onClick={submit}><Icon name={inputIcon('generate-arrow', 'quick-edit-imgIconGenerateStar')} size={24} /></button>
      </div>
    </div>}
    </div>
    {tryOn && <input ref={modelInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={event => { if (event.target.files?.length) void addFiles(event.target.files); event.target.value = ''; }} />}
  </div>
    {shownPicker.value && createPortal(<div onDragEnter={event => event.stopPropagation()} onDragOver={event => event.stopPropagation()} onDragLeave={event => event.stopPropagation()} onDrop={event => event.stopPropagation()}>
      <AssetPicker locale={locale} phase={shownPicker.phase} uploads={[...uploads, ...board.images]} onUpload={onUpload} maxCount={pickerCapacity} excludedUrls={references.map(ref => ref.url)} limitMessage={referenceLimitMessage} onConfirm={item => confirmReferences([item])} onConfirmBatch={confirmReferences} onClose={() => setPickerOpen(false)} />
    </div>, document.body)}
    {shownPromptLibrary.value && createPortal(<PromptLibrary phase={shownPromptLibrary.phase} entries={savedPrompts} uploads={uploads} onUpload={onUpload} onStore={storePrompts} onNotify={onNotify} onClose={() => setPromptLibraryOpen(false)} onApply={(content, mode) => {
      onDraftChange(previous => ({ ...previous, value: mode === 'replace' ? content : previous.value ? `${previous.value}${previous.value.endsWith('\n') ? '' : '\n'}${content}` : content }));
      focusInputAfterApply.current = true;
      setPromptLibraryOpen(false);
    }} />, document.body)}
    {shownSavePrompt.value && createPortal(<SavePrompt anchor={shownSavePrompt.value} phase={shownSavePrompt.phase} onClose={() => setSavePromptAnchor(null)} onSave={async name => {
      const result = await storePrompts([{ id: crypto.randomUUID(), name, content: value.trim() }, ...savedPrompts]);
      if (result.ok) { setSavePromptAnchor(null); onNotify('提示词已保存', 'success'); }
      else onNotify(result.message, 'error');
    }} />, document.body)}
  </>;
}
