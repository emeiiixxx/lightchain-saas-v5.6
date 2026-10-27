import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CanvasImage } from '../useCanvas';
import { useLocale } from '../LocaleContext';
import { readDemoState, writeDemoState } from '../demo-storage';
import { createTextRecognizer, replacementText, type TextEditInput, type TextRecognition, type TextRegion } from '../text-edit';
import { Button, Dialog, Divider, Icon, IconButton } from './ui';
import { GenerateTaskButton } from './GenerateTaskButton';
import loadingArtwork from '../artwork/text-edit-loading.svg?raw';
import '../text-edit.css';

const guides = [
  { title: '只框选需要修改的文字', wrong: '框选到无关文字、图片或装饰元素，可能导致其他内容被误修改。', correct: '完整框选目标文字，框外保留其他文字和图片。' },
  { title: '表格需要完整框选', wrong: '英文尺码表只被框选了一部分，表格边缘和其他行列未被完整包含。', correct: '框选区域完整覆盖整个尺码表，框外保留其他工艺单内容。' },
  { title: '一次只编辑一个目标', wrong: '框选范围过大，占据工艺单图片的一半并包含多段文字，模型难以判断修改对象。', correct: '只框选工艺单中一个独立且完整的文字区域。' },
];
type Point = { x: number; y: number };
type Draft = { region: TextRegion | null; prompt: string; width: number; height: number };
type Gesture = { mode: string; start: Point; region: TextRegion | null; pan: Point; pointer: number };
const emptyRecognition: TextRecognition = { text: '', lines: [] };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function TextEditDialog({ source, phase, onClose, onSubmit }: {
  source: CanvasImage; phase: 'enter' | 'exit'; onClose: () => void;
  onSubmit: (input: TextEditInput, prompt: string) => Promise<void>;
}) {
  const { t } = useLocale();
  const width = source.image.naturalWidth, height = source.image.naturalHeight;
  const key = `text-edit:${source.id}`;
  const [draft] = useState(() => {
    const saved = readDemoState<Draft | null>(key, null);
    return saved?.width === width && saved.height === height ? saved : null;
  });
  const [region, setRegion] = useState<TextRegion | null>(draft?.region ?? null);
  const [box, setBox] = useState<TextRegion | null>(draft?.region ?? null);
  const boxRef = useRef(box); boxRef.current = box;
  const [prompt, setPrompt] = useState(draft?.prompt ?? '');
  const [recognition, setRecognition] = useState<TextRecognition>(emptyRecognition);
  const [status, setStatus] = useState<'idle' | 'busy' | 'ready' | 'empty' | 'error'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const submitted = useRef(false);
  const [submitError, setSubmitError] = useState('');
  const [firstGuide, setFirstGuide] = useState(() => !readDemoState('text-edit-guide-completed', false));
  const [guideOpen, setGuideOpen] = useState(firstGuide);
  const [guideIndex, setGuideIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [wheeling, setWheeling] = useState(false);
  const wheelEnd = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [space, setSpace] = useState(false);
  const spaceHeld = useRef(false);
  const stage = useRef<HTMLDivElement>(null);
  const media = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const request = useRef(0);
  const reader = useRef<ReturnType<typeof createTextRecognizer> | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const fit = Math.min(1, Math.max(100, size.width - 128) / width, Math.max(100, size.height - 216) / height);
  const shownWidth = width * fit * zoom, shownHeight = height * fit * zoom;
  const ready = status === 'ready' && !!region && !!prompt.trim() && !!replacementText(prompt) && !dragging && !guideOpen && !submitting && phase !== 'exit';
  const chars = Array.from(prompt).length;

  useLayoutEffect(() => {
    const target = stage.current;
    if (!target) return;
    const resize = () => setSize({ width: target.clientWidth, height: target.clientHeight });
    const observer = new ResizeObserver(resize); observer.observe(target); resize();
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => { stage.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { writeDemoState(key, { region, prompt, width, height }); }, [key, region, prompt, width, height]);
  useEffect(() => {
    const currentReader = createTextRecognizer(); reader.current = currentReader;
    return () => { request.current++; currentReader.dispose(); reader.current = null; clearTimeout(wheelEnd.current); };
  }, []);
  useEffect(() => {
    const token = ++request.current;
    if (!region || guideOpen || phase === 'exit') return;
    setStatus('busy'); setRecognition(emptyRecognition);
    void reader.current?.recognize(source.image, region).then(result => {
      if (request.current !== token) return;
      setRecognition(result); setStatus(result.text.trim() ? 'ready' : 'empty');
    }).catch(() => { if (request.current === token) setStatus('error'); });
    return () => { request.current++; };
  }, [region, guideOpen, phase, source.image]);
  useLayoutEffect(() => {
    const dialog = stage.current?.closest('dialog');
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !dialog?.open) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('dialog') !== dialog) return;
      if (!spaceHeld.current && target.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""]')) return;
      // Space belongs to panning here, including when a toolbar/close button has focus.
      // Cancel both key events so releasing Space cannot activate that button.
      event.preventDefault(); event.stopImmediatePropagation();
      spaceHeld.current = true; setSpace(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !spaceHeld.current) return;
      event.preventDefault(); event.stopImmediatePropagation();
      spaceHeld.current = false; setSpace(false);
    };
    const blur = () => {
      spaceHeld.current = false; setSpace(false);
      const active = gesture.current;
      if (active?.mode !== 'pan') return;
      gesture.current = null; setDragging(false);
      if (stage.current?.hasPointerCapture(active.pointer)) stage.current.releasePointerCapture(active.pointer);
    };
    window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', blur); };
  }, []);
  const zoomAt = (next: number, anchor?: Point) => {
    next = clamp(next, .25, 4);
    const point = anchor ?? { x: size.width / 2, y: size.height / 2 };
    const ratio = next / zoom;
    setPan({ x: point.x - size.width / 2 - (point.x - size.width / 2 - pan.x) * ratio, y: point.y - size.height / 2 - (point.y - size.height / 2 - pan.y) * ratio });
    setZoom(next);
  };
  useEffect(() => {
    const target = stage.current;
    if (!target) return;
    const wheel = (event: WheelEvent) => {
      if (guideOpen || gesture.current || (event.target instanceof Element && event.target.closest('button'))) return;
      event.preventDefault();
      setWheeling(true); clearTimeout(wheelEnd.current);
      wheelEnd.current = setTimeout(() => setWheeling(false), 120);
      const rect = target.getBoundingClientRect();
      zoomAt(zoom * Math.exp(-event.deltaY * .002), { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    target.addEventListener('wheel', wheel, { passive: false });
    return () => target.removeEventListener('wheel', wheel);
  }, [guideOpen, zoom, pan, size]);

  const imagePoint = (event: ReactPointerEvent): Point => {
    const rect = media.current!.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) * width / rect.width, 0, width), y: clamp((event.clientY - rect.top) * height / rect.height, 0, height) };
  };
  const startGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (guideOpen || submitting || phase === 'exit' || !media.current || (event.button !== 0 && event.button !== 1)) return;
    if ((event.target as Element).closest('button') && !(event.target as Element).closest('[data-text-handle]')) return;
    const panMode = spaceHeld.current || event.button === 1;
    const rect = media.current.getBoundingClientRect();
    if (!panMode && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = panMode ? { x: event.clientX, y: event.clientY } : imagePoint(event);
    const handle = (event.target as HTMLElement).dataset.textHandle;
    const mode = panMode ? 'pan' : handle ?? ((event.target as Element).closest('.text-edit-selection') ? 'move' : 'draw');
    gesture.current = { mode, start: point, region: boxRef.current, pan, pointer: event.pointerId };
    setDragging(true);
    if (!panMode) {
      request.current++; setStatus('idle'); setRecognition(emptyRecognition); setSubmitError('');
      if (mode === 'draw') { const next = { ...point, width: 0, height: 0 }; boxRef.current = next; setBox(next); }
    }
  };
  const moveGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    event.stopPropagation();
    if (active.mode === 'pan') { setPan({ x: active.pan.x + event.clientX - active.start.x, y: active.pan.y + event.clientY - active.start.y }); return; }
    const point = imagePoint(event), dx = point.x - active.start.x, dy = point.y - active.start.y;
    let next: TextRegion;
    if (active.mode === 'draw') next = { x: Math.min(active.start.x, point.x), y: Math.min(active.start.y, point.y), width: Math.abs(dx), height: Math.abs(dy) };
    else {
      const before = active.region!;
      if (active.mode === 'move') next = { ...before, x: clamp(before.x + dx, 0, width - before.width), y: clamp(before.y + dy, 0, height - before.height) };
      else {
        let left = before.x, top = before.y, right = left + before.width, bottom = top + before.height;
        if (active.mode.includes('w')) left = clamp(left + dx, 0, right - 4);
        if (active.mode.includes('e')) right = clamp(right + dx, left + 4, width);
        if (active.mode.includes('n')) top = clamp(top + dy, 0, bottom - 4);
        if (active.mode.includes('s')) bottom = clamp(bottom + dy, top + 4, height);
        next = { x: left, y: top, width: right - left, height: bottom - top };
      }
    }
    boxRef.current = next; setBox(next);
  };
  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>, cancel = false) => {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    event.stopPropagation();
    gesture.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (active.mode === 'pan') return;
    const next = cancel ? region : boxRef.current;
    const valid = next && next.width >= 4 && next.height >= 4 ? {
      x: Math.floor(next.x), y: Math.floor(next.y),
      width: Math.min(width - Math.floor(next.x), Math.ceil(next.width)), height: Math.min(height - Math.floor(next.y), Math.ceil(next.height)),
    } : null;
    boxRef.current = valid; setBox(valid); setRegion(valid);
  };
  const reset = () => {
    request.current++; gesture.current = null; setDragging(false); setZoom(1); setPan({ x: 0, y: 0 });
    boxRef.current = null; setBox(null); setRegion(null); setPrompt(''); setStatus('idle'); setRecognition(emptyRecognition); setSubmitError('');
  };
  const finishGuide = () => {
    writeDemoState('text-edit-guide-completed', true); setFirstGuide(false); setGuideOpen(false); setGuideIndex(0);
  };
  const submit = async () => {
    if (!ready || !region || submitted.current) return;
    submitted.current = true; setSubmitting(true); setSubmitError('');
    try { await onSubmit({ sourceUrl: source.url, width, height, region, recognition }, prompt.trim()); }
    catch { submitted.current = false; setSubmitting(false); setSubmitError('提交失败，请重试'); }
  };
  const guide = guides[guideIndex];
  return <Dialog className="text-edit-dialog" title={<><Icon name="text-edit/text-edit" size={24} /><span>{t('文字编辑')}</span></>} closeIcon="text-edit/close" closeOnEscape={false} closeOnBackdrop={false} phase={phase} onClose={onClose}>
    <div className="text-edit-body">
      <aside className="text-edit-sidebar">
        <section className="text-edit-recognition">
          <h3>{t('待修改文字')}</h3>
          <div className={`text-edit-recognized ${status === 'empty' || status === 'error' ? 'has-error' : ''}`} role="status" aria-live="polite" tabIndex={0}>
            {status === 'busy' ? <span className="text-edit-status"><span className="text-edit-loading" aria-hidden="true" dangerouslySetInnerHTML={{ __html: loadingArtwork }} />{t('正在识别文字...')}</span>
              : status === 'ready' ? recognition.text
              : t(status === 'empty' ? '未识别到文字，请调整框选范围' : status === 'error' ? '识别失败，请重试' : '请长按鼠标左键框选文字调整区域')}
            {status === 'error' && <Button onClick={() => setRegion(region ? { ...region } : null)}>{t('重试')}</Button>}
          </div>
        </section>
        <section className="text-edit-input">
          <label htmlFor="text-edit-prompt">{t('调整内容')}</label>
          <div className="text-edit-textarea">
            <textarea id="text-edit-prompt" value={prompt} disabled={submitting || firstGuide} onChange={event => { setPrompt(Array.from(event.target.value).slice(0, 400).join('')); setSubmitError(''); }} placeholder={t('请输入调整内容，替换文字请按原图的段落换行。\n示例：\n把文案改为“\n1.衣长(后中)\n2.肩宽(平铺肩点)\n3.胸围(夹道下1cm)\n4.腰围(最窄处)\n5.下摆围(沿下摆线)”')} />
            <span className="text-edit-counter">{chars}/400</span>
          </div>
          {submitError && <p className="text-edit-error" role="alert">{t(submitError)}</p>}
          <GenerateTaskButton cost={999} showCost={!submitting} disabled={!ready} onClick={() => void submit()}>{submitting ? t('提交中…') : t('修改')}</GenerateTaskButton>
        </section>
      </aside>
      <div ref={stage} className="text-edit-stage" tabIndex={-1} data-gesture={dragging} data-wheel={wheeling} data-pan={space || (dragging && gesture.current?.mode === 'pan')} onPointerDown={startGesture} onPointerMove={moveGesture} onPointerUp={finishGesture} onPointerCancel={event => finishGesture(event, true)} onLostPointerCapture={event => finishGesture(event, true)}>
        {!guideOpen && <div className="text-edit-image" ref={media} style={{ width: shownWidth, height: shownHeight, left: (size.width - shownWidth) / 2 + pan.x, top: (size.height - shownHeight) / 2 + pan.y }}>
          <img src={source.url} alt={source.name} draggable={false} />
          {box && <div className="text-edit-selection" style={{ left: `${box.x / width * 100}%`, top: `${box.y / height * 100}%`, width: `${box.width / width * 100}%`, height: `${box.height / height * 100}%` }}>
            {['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].map(handle => <button key={handle} type="button" data-text-handle={handle} className={`text-edit-handle text-edit-handle--${handle}`} aria-label={t('调整框选范围')} />)}
          </div>}
        </div>}
        {(!guideOpen || firstGuide) && <p className="text-edit-hint">{t(firstGuide ? '💡当前为操作指引，完成后即可开始编辑' : '💡拖动鼠标框选需要调整的文字区域')}</p>}
        {!firstGuide && <Button className="text-edit-guide-trigger" variant="outline" icon="text-edit/guide" onClick={() => { setGuideOpen(!guideOpen); setGuideIndex(0); }}>{t(guideOpen ? '关闭示例' : '查看操作示例')}</Button>}
        {guideOpen ? <div className="text-edit-guide" data-phase="enter">
          <div className="text-edit-guide-card" key={guideIndex} data-phase="enter">
            <h3>{t(guide.title)}</h3>
            <div className="text-edit-guide-columns">{(['wrong', 'correct'] as const).map(kind => <div className="text-edit-guide-example" key={kind}>
              <div className="text-edit-guide-media"><span className={`text-edit-guide-badge is-${kind}`}><Icon name={`text-edit/${kind}`} size={16} />{t(kind === 'wrong' ? '错误示范' : '正确示范')}</span><img src={`/assets/design-workbench/text-edit/guide-${guideIndex + 1}-${kind}.png`} alt={t(guide[kind])} draggable={false} /></div>
              <p>{t(guide[kind])}</p>
            </div>)}</div>
          </div>
          <nav className="text-edit-guide-pagination" aria-label={t('操作示例')}>
            <Button variant="outline" disabled={guideIndex === 0} onClick={() => setGuideIndex(index => index - 1)}>{t('上一张')}</Button><span>{guideIndex + 1} / 3</span>
            <Button variant={guideIndex === 2 ? 'primary' : 'outline'} onClick={() => guideIndex === 2 ? finishGuide() : setGuideIndex(index => index + 1)}>{t(guideIndex === 2 ? firstGuide ? '完成，开始编辑' : '关闭示例' : '下一张')}</Button>
          </nav>
        </div> : <div className="text-edit-zoom">
          <IconButton icon="text-edit/zoom-out" aria-label={t('缩小')} disabled={zoom <= .25} onClick={() => zoomAt(zoom - .25)} /><span>{Math.round(zoom * 100)}%</span><IconButton icon="text-edit/zoom-in" aria-label={t('放大')} disabled={zoom >= 4} onClick={() => zoomAt(zoom + .25)} />
          {status === 'ready' && <><Divider vertical /><Button icon="text-edit/reset" onClick={reset}>{t('重置')}</Button></>}
        </div>}
      </div>
    </div>
  </Dialog>;
}
