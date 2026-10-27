import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../LocaleContext';
import type { Notify } from '../notification';
import { demoNotice } from '../demo-feedback';
import { usePresence } from '../usePresence';
import type { CanvasImage } from '../useCanvas';
import type { QuickEditDraft } from './QuickEditComposer';
import { Button, Dialog, Divider, Icon, IconButton } from './ui';
import { GenerateTaskButton } from './GenerateTaskButton';
import { Slider } from './Slider';
import { Spinner } from './Spinner';
import '../print-placement.css';

// The all-over mode uses the original Figma garment/mask as a demo fixture, not recognition output.
const demoGarment = '/assets/design-workbench/print-demo-garment.png';
export function PrintPlacementDialog({ source, draft, phase, onClose, onConfirm, onNotify }: {
  source: CanvasImage; draft: QuickEditDraft; phase: 'enter' | 'exit';
  onClose: () => void; onConfirm: () => void; onNotify: Notify;
}) {
  const { t, locale } = useLocale();
  const submitted = useRef(false);
  const pattern = draft.references[0];
  const repeat = draft.printMode === 'repeat';
  const [recognition, setRecognition] = useState<'idle' | 'busy' | 'ready'>('idle');
  const [scale, setScale] = useState(50);
  const ready = !repeat || recognition === 'ready';
  const leftBusy = usePresence(repeat && recognition === 'busy' ? true : null);
  const rightOverlay = usePresence(repeat && recognition !== 'ready' ? recognition : null);
  useEffect(() => {
    if (recognition !== 'busy' || phase === 'exit') return;
    const timer = window.setTimeout(() => setRecognition('ready'), 1000);
    return () => window.clearTimeout(timer);
  }, [recognition, phase]);
  const previewOnly = () => onNotify(demoNotice(locale));
  const reset = () => { setScale(50); if (repeat) setRecognition('idle'); };
  const leftTitle = repeat ? '编辑蒙版' : '印花图';
  return <Dialog className="print-placement-dialog" title={<><Icon name={repeat ? 'print-seamless-repeat' : 'print-target-position-linear'} size={20} /><span>{t(repeat ? '满印' : '指定位置')}</span><span className="print-placement-demo-note">{t('仅 Demo 演示，线上功能无需修改')}</span></>} phase={phase} onClose={onClose}>
    <div className="print-placement-body">
      <section className="print-placement-stage" aria-label={t(leftTitle)}>
        <div className="print-placement-checker" aria-hidden="true" />
        <span className="print-placement-label">{t(leftTitle)}</span>
        <div className="print-placement-media">
          {repeat ? <div className="print-placement-garment">
            <img src={demoGarment} alt={t('示例服装')} draggable={false} />
            {recognition === 'ready' && <div className="print-demo-mask print-demo-mask--selected" data-phase="enter" aria-hidden="true" />}
            {leftBusy.value && <div className="print-preview-scrim" data-phase={leftBusy.phase} role="status"><Spinner /><span>{t('智能识别中，请稍后...')}</span></div>}
          </div> : pattern && <img className="print-placement-pattern" src={pattern.url} alt={pattern.name} draggable={false} />}
        </div>
        {repeat ? <div className="print-placement-tools print-mask-tools">
          {recognition === 'ready' && <span className="print-mask-region" data-phase="enter" role="checkbox" aria-checked="true" aria-readonly="true" aria-label={t('上装')}><Icon name="check-filled" size={16} />{t('上装')}</span>}
          <Button size="m" icon="prop-imgNameInpaint" disabled={recognition === 'busy'} onClick={() => setRecognition('busy')}>{t('智能识别')}</Button><Divider vertical />
          <IconButton size="l" icon="print-lasso" aria-label={t('套索')} onClick={previewOnly} disabled={recognition === 'busy'} />
          <IconButton size="l" icon="print-brush" aria-label={t('画笔')} onClick={previewOnly} disabled={recognition === 'busy'} />
          <IconButton size="l" icon="print-eraser" aria-label={t('橡皮擦')} onClick={previewOnly} disabled={recognition === 'busy'} />
          <Divider vertical />
          <IconButton size="l" icon="canvas-imgIconEditor2" aria-label={t('撤销')} disabled />
          <IconButton size="l" icon="canvas-imgIconEditor3" aria-label={t('重做')} disabled />
          <IconButton size="l" icon="print-clear" aria-label={t('清除蒙版')} disabled={!ready} onClick={reset} />
        </div> : <div className="print-placement-tools"><Button size="m" onClick={previewOnly}>{t('一键去底')}<span className="print-tool-cost"><Icon name="quick-edit-imgIconSystem1" size={16} />10</span></Button></div>}
      </section>
      <section className="print-placement-stage" aria-label={t('印花上身预览')}>
        <div className="print-placement-checker" aria-hidden="true" />
        <span className="print-placement-label">{t('印花上身预览')}</span>
        <div className="print-placement-media">
          <div className="print-placement-garment">
            <img src={repeat ? demoGarment : source.url} alt={repeat ? t('示例服装') : source.name} draggable={false} />
            {repeat ? <>
              {ready && pattern && <div className="print-demo-mask print-demo-pattern" data-phase="enter" style={{ backgroundImage: `url(${JSON.stringify(pattern.url)})`, backgroundSize: `${scale}% auto` }} aria-hidden="true" />}
              {rightOverlay.value && <div className="print-preview-scrim" data-phase={rightOverlay.phase} role="status">{rightOverlay.value === 'busy' && <Spinner />}<span>{t(rightOverlay.value === 'busy' ? '效果准备中...' : '请先从左侧智能识别或涂抹蒙版区域')}</span></div>}
            </> : pattern && <div className="print-placement-overlay" aria-hidden="true"><img src={pattern.url} alt="" draggable={false} />{['tl', 'tr', 'bl', 'br'].map(corner => <span key={corner} className={`selection-handle handle-${corner}`} />)}</div>}
          </div>
        </div>
        {(!repeat || ready) && <div className={`print-placement-tools ${repeat ? 'print-scale-tools' : ''}`} data-phase="enter">
          {repeat ? <><span>{t('印花缩放')}</span><Slider aria-label={t('印花缩放')} min={10} max={90} value={scale} onChange={event => setScale(Number(event.target.value))} /></> : <><IconButton icon="canvas-imgIconEditor2" aria-label={t('撤销')} disabled /><IconButton icon="canvas-imgIconEditor3" aria-label={t('重做')} disabled /></>}
          <Divider vertical /><Button size={repeat ? 'm' : 's'} icon="canvas-imgIcon0201" onClick={repeat ? () => setScale(50) : previewOnly}>{t('重置')}</Button>
        </div>}
      </section>
      <aside className="print-placement-sidebar">
        <div className="print-placement-instructions">
          <h3>{t('上身效果预览说明')}</h3>
          <ol>
            <li>{t('效果图仅作粗略参考，最终效果以AI生成后为准；')}</li>
            <li>{t(repeat ? '预览视图左侧编辑蒙版区域，右侧可缩放拼接的印花大小；' : '预览视图左侧可快速去除印花底色，右侧可拖拽调整印花位置、大小与角度；')}</li>
            <li>{t(repeat ? '左侧编辑蒙版区域后，右侧展示的印花上身区域跟随改变。' : '左侧印花去底后，右侧印花也会变为去底效果。')}</li>
          </ol>
        </div>
        <footer className="print-placement-footer">
          <Button className="print-placement-settings" onClick={previewOnly} aria-label={t('生成设置')}><Icon name={`parameter-${draft.ratio.replace(':', '-')}`} size={16} /><span>{draft.ratio === 'auto' ? t('智能') : draft.ratio} ｜ {draft.resolution} ｜ {t(`${draft.count}张`)}</span><Icon name="quick-edit-imgChevron" size={16} /></Button>
          <GenerateTaskButton cost={30 * Number(draft.count)} disabled={!pattern || !ready || phase === 'exit'} onClick={() => { if (submitted.current) return; submitted.current = true; onConfirm(); }}>{t('确认并生成')}</GenerateTaskButton>
        </footer>
      </aside>
    </div>
  </Dialog>;
}
