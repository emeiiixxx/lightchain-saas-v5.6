import { forwardRef, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useLocale } from '../LocaleContext';
import { usePresence } from '../usePresence';
import type { CanvasImage } from '../useCanvas';
import { Button, Divider, Icon, IconButton } from './ui';
import { LoadingSpark } from './LoadingSpark';
import '../print-variation.css';

export type PrintVariationDraft = {
  points: string[];
  mode: 'extend' | 'diverge';
  strength: 'low' | 'medium' | 'high';
  count: number;
};

export type PrintVariationPanelProps = {
  source: CanvasImage;
  phase?: 'enter' | 'exit';
  submitting?: boolean;
  style?: CSSProperties;
  onClose: () => void;
  onGenerate: (draft: PrintVariationDraft) => void;
};

// Demo analysis results; replace this list when the analysis service is connected.
const DESIGN_POINTS = [
  '植物花卉主题', '细腻线描', '花瓣层次', '自然枝叶', '手绘质感', '流畅曲线',
  '疏密对比', '交错布局', '浅色底纹', '柔和配色', '色彩层次', '装饰细节',
];
const STRENGTHS = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
] as const;

export const PrintVariationPanel = forwardRef<HTMLDivElement, PrintVariationPanelProps>(function PrintVariationPanel({
  source, phase = 'enter', submitting = false, style, onClose, onGenerate,
}, ref) {
  const { t } = useLocale();
  const titleId = useId();
  const settingsId = useId();
  const [analysisRun, setAnalysisRun] = useState(0);
  const [analyzing, setAnalyzing] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [customPoints, setCustomPoints] = useState<string[]>([]);
  const [customEditing, setCustomEditing] = useState(false);
  const [customText, setCustomText] = useState('');
  const [mode, setMode] = useState<PrintVariationDraft['mode']>('extend');
  const [strength, setStrength] = useState<PrintVariationDraft['strength']>('low');
  const [count, setCount] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const customInput = useRef<HTMLInputElement>(null);
  const loadingPresence = usePresence(analyzing ? true : null);
  const settingsPresence = usePresence(settingsOpen ? true : null);

  useEffect(() => {
    if (phase === 'exit') return;
    setAnalyzing(true);
    setSelected([]);
    setCustomPoints([]);
    setCustomEditing(false);
    setCustomText('');
    setSettingsOpen(false);
    const timer = window.setTimeout(() => setAnalyzing(false), 3000);
    return () => window.clearTimeout(timer);
  }, [source.id, analysisRun, phase]);

  useEffect(() => {
    if (customEditing) customInput.current?.focus();
  }, [customEditing]);

  useEffect(() => {
    if (!settingsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, [settingsOpen]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (phase === 'exit') return;
      if (customEditing) {
        setCustomEditing(false);
        setCustomText('');
      } else if (settingsOpen) {
        setSettingsOpen(false);
        settingsRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
      } else onClose();
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [customEditing, settingsOpen, phase, onClose]);

  const togglePoint = (point: string) => {
    setSelected(current => current.includes(point) ? current.filter(value => value !== point) : [...current, point]);
  };
  const cancelCustom = () => {
    setCustomEditing(false);
    setCustomText('');
  };
  const confirmCustom = () => {
    const point = customText.trim();
    if (!point) return;
    if (!DESIGN_POINTS.includes(point)) {
      setCustomPoints(current => current.includes(point) ? current : [...current, point]);
    }
    setSelected(current => current.includes(point) ? current : [...current, point]);
    cancelCustom();
  };
  const selectedStrength = STRENGTHS.find(option => option.value === strength)!;
  const unavailable = analyzing || submitting || phase === 'exit';

  return <div
    ref={ref}
    className="print-variation-panel"
    style={style}
    role="region"
    aria-labelledby={titleId}
    aria-busy={analyzing || submitting}
    data-canvas-ui
    data-workbench-menu
    data-phase={phase}
    inert={phase === 'exit'}
  >
    <header className="print-variation-header">
      <div className="print-variation-heading">
        <h2 id={titleId}>{t('印花裂变')}</h2>
        <p><Icon name="tool-info" size={16} />{t('请选择需要保留的设计点，支持多选，必填')}</p>
      </div>
      <IconButton icon="close" size="m" aria-label={t('关闭')} onClick={onClose} />
    </header>
    <div className="print-variation-body">
      <div className="print-variation-controls" inert={unavailable}>
        <div className="print-variation-design-points">
          <img className="print-variation-source" src={source.url} alt={source.name} draggable={false} />
          <div className="print-variation-points" role="group" aria-label={t('设计点')}>
            {DESIGN_POINTS.map(point => <button
              key={point}
              type="button"
              className="print-variation-chip"
              aria-pressed={selected.includes(point)}
              onClick={() => togglePoint(point)}
            >{t(point)}</button>)}
            {customPoints.map(point => <span key={point} className={`print-variation-custom-chip${selected.includes(point) ? ' is-selected' : ''}`}>
              <button type="button" aria-pressed={selected.includes(point)} onClick={() => togglePoint(point)}>{point}</button>
              <button type="button" className="print-variation-remove-point" aria-label={`${t('删除设计点')} ${point}`} onClick={() => {
                setCustomPoints(current => current.filter(value => value !== point));
                setSelected(current => current.filter(value => value !== point));
              }}><Icon name="close" size={16} /></button>
            </span>)}
            {customEditing ? <div className="print-variation-custom-editor">
              <input
                ref={customInput}
                value={customText}
                aria-label={t('自定义设计点')}
                placeholder={t('请输入')}
                onChange={event => setCustomText(event.target.value)}
                onKeyDown={event => {
                  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  event.stopPropagation();
                  confirmCustom();
                }}
              />
              <Button variant="secondary" className="print-variation-custom-action" onClick={cancelCustom}>{t('取消')}</Button>
              <Button variant="primary" className="print-variation-custom-action" disabled={!customText.trim()} onClick={confirmCustom}>{t('确定')}</Button>
            </div> : <Button className="print-variation-add-point" icon="suggestion-add" onClick={() => setCustomEditing(true)}>{t('自定义')}</Button>}
          </div>
        </div>
        <footer className="print-variation-footer">
          <div className="print-variation-options">
            <span className="print-variation-option-label">{t('裂变模式')}</span>
            <div className="print-variation-mode" role="group" aria-label={t('裂变模式')}>
              <button type="button" aria-pressed={mode === 'extend'} onClick={() => setMode('extend')}>{t('设计延伸')}</button>
              <button type="button" aria-pressed={mode === 'diverge'} onClick={() => {
                setMode('diverge');
                setCount(4);
              }}>{t('灵感发散')}</button>
            </div>
            <Divider vertical />
            <div ref={settingsRef} className="print-variation-settings">
              <button
                type="button"
                className="print-variation-settings-trigger"
                aria-expanded={settingsOpen}
                aria-controls={settingsId}
                aria-label={t('生成设置')}
                onClick={() => setSettingsOpen(open => !open)}
              >
                <span className="icon print-variation-parameter-icon" aria-hidden="true" />
                <span>{t('强度')}：{t(selectedStrength.label)}<span className="print-variation-setting-divider">｜</span>{t(`${count}张`)}</span>
                <Icon name="input-expand/chevron-down" size={16} />
              </button>
              {settingsPresence.value && <div id={settingsId} className="print-variation-settings-popup" data-phase={settingsPresence.phase} inert={!settingsOpen}>
                <div className="print-variation-setting-field">
                  <span>{t('裂变强度')}</span>
                  <div className="print-variation-segments" role="group" aria-label={t('裂变强度')}>
                    {STRENGTHS.map(option => <button key={option.value} type="button" aria-pressed={strength === option.value} onClick={() => setStrength(option.value)}>{t(option.label)}</button>)}
                  </div>
                </div>
                <div className="print-variation-setting-field">
                  <span>{t('生成张数')}</span>
                  <div className="print-variation-segments" role="group" aria-label={t('生成张数')}>
                    {[1, 2, 3, 4].map(value => <button key={value} type="button" aria-pressed={count === value} disabled={mode === 'diverge' && value !== 4} onClick={() => setCount(value)}>{value}</button>)}
                  </div>
                </div>
              </div>}
            </div>
          </div>
          <div className="print-variation-actions">
            <Button variant="secondary" className="print-variation-reanalyze" onClick={() => setAnalysisRun(run => run + 1)} disabled={unavailable}>
              <Icon name="prompt-cover-replace" size={20} />{t('重新解析')}
            </Button>
            <Button variant="primary" className="print-variation-generate" disabled={unavailable || !selected.length || customEditing} onClick={() => onGenerate({ points: [...selected], mode, strength, count })}>
              <span>{t('生成')}</span><Icon name="generate-task-star" size={16} /><span>40</span>
            </Button>
          </div>
        </footer>
      </div>
      {loadingPresence.value && <div className="print-variation-loading" role="status" data-phase={loadingPresence.phase}>
        <LoadingSpark />
        <strong>{t('正在解析图案设计点')}</strong>
        <span>{t('识别元素、绘画语言、组织关系与配色特征')}</span>
      </div>}
    </div>
  </div>;
});
