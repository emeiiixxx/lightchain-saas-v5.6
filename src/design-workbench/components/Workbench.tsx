import { EditableFilename } from '../../components/EditableFilename';
import { useInputMemory } from '../useInputMemory';
import { readDemoState, writeDemoState, restoreDemoUrls, rememberDemoAsset } from '../demo-storage';
import { retryRecordTarget } from '../retry-record';
import { PrintPlacementDialog } from './PrintPlacementDialog';
import { TextEditDialog } from './TextEditDialog';
import { renderTextEdit, textSelectionPreview, type TextEditInput } from '../text-edit';
import { CanvasMinimap } from './CanvasMinimap';
import { TaskFeatureTip } from './TaskFeatureTip';
import { DownloadFormatMenu } from './DownloadFormatMenu';
import { ElementSendMenu } from './ElementSendMenu';
import { demoNotice } from '../demo-feedback';
import type { Notify } from '../notification';
import { prepareMainImage, type LibraryImage } from '../asset-library';
import { useLocale } from '../LocaleContext';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Button, Divider, Icon } from './ui';
import { usePresence } from '../usePresence';
import { ElementMenu } from './ElementMenu';
import { FullImageViewer, type FullImageViewerImage } from './FullImageViewer';
import { ImageContextMenu } from './ImageContextMenu';
import { ShortcutsPanel } from './ShortcutsPanel';
import { QuickEditComposer, createQuickEditDraft, type QuickEditDraft, type CanvasEditTool } from './QuickEditComposer';
import { StrokeColorPicker } from './StrokeColorPicker';
import { CanvasLeftPanel, type LeftPanelTab, type GenerationRecord } from './CanvasLeftPanel';
import { type CanvasImage, useCanvas } from '../useCanvas';
import { TaskResultPlaceholder } from './TaskResultPlaceholder';
import { GeneratingPlaceholder } from './GeneratingPlaceholder';
import { initialDemoRecords, PROMO_TASK_SEED_VERSION, restoreTaskExamples } from '../promo-task-records';
import { agentDemoOutput, demoOutputSize, prepareDemoResults, type DemoOutput } from '../demo-generation';
import { runAgentImageSequence } from '../agent-image-sequence';
import { MultiSelectionControls } from './MultiSelectionControls';
import { CanvasArrangeMenu } from './CanvasArrangeMenu';
import { AgentArtwork, AgentConversation, demoConversation, type AgentMessage, type AgentImageResult } from './AgentConversation';
import { AgentRequestStatus } from './AgentRequestStatus';
import { AgentInputArea } from './AgentInputArea';
import { AgentComposerAttachments, type AgentComposerAttachment } from './AgentComposerAttachments';
import { useAgentRequests, type AgentRequest } from '../useAgentRequests';
import { imageBounds } from '../canvas-selection';
import { canvasToolbarPosition, intersectsViewport, screenBounds } from '../canvas-toolbar';
import { IMAGE_FILENAME_TOP_SPACE } from '../canvas-renderer';
import { ShapeToolMenu } from './ShapeToolMenu';
import { useCanvasFilenameTooltip } from '../useCanvasFilenameTooltip';

async function restoreTextEditTags(record: GenerationRecord): Promise<GenerationRecord> {
  const input = record.textEdit;
  if (!input || !record.tags.some(tag => tag.label === '原图（框选区域）')) return record;
  try {
    const source = await prepareMainImage({ id: input.sourceUrl, url: input.sourceUrl, name: '文字编辑原图' });
    const crop = await textSelectionPreview(source.image, input.region);
    return { ...record, tags: record.tags.flatMap(tag => tag.label === '原图（框选区域）'
      ? [{ label: '原图', image: input.sourceUrl }, { label: '框选区域', image: crop }]
      : [tag]) };
  } catch {
    // Keep the saved record intact if its source cannot currently be restored.
    return record;
  }
}

type Board = ReturnType<typeof useCanvas>;
type ComposerAttachment = AgentComposerAttachment & { canvasImageId?: string; lockedAt?: number };
type Props = { board: Board; open: boolean; onOpenChange: (open: boolean) => void; phase: 'enter' | 'exit'; onUpload: (point?: { x: number; y: number }) => void; onReplace: () => void; onHelp: () => void; onNotify: Notify; uploads: LibraryImage[]; onRememberUpload: (image: LibraryImage) => void };
function Tool({ id, icon, label, active, onClick, disabled, size = 20 }: { id?: string; icon: string; label: string; active?: boolean; onClick: () => void; disabled?: boolean; size?: number }) {
  return <Button id={id} aria-label={label} title={label} aria-pressed={active} className={`workbench-tool ${active ? 'is-active' : ''}`} disabled={disabled} onClick={onClick}><Icon name={icon} size={size} /></Button>;
}
function NumberField({ label, prefix, value, min, max, unit, begin, change, disabled }: { label: string; prefix?: string; value: number; min?: number; max?: number; unit?: string; disabled?: boolean; begin: () => void; change: (n: number) => void }) {
  return <label className="property-number">{prefix && <span>{prefix}</span>}<input disabled={disabled} aria-label={label} type="number" value={Math.round(value * 10) / 10} min={min} max={max} step="1" onFocus={begin} onChange={e => { const n = e.currentTarget.valueAsNumber; if (Number.isFinite(n)) change(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />{unit && <span>{unit}</span>}</label>;
}
function SliderField({ label, value, max, unit, brand, begin, change }: { label: string; value: number; max: number; unit?: string; brand?: boolean; begin: () => void; change: (n: number) => void }) {
  const { t } = useLocale();
  return <div className="property-slider"><input type="range" aria-label={label} min="0" max={max} value={value} className={brand ? 'brand-range' : ''} style={{ '--range-progress': `${value / max * 100}%` } as CSSProperties} onPointerDown={begin} onKeyDown={e => { if (!e.repeat && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) begin(); }} onChange={e => change(Number(e.target.value))} /><NumberField label={`${label} ${t("数值")}`} value={value} min={0} max={max} unit={unit} begin={begin} change={change} /></div>;
}

function ImageProperties({ board, onReplace, onAction, rotationLocked, onNotify }: { board: Board; onReplace: () => void; onAction: (text: string) => void; rotationLocked: boolean; onNotify: Notify }) {
  const { t } = useLocale();
  if (board.selectedIds.length > 1) return <div className="properties-empty">{t('已选择')} {board.selectedIds.length} {t(board.images.some(item => board.selectedIds.includes(item.id) && item.shape) ? '个元素' : '张图片')}</div>;
  const item = board.images.find(i => i.id === board.selected);
  if (!item) return <div className="properties-empty properties-empty--unselected"><img src="/assets/design-workbench/properties-empty-selection.png" alt="" width={120} height={120} /><p>{t("请先选择图层")}</p></div>;
  const update = (patch: Partial<CanvasImage>) => board.updateSelected(patch, false);
  const field = (label: string, key: 'x' | 'y' | 'width' | 'height', prefix: string) => <NumberField label={label} prefix={prefix} value={item[key]} min={key === 'width' || key === 'height' ? 1 : undefined} begin={board.beginEdit} change={n => update({ [key]: n })} />;
  return <div className="image-properties" key={item.id}>
    <div className="property-title"><h2 title={item.name}>{item.shape ? t(item.name) : item.generating ? t("生成中") : item.generationFailed ? t("生成失败") : item.name}</h2>{!item.shape && <Button icon="prop-imgLeftIcon" onClick={onReplace}>{t("替换图片")}</Button>}</div>
    {!item.shape && <div className="property-actions">{[['prop-imgNameInpaint', t("局部编辑")], ['prop-imgNameConvertTo3DTile', t("转3D平铺")], ['prop-imgNameImageEdit', t("图片编辑")]].map(([icon, label]) => <button key={label} onClick={() => onAction(label)}><Icon name={icon} size={16} /><span>{label}</span></button>)}</div>}
    <Divider />
    <section className="property-section"><h3>{t("基础参数")}</h3>
      <div className="property-row"><span>{t("位置")}</span><div className="property-pair">{field(t("横坐标"), 'x', 'X')}{field(t("纵坐标"), 'y', 'Y')}</div></div>
      <div className="property-row"><span>{t("尺寸")}</span><div className="property-pair">{field(t("宽度"), 'width', 'W')}{field(t("高度"), 'height', 'H')}</div></div>
      <div className="property-row"><span>{t("变换")}</span><div className="property-pair"><div className="angle-field"><Icon name="prop-imgNameAngle" size={16} /><NumberField label={t("旋转角度")} disabled={rotationLocked} value={item.rotation ?? 0} unit="°" begin={board.beginEdit} change={rotation => update({ rotation })} /></div><div className="property-group"><Tool label={t("水平翻转")} icon="prop-imgIcon1" active={item.flipX} onClick={() => board.updateSelected({ flipX: !item.flipX })} /><Divider vertical /><Tool label={t("垂直翻转")} icon="prop-imgIcon2" active={item.flipY} onClick={() => board.updateSelected({ flipY: !item.flipY })} /></div></div></div>
    </section><Divider />
    {(!item.shape || item.shape.kind === 'rectangle') && <><section className="property-section"><h3>{t("圆角")}</h3><div className="property-row"><span>{t("圆角半径")}</span><SliderField label={t("圆角半径")} value={Math.min(100, item.radius ?? 0)} max={100} brand begin={board.beginEdit} change={radius => update({ radius })} /></div></section><Divider /></>}
    {item.shape && !['line', 'arrow'].includes(item.shape.kind) && <><section className="property-section"><h3>{t("填充")}</h3>
      <div className="property-row"><span>{t("颜色")}</span><StrokeColorPicker color={item.shape.fill} opacity={item.shape.fillOpacity ?? 100} onBegin={board.beginEdit} onChange={patch => update({ shape: { ...item.shape!, fill: patch.stroke ?? item.shape!.fill, fillOpacity: patch.strokeOpacity ?? item.shape!.fillOpacity } })} onNotify={onNotify} /></div>
    </section><Divider /></>}
    <section className="property-section"><h3>{t("描边")}</h3>
      <div className="property-row"><span>{t("颜色")}</span><StrokeColorPicker color={item.stroke} opacity={item.strokeOpacity} onBegin={board.beginEdit} onChange={update} onNotify={onNotify} /></div>
      <div className="property-row"><span>{t("粗细")}</span><SliderField label={t("描边粗细")} value={item.strokeWidth ?? 0} max={100} brand begin={board.beginEdit} change={strokeWidth => update({ strokeWidth })} /></div>
      <div className="property-row"><span>{t("效果")}</span><div className="property-pair"><div className="property-group">{(['solid', 'dashed', 'dotted'] as const).map((style, i) => <Tool key={style} label={[t("实线"), t("虚线"), t("点线")][i]} icon={`prop-imgIcon${i + 4}`} active={item.strokeStyle === style} onClick={() => board.updateSelected({ strokeStyle: style })} />)}</div>{!item.shape && <div className="property-group">{(['inside', 'center', 'outside'] as const).map((align, i) => <Tool key={align} label={[t("内描边"), t("居中描边"), t("外描边")][i]} icon={`prop-imgIcon${i + 7}`} active={item.strokeAlign === align} onClick={() => board.updateSelected({ strokeAlign: align })} />)}</div>}</div></div>
    </section><Divider />
    <section className="property-section"><h3>{t("外观")}</h3><div className="property-row"><span>{t("不透明度")}</span><SliderField label={t("不透明度")} value={item.opacity ?? 100} max={100} unit="%" brand begin={board.beginEdit} change={opacity => update({ opacity })} /></div></section>
  </div>;
}

export function Workbench({ board, open, onOpenChange, phase, onUpload, onReplace, onHelp, onNotify, uploads, onRememberUpload }: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  useCanvasFilenameTooltip(board, setRenamingId);
  const { t, locale } = useLocale();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarSize, setToolbarSize] = useState({ width: 700, height: 42 });
  const [hoveredToolbarAction, setHoveredToolbarAction] = useState<number | null>(null);
  const lastHoveredToolbarAction = useRef(0);
  const hoverToolbarAction = (index: number) => { lastHoveredToolbarAction.current = index; setHoveredToolbarAction(index); };
  const bottomToolsRef = useRef<HTMLDivElement>(null);
  const zoomToolsRef = useRef<HTMLDivElement>(null);
  const [bottomToolsSize, setBottomToolsSize] = useState({ bottom: 0, zoom: 0 });
  const [tab, setTab] = useState<'agent' | 'properties'>('agent');
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const pinnedCanvasIds = new Set(attachments.flatMap(item => item.canvasImageId ? [item.canvasImageId] : []));
  const canvasImagesById = new Map(board.images.map(item => [item.id, item]));
  // Selection is a live preview until the user enters the composer. Keep the
  // canvas ID, not the URL: separate instances of the same image stay distinct.
  const provisionalAttachments = board.selectedIds.flatMap<ComposerAttachment>(id => {
    const item = canvasImagesById.get(id);
    return item && !item.shape && !item.generating && !item.generationFailed && !pinnedCanvasIds.has(id)
      ? [{ id: `canvas:${id}`, canvasImageId: id, name: item.name, kind: 'image', url: item.url, provisional: true }]
      : [];
  });
  const composerAttachments = [...attachments, ...provisionalAttachments];
  const lockCanvasReferences = () => {
    if (board.locked || !board.restored || !provisionalAttachments.length) return;
    const lockedAt = Date.now();
    setAttachments(previous => {
      const pinned = new Set(previous.flatMap(item => item.canvasImageId ? [item.canvasImageId] : []));
      const added = provisionalAttachments.filter(item => !pinned.has(item.canvasImageId!));
      return added.length ? [...previous, ...added.map(item => ({ ...item, provisional: false, locking: true, lockedAt }))] : previous;
    });
  };
  useEffect(() => {
    const ends = attachments.flatMap(item => item.locking && item.lockedAt !== undefined ? [item.lockedAt + 500] : []);
    if (!ends.length) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      setAttachments(previous => previous.map(item => item.locking && item.lockedAt !== undefined && item.lockedAt + 500 <= now
        ? { ...item, locking: false } : item));
    }, Math.max(0, Math.min(...ends) - Date.now()));
    return () => clearTimeout(timer);
  }, [attachments]);
  const removeComposerAttachment = (id: string) => {
    const item = composerAttachments.find(attachment => attachment.id === id);
    setAttachments(previous => previous.filter(attachment => attachment.id !== id));
    // Clearing the selection prevents a removed reference from immediately
    // returning as a provisional chip. This never deletes the canvas image.
    if (item?.canvasImageId && board.selectedIds.includes(item.canvasImageId)) {
      board.selectMany(board.selectedIds.filter(selectedId => selectedId !== item.canvasImageId));
    }
  };
  const attachmentUrls = useRef(new Set<string>());
  useEffect(() => () => { attachmentUrls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const addAttachments = (input: HTMLInputElement, kind: 'file' | 'image') => {
    const files = Array.from(input.files ?? []).filter(file => kind === 'file' || file.type.startsWith('image/'));
    const added = files.map(file => {
      const url = kind === 'image' ? URL.createObjectURL(file) : undefined;
      if (url) {
        attachmentUrls.current.add(url);
        // Accepted Agent tasks retain reference URLs in their local records.
        void rememberDemoAsset(url, file).catch(() => { /* Keep this session usable when local storage is unavailable. */ });
      }
      return { id: crypto.randomUUID(), name: file.name, kind, url };
    });
    setAttachments(prev => [...prev, ...added]);
    input.value = '';
    textarea.current?.focus();
  };
  const [conversationId, setConversationId] = useState('agent-demo-20261028');
  const [conversation, setConversation] = useState<AgentMessage[]>(() => demoConversation.map(message => ({ ...message, conversationId: 'agent-demo-20261028' })));
  const [conversationsRestored, setConversationsRestored] = useState(false);
  const [agentScrolling, setAgentScrolling] = useState(false);
  const agentScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (agentScrollTimer.current) clearTimeout(agentScrollTimer.current); }, []);
  const [savedConversations, setSavedConversations] = useState<AgentMessage[][]>([]);
  useEffect(() => {
    let active = true;
    const saved = readDemoState<{ activeId: string; conversation: AgentMessage[]; savedConversations: AgentMessage[][] } | null>('agent-conversations', null);
    void restoreDemoUrls(saved).then(value => {
      if (!active) return;
      if (value) {
        setConversationId(value.activeId);
        setConversation(value.conversation.map(message => ({ ...message, conversationId: value.activeId })));
        setSavedConversations(value.savedConversations.map((messages, index) => {
          const id = messages.find(message => message.conversationId)?.conversationId ?? `agent-history-${index}`;
          return messages.map(message => ({ ...message, conversationId: id }));
        }));
      }
      setConversationsRestored(true);
    }).catch(() => { if (active) setConversationsRestored(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (conversationsRestored) writeDemoState('agent-conversations', { activeId: conversationId, conversation, savedConversations });
  }, [conversationId, conversation, savedConversations, conversationsRestored]);
  const archiveConversation = (nextId?: string) => setSavedConversations(previous => {
    const retained = previous.filter(messages => messages[0]?.conversationId !== conversationId && messages[0]?.conversationId !== nextId);
    return conversation.length ? [...retained, conversation] : retained;
  });
  const [menu, setMenu] = useState<string | null>(null);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const shownMinimap = usePresence(minimapOpen && !board.locked ? true : null);
  const [leftTab, setLeftTab] = useState<LeftPanelTab | null>(null);
  useLayoutEffect(() => {
    const bottom = bottomToolsRef.current;
    const zoom = zoomToolsRef.current;
    if (!bottom || !zoom) return;
    const update = () => setBottomToolsSize(previous => {
      const next = { bottom: bottom.offsetWidth, zoom: zoom.offsetWidth };
      return previous.bottom === next.bottom && previous.zoom === next.zoom ? previous : next;
    });
    const observer = new ResizeObserver(update);
    observer.observe(bottom);
    observer.observe(zoom);
    update();
    return () => observer.disconnect();
  }, []);
  let bottomToolsShift = 0;
  let bottomToolsBottom = 16;
  if (open && board.size.width > 1300 && bottomToolsSize.bottom && bottomToolsSize.zoom) {
    const centeredLeft = (board.size.width - bottomToolsSize.bottom) / 2;
    const leftLimit = leftTab ? 432 : 16;
    const rightLimit = board.size.width - 432 - bottomToolsSize.zoom - 16 - bottomToolsSize.bottom;
    if (rightLimit < leftLimit) bottomToolsBottom = 80;
    else bottomToolsShift = centeredLeft - Math.max(leftLimit, Math.min(centeredLeft, rightLimit));
  }
  const [generationRecords, setGenerationRecords] = useState<GenerationRecord[]>(initialDemoRecords);
  // Removing a list entry does not erase the accepted task behind its canvas results.
  const archivedRecords = useRef(new Map<string, GenerationRecord>());
  const [recordsRestored, setRecordsRestored] = useState(false);
  const resumedResults = useRef(new Set<string>());
  useEffect(() => {
    let active = true;
    void restoreDemoUrls(readDemoState<{ records: GenerationRecord[]; archived: [string, GenerationRecord][]; seedVersion?: string } | null>('tasks', null)).then(async saved => {
      if (!active) return;
      if (saved) {
        const [savedRecords, savedArchived] = await Promise.all([
          Promise.all(saved.records.map(restoreTextEditTags)),
          Promise.all(saved.archived.map(async ([id, record]): Promise<[string, GenerationRecord]> => [id, await restoreTextEditTags(record)])),
        ]);
        if (!active) return;
        const records = restoreTaskExamples(savedRecords, saved.seedVersion);
        const retainedIds = new Set(records.map(record => record.id));
        archivedRecords.current = new Map(savedArchived);
        for (const record of savedRecords) {
          if (!retainedIds.has(record.id) && !archivedRecords.current.has(record.id)) {
            archivedRecords.current.set(record.id, record);
          }
        }
        setGenerationRecords(records);
      }
      setRecordsRestored(true);
    }).catch(() => { if (active) setRecordsRestored(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (recordsRestored) writeDemoState('tasks', { seedVersion: PROMO_TASK_SEED_VERSION, records: generationRecords, archived: [...archivedRecords.current] }); }, [generationRecords, recordsRestored]);
  const openLeftPanel = (value: LeftPanelTab) => { setLeftTab(value); };
  const updateAgentRecord = (id: string, update: (record: GenerationRecord) => GenerationRecord) => {
    setGenerationRecords(previous => previous.map(record => record.id === id ? update(record) : record));
    const archived = archivedRecords.current.get(id);
    if (archived) archivedRecords.current.set(id, update(archived));
  };
  const runAgentBatch = (id: string, title: string, settings: DemoOutput, agentConversationId: string, startIndex: number, first?: CanvasImage, sourceIds: string[] = []) => {
    activeAgentBatches.current.add(id);
    void runAgentImageSequence({
      count: settings.count, startIndex,
      active: () => generationMounted.current,
      start: index => {
        const placeholder = index === startIndex && first ? first : board.beginGeneration(undefined, 1, {
          name: title, taskRecordId: id, outputSize: demoOutputSize(settings), placement: 'agent', agentConversationId, generationIndex: index, sourceIds,
        })[0];
        if (!placeholder) return undefined;
        if (placeholder !== first) updateAgentRecord(id, record => ({
          ...record, generating: true, agentStartedCount: index + 1,
          images: [...record.images, { id: placeholder.id, url: placeholder.url, height: 92 * placeholder.height / placeholder.width, status: 'generating' }],
        }));
        return placeholder;
      },
      generate: async (index, placeholder) => {
        const delay = new Promise<void>(resolve => {
          const timer = setTimeout(() => { generationTimers.current.delete(timer); resolve(); }, 3000);
          generationTimers.current.add(timer);
        });
        const [assets] = await Promise.all([prepareDemoResults({ ...settings, count: 1, startIndex: index }), delay]);
        return { ...assets[0], name: placeholder.name };
      },
      settle: (index, placeholder, result) => {
        board.finishGeneration([placeholder.id], result ? [result] : null, true);
        updateAgentRecord(id, record => ({
          ...record, generating: index + 1 < settings.count,
          images: record.images.map(image => image.id === placeholder.id ? {
            ...image, status: result ? 'success' : 'failed',
            ...(result ? { url: result.url, height: 92 * result.height / result.width } : {}),
          } : image),
        }));
        if (!result) onNotify('生成失败，请重试', 'error');
      },
    }).finally(() => {
      activeAgentBatches.current.delete(id);
      if (generationMounted.current) updateAgentRecord(id, record => ({ ...record, generating: false }));
    });
  };
  const acceptAgentRequest = async ({ id, text: request, title, images, sourceIds = [], settings: requestedSettings, conversationId: agentConversationId }: AgentRequest, current: () => boolean) => {
    if (board.locked || !board.restored || !recordsRestored) return false;
    let settings = requestedSettings;
    // Auto uses the first reference's actual ratio. Until decoded, thinking stays
    // visible and neither the conversation nor canvas gets a guessed-size tile.
    if ((!settings.ratio || settings.ratio === 'auto') && images[0]) {
      const reference = await prepareMainImage({ id: images[0], url: images[0], name: '参考图' });
      settings = { ...settings, sourceSize: { width: reference.width, height: reference.height } };
    }
    if (!current() || !generationMounted.current) return false;
    const placeholders = board.beginGeneration(undefined, 1, { name: title, taskRecordId: id, outputSize: demoOutputSize(settings), placement: 'agent', agentConversationId, generationIndex: 0, sourceIds });
    if (!placeholders.length) return false;
    const bindTask = (messages: AgentMessage[]) => messages.map(message => message.requestId === id ? { ...message, taskId: id } : message);
    setConversation(bindTask);
    setSavedConversations(previous => previous.map(bindTask));
    const now = new Date();
    const time = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setGenerationRecords(previous => [{
      id, title, time, prompt: request, canvasEntry: 'agent', replayable: true, agentConversationId, agentSettings: settings, agentStartedCount: 1, sourceIds,
      generating: true, count: settings.count, ratio: settings.ratio, resolution: settings.resolution,
      resultRatio: `${placeholders[0].width} / ${placeholders[0].height}`,
      tags: images.map(image => ({ label: '参考图', image })),
      images: placeholders.map(item => ({ id: item.id, url: item.url, height: 92 * item.height / item.width, status: 'generating' })),
    }, ...previous]);
    runAgentBatch(id, title, settings, agentConversationId, 0, placeholders[0], sourceIds);
    return true;
  };
  const agentRequests = useAgentRequests(acceptAgentRequest);
  const activeAgentRequestId = conversation.find(message => message.requestId && agentRequests.states[message.requestId])?.requestId;
  const agentRequestState = activeAgentRequestId ? agentRequests.states[activeAgentRequestId] : null;
  const recordGenerationRequest = (request: string, title = 'AI助手', images: string[] = [], settings = agentDemoOutput(request), sourceIds: string[] = []) => {
    if (board.locked || !board.restored || !recordsRestored || !conversationsRestored || activeAgentRequestId) return false;
    const id = crypto.randomUUID();
    // Pin identity at send time; selection can change while the request thinks.
    const capturedSourceIds = [...new Set(sourceIds)];
    setConversation(previous => [...previous, { role: 'user', text: request, images, conversationId, sourceIds: capturedSourceIds }, { role: 'assistant', text: '', requestId: id, conversationId, sourceIds: capturedSourceIds }]);
    agentRequests.submit({ id, text: request, title, images, settings, conversationId, sourceIds: capturedSourceIds });
    return true;
  };
  const stopAgentRequest = () => {
    if (!activeAgentRequestId) return;
    agentRequests.stop(activeAgentRequestId);
    const stopReply = (messages: AgentMessage[]) => messages.map(message => message.requestId === activeAgentRequestId ? { ...message, text: '已停止', requestId: undefined } : message);
    setConversation(stopReply);
    setSavedConversations(previous => previous.map(stopReply));
  };
  const [printPlacement, setPrintPlacement] = useState<{ source: CanvasImage; draft: QuickEditDraft } | null>(null);
  const shownPrintPlacement = usePresence(printPlacement);
  const [textEdit, setTextEdit] = useState<CanvasImage | null>(null);
  const shownTextEdit = usePresence(textEdit);
  const [localEdit, setLocalEdit] = useState<string | null>(null);
  const [localEditTool, setLocalEditTool] = useState<CanvasEditTool>('局部修改');

  const closeLocalEdit = () => { setLocalEdit(null); board.setInteractionLocked(false); };
  const [quickEdit, setQuickEdit] = useState<string | null>(null);
  const shownElementToolbar = usePresence(!localEdit && !quickEdit && board.images.some(image => image.id === board.selected && !image.generating && !image.generationFailed) ? board.selected : null);
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const observer = new ResizeObserver(() => setToolbarSize({ width: toolbar.offsetWidth, height: toolbar.offsetHeight }));
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [board.selected, shownElementToolbar.value, shownElementToolbar.phase, locale]);
  useLayoutEffect(() => {
    board.setQuickEditing(quickEdit);
    return () => board.setQuickEditing(null);
  }, [quickEdit, board.setQuickEditing]);
  useEffect(() => { setQuickEdit(null); }, [board.blankClickVersion]);
  useLayoutEffect(() => {
    board.setIsolatedImageId(localEdit);
    return () => board.setIsolatedImageId(null);
  }, [localEdit, board.setIsolatedImageId]);
  // R02 persists changed inputs silently; exit and submit also retry any pending save.
  const inputMemory = useInputMemory(localEdit ? `${localEditTool}:${localEdit}` : quickEdit ? `quick:${quickEdit}` : null);
  const generationTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const activeAgentBatches = useRef(new Set<string>());
  const retryingResults = useRef(new Set<string>());
  const generatingSources = useRef(new Set<string>());
  const generationMounted = useRef(true);
  useEffect(() => {
    generationMounted.current = true;
    void prepareDemoResults().catch(() => { /* A submission can retry loading demo assets. */ });
    return () => {
      generationMounted.current = false;
      generationTimers.current.forEach(clearTimeout);
      generationTimers.current.clear();
    };
  }, []);
  const finishDemoBatch = (recordId: string, placeholders: CanvasImage[], results: Omit<CanvasImage, 'x' | 'y'>[]) => {
    // Existing quick-edit examples retain their retryable failure; Agent tasks
    // complete all reserved slots unless asset preparation actually fails.
    const simulateFailure = results.length === 4 && placeholders[0]?.generationPlacement !== 'agent';
    const images: GenerationRecord['images'] = results.map((result, index) => ({
      id: placeholders[index].id, url: result.url,
      height: simulateFailure && index === 2 ? 92 * placeholders[index].height / placeholders[index].width : 92 * result.image.naturalHeight / result.image.naturalWidth,
      status: simulateFailure && index === 2 ? 'failed' : 'success',
    }));
    board.finishGeneration(placeholders.map(item => item.id), results.map((result, index) => images[index].status === 'failed' ? null : result), true);
    setGenerationRecords(previous => previous.map(record => record.id === recordId ? { ...record, generating: false, images: images.filter(image => record.images.some(current => current.id === image.id)) } : record));
    const archived = archivedRecords.current.get(recordId);
    if (archived) archivedRecords.current.set(recordId, { ...archived, generating: false, images });
  };
  const failDemoBatch = (id: string, placeholders: CanvasImage[]) => {
    board.finishGeneration(placeholders.map(item => item.id), null, true);
    const failed = (record: GenerationRecord): GenerationRecord => ({ ...record, generating: false, images: record.images.map(image => ({ ...image, status: 'failed' })) });
    const archived = archivedRecords.current.get(id);
    if (archived) archivedRecords.current.set(id, failed(archived));
    setGenerationRecords(previous => previous.map(record => record.id === id ? failed(record) : record));
  };
  const generateTextEdit = async (input: TextEditInput, prompt: string, sourceId?: string) => {
    const source = board.images.find(image => image.id === sourceId);
    if (sourceId && generatingSources.current.has(sourceId)) throw new Error('generation_pending');
    const loadedInput = source?.url === input.sourceUrl ? source : await prepareMainImage({ id: input.sourceUrl, url: input.sourceUrl, name: '文字编辑原图' });
    const selectionPreview = await textSelectionPreview(loadedInput.image, input.region);
    if (!generationMounted.current) return;
    const id = crypto.randomUUID();
    const placeholders = board.beginGeneration(sourceId, 1, { name: '文字编辑', taskRecordId: id, sourceSize: input, outputSize: { width: input.width, height: input.height } });
    if (!placeholders.length) throw new Error('generation_unavailable');
    if (sourceId) generatingSources.current.add(sourceId);
    const now = new Date();
    const time = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const record: GenerationRecord = {
      id, title: '文字编辑', time, sourceId, textEdit: input, supportsPrompt: true, prompt, replayable: true,
      generating: true, count: 1, resultRatio: `${input.width} / ${input.height}`,
      tags: [{ label: '原图', image: input.sourceUrl }, { label: '框选区域', image: selectionPreview }],
      images: placeholders.map(item => ({ id: item.id, url: input.sourceUrl, height: 92 * input.height / input.width, status: 'generating' })),
    };
    setGenerationRecords(previous => [record, ...previous]);
    setTextEdit(null);
    const delay = new Promise<void>(resolve => {
      const timer = setTimeout(() => { generationTimers.current.delete(timer); resolve(); }, 1800);
      generationTimers.current.add(timer);
    });
    const render = renderTextEdit(input, prompt).then(url => prepareMainImage({ id: url, url, name: '文字编辑结果' }));
    void Promise.all([render, delay]).then(([result]) => {
      if (generationMounted.current) finishDemoBatch(id, placeholders, [result]);
    }).catch(() => {
      if (generationMounted.current) { failDemoBatch(id, placeholders); onNotify('生成失败，请重试', 'error'); }
    }).finally(() => { if (sourceId) generatingSources.current.delete(sourceId); });
  };
  const generateQuickEdit = async (request: string, draft: QuickEditDraft, sourceId: string, independent = false) => {
    inputMemory.flush();
    const source = board.images.find(item => item.id === sourceId);
    if (!source || generatingSources.current.has(sourceId)) return;
    const count = Math.min(4, Math.max(1, Number(draft.count) || 1));
    const id = crypto.randomUUID();
    const settings = { ratio: draft.ratio, resolution: draft.resolution, sourceSize: { width: source.image.naturalWidth, height: source.image.naturalHeight }, count };
    const sourceIds = [sourceId, ...draft.references.flatMap(reference => board.images.some(item => item.id === reference.id) ? [reference.id] : [])];
    if (independent) closeLocalEdit();
    const placeholders = board.beginGeneration(sourceId, count, { name: independent ? localEditTool : '快捷编辑', taskRecordId: id, sourceIds, outputSize: demoOutputSize(settings) });
    if (!placeholders.length) return;
    generatingSources.current.add(sourceId);
    const now = new Date();
    const time = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const isPrint = independent && localEditTool === '印花上身';
    const supportsPrompt = !isPrint;
    setGenerationRecords(previous => [{ id, replayable: true, sourceId, sourceIds, title: independent ? `款式 - ${localEditTool}` : '快捷编辑', time, supportsPrompt, printMode: isPrint ? (draft.printMode ?? 'position') : undefined, prompt: supportsPrompt ? (draft.value.trim() || undefined) : undefined, generating: true, count, resultHeight: 92 * placeholders[0].height / placeholders[0].width, ratio: draft.ratio, resolution: draft.resolution, tags: [{ label: '服装图', image: source.url }, ...draft.references.map(ref => ({ label: independent && localEditTool === 'AI试衣' ? '模特图' : independent && localEditTool === '印花上身' ? '印花图' : '参考图', image: ref.url })), ...(isPrint ? [{ label: draft.printMode === 'repeat' ? '满印' : '指定位置' }] : [])], images: placeholders.map(item => ({ id: item.id, url: item.url, height: 92 * item.height / item.width, status: 'generating' })) }, ...previous]);
    if (!independent) setConversation(previous => [...previous, { role: 'user', text: request, conversationId }, { role: 'assistant', text: '已记录设计需求。当前为交互 Demo，暂未接入 AI 生成。', conversationId }]);
    setQuickEdit(null);
    // C01 places the batch below all current canvas elements before rendering.
    // Decode in parallel with the demo delay, so loading starts immediately and lasts 3s.
    const delay = new Promise<void>(resolve => {
      const timer = setTimeout(() => { generationTimers.current.delete(timer); resolve(); }, 3000);
      generationTimers.current.add(timer);
    });
    try {
      const [assets] = await Promise.all([prepareDemoResults(settings), delay]);
      if (!generationMounted.current) return;
      const results = assets.slice(0, count);
      finishDemoBatch(id, placeholders, results);
    } catch {
      if (!generationMounted.current) return;
      failDemoBatch(id, placeholders);
      onNotify('图片加载失败，请重试', 'error');
    } finally {
      generatingSources.current.delete(sourceId);
    }
  };
  const retryResult = async (record: GenerationRecord, index: number) => {
    const result = record.images[index];
    if (!result?.id || result.status !== 'failed' || board.locked) throw new Error('retry_unavailable');
    const key = `${record.id}:${result.id}`;
    if (retryingResults.current.has(key)) throw new Error('retry_unavailable');
    const target = retryRecordTarget(generationRecords, record, result, crypto.randomUUID(), new Date());
    const targetKey = `${target.record.id}:${result.id}`;
    const placeholder = board.beginResultRetry(key, targetKey);
    if (!placeholder) throw new Error('retry_unavailable');
    retryingResults.current.add(key);
    retryingResults.current.add(targetKey);
    if (target.isNew) {
      setGenerationRecords(previous => [target.record, ...previous]);
      if (record.canvasEntry === 'agent') setConversation(previous => [...previous, { role: 'assistant', text: '', taskId: target.record.id, conversationId }]);
    }
    const updateStatus = (status: 'generating' | 'failed' | 'success', loaded?: Omit<CanvasImage, 'x' | 'y'>) => {
      const patch = { status, ...(loaded ? { url: loaded.url } : {}), height: loaded ? 92 * loaded.image.naturalHeight / loaded.image.naturalWidth : 92 * placeholder.height / placeholder.width };
      const archived = archivedRecords.current.get(target.record.id);
      if (archived) archivedRecords.current.set(target.record.id, { ...archived, images: archived.images.map(image => image.id === result.id ? { ...image, ...patch } : image) });
      setGenerationRecords(previous => previous.map(item => item.id === target.record.id
        ? { ...item, images: item.images.map(image => image.id === result.id ? { ...image, ...patch } : image) }
        : item));
    };
    updateStatus('generating');
    board.setSelected(null);
    board.focusAgentResults([targetKey]);
    const delay = new Promise<void>(resolve => {
      const timer = setTimeout(() => { generationTimers.current.delete(timer); resolve(); }, 2400);
      generationTimers.current.add(timer);
    });
    try {
      const retryOutput = record.textEdit
        ? renderTextEdit(record.textEdit, record.prompt ?? '').then(url => prepareMainImage({ id: result.id!, url, name: t(record.title) }))
        : record.demoOutputUrls?.length
        ? prepareMainImage({ id: result.id!, url: result.url, name: placeholder.name })
        : prepareDemoResults({ count: 1, startIndex: placeholder.generationIndex ?? index, ratio: record.ratio, resolution: record.resolution, sourceSize: placeholder, outputSize: { width: placeholder.width, height: placeholder.height } }).then(assets => ({ ...assets[0], name: placeholder.name }));
      const [loaded] = await Promise.all([retryOutput, delay]);
      if (generationMounted.current) {
        board.finishGeneration([placeholder.id], [loaded]);
        updateStatus('success', loaded);
      }
      return loaded;
    } catch (error) {
      if (generationMounted.current) {
        board.finishGeneration([placeholder.id], null, true);
        updateStatus('failed');
      }
      throw error;
    } finally { retryingResults.current.delete(key); retryingResults.current.delete(targetKey); }
  };
  const retryCanvasImage = (key: string) => {
    const record = [...generationRecords, ...archivedRecords.current.values()].find(item => item.images.some(result => `${item.id}:${result.id}` === key));
    if (!record) { onNotify('生成失败，请重试', 'error'); return; }
    const index = record.images.findIndex(result => `${record.id}:${result.id}` === key);
    if (record.images[index]?.status !== 'failed') return;
    void retryResult(record, index).catch(() => onNotify('生成失败，请重试', 'error'));
  };
  const regenerateRecord = async (record: GenerationRecord) => {
    if (!record.replayable || record.generating || record.pending) return;
    if (record.canvasEntry === 'agent') {
      const settings: DemoOutput = record.agentSettings ?? { count: record.count ?? Math.max(1, record.images.length), ratio: record.ratio, resolution: record.resolution, sourceSize: { width: 2, height: 3 } };
      recordGenerationRequest(record.prompt ?? '', record.title, record.tags.flatMap(tag => tag.image ? [tag.image] : []), settings, record.sourceIds);
      return;
    }
    if (record.textEdit) {
      try { await generateTextEdit(record.textEdit, record.prompt ?? '', record.sourceId); }
      catch { onNotify('提交失败，请重试', 'error'); }
      return;
    }
    const source = board.images.find(image => image.id === record.sourceId);
    const id = crypto.randomUUID();
    const count = record.count ?? Math.max(1, record.images.length);
    let sourceSize: { width: number; height: number } | undefined;
    if (!source) {
      const inputUrl = record.tags.find(tag => tag.image)?.image;
      if (inputUrl) {
        try {
          const input = await prepareMainImage({ id: inputUrl, url: inputUrl, name: record.title });
          sourceSize = { width: input.width, height: input.height };
        } catch { /* An unavailable historical input uses the default loading size. */ }
      }
      if (!generationMounted.current) return;
    }
    const settings: DemoOutput = { ratio: record.ratio, resolution: record.resolution, sourceSize: source ? { width: source.image.naturalWidth, height: source.image.naturalHeight } : sourceSize ?? { width: 2, height: 3 }, count };
    let fixedOutputs: Omit<CanvasImage, 'x' | 'y'>[] | undefined;
    if (record.demoOutputUrls?.length) {
      const outputUrls = record.demoOutputUrls;
      try { fixedOutputs = await Promise.all(Array.from({ length: count }, (_, index) => {
        const url = outputUrls[index % outputUrls.length];
        return prepareMainImage({ id: url, url, name: record.title });
      })); }
      catch { onNotify('图片加载失败，请重试', 'error'); return; }
      if (!generationMounted.current) return;
    }
    const placeholders = board.beginGeneration(source?.id ?? record.sourceId, count, { name: record.title, taskRecordId: id, sourceSize, sourceIds: record.sourceIds, outputSize: demoOutputSize(settings), outputSizes: fixedOutputs?.map(item => ({ width: item.width, height: item.height })) });
    if (!placeholders.length) return;
    const now = new Date();
    const time = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setGenerationRecords(previous => [{ ...record, id, sourceId: source?.id ?? record.sourceId, time, generating: true, pending: false, failed: false, count, resultHeight: 92 * placeholders[0].height / placeholders[0].width, images: placeholders.map(item => ({ id: item.id, url: item.url, height: 92 * item.height / item.width, status: 'generating' })), tags: record.tags.map(tag => ({ ...tag })) }, ...previous]);
    const delay = new Promise<void>(resolve => {
      const timer = setTimeout(() => { generationTimers.current.delete(timer); resolve(); }, 3000);
      generationTimers.current.add(timer);
    });
    try {
      const outputRequest = fixedOutputs ? Promise.resolve(fixedOutputs) : prepareDemoResults(settings);
      const [assets] = await Promise.all([outputRequest, delay]);
      if (!generationMounted.current) return;
      const results = Array.from({ length: count }, (_, index) => assets[index % assets.length]);
      finishDemoBatch(id, placeholders, results);
    } catch {
      if (!generationMounted.current) return;
      failDemoBatch(id, placeholders);
      onNotify('图片加载失败，请重试', 'error');
    }
  };
  useEffect(() => {
    if (!recordsRestored || !board.restored) return;
    for (const record of [...generationRecords, ...archivedRecords.current.values()]) {
      if (record.canvasEntry === 'agent' && record.generating && record.agentSettings) {
        const batchKey = `batch:${record.id}`;
        if (activeAgentBatches.current.has(record.id) || resumedResults.current.has(batchKey)) continue;
        resumedResults.current.add(batchKey);
        const pending = record.images.find(result => result.status === 'generating');
        const tile = pending && board.images.find(image => image.taskResultId === `${record.id}:${pending.id}` && image.generating);
        if (pending && !tile) updateAgentRecord(record.id, value => ({ ...value, images: value.images.map(image => image.id === pending.id ? { ...image, status: 'failed' } : image) }));
        const nextIndex = tile?.generationIndex ?? (tile ? Math.max(0, (record.agentStartedCount ?? record.images.length) - 1) : record.agentStartedCount ?? record.images.length);
        runAgentBatch(record.id, record.title, record.agentSettings, record.agentConversationId ?? `legacy-agent:${record.id}`, nextIndex, tile || undefined, record.sourceIds);
        continue;
      }
      for (const result of record.images) {
        const key = `${record.id}:${result.id}`;
        const tile = board.images.find(image => image.taskResultId === key && image.generating);
        if (!tile || result.status !== 'generating' || resumedResults.current.has(key)) continue;
        // Only recover placeholders loaded from storage, not currently running submissions.
        if (generationTimers.current.size || activeAgentBatches.current.size || retryingResults.current.size || generatingSources.current.size) continue;
        resumedResults.current.add(key);
        const demoUrl = record.demoOutputUrls?.[record.images.indexOf(result) % record.demoOutputUrls.length];
        const recoveredAssets = record.textEdit
          ? renderTextEdit(record.textEdit, record.prompt ?? '').then(url => prepareMainImage({ id: url, url, name: record.title })).then(asset => [asset])
          : demoUrl ? prepareMainImage({ id: demoUrl, url: demoUrl, name: record.title }).then(asset => [asset]) : prepareDemoResults({ ratio: record.ratio, resolution: record.resolution, sourceSize: tile, outputSize: { width: tile.width, height: tile.height }, startIndex: tile.generationIndex ?? record.images.indexOf(result), count: 1 });
        void recoveredAssets.then(assets => {
          if (!generationMounted.current) return;
          const loaded = record.canvasEntry === 'agent' ? { ...assets[0], name: tile.name } : assets[0];
          board.finishGeneration([tile.id], [loaded], true);
          const complete = (item: GenerationRecord) => ({ ...item, generating: false, images: item.images.map(image => image.id === result.id ? { ...image, url: loaded.url, height: 92 * loaded.image.naturalHeight / loaded.image.naturalWidth, status: 'success' as const } : image) });
          setGenerationRecords(previous => previous.map(item => item.id === record.id ? complete(item) : item));
          const archived = archivedRecords.current.get(record.id);
          if (archived) archivedRecords.current.set(record.id, complete(archived));
        }).catch(() => { resumedResults.current.delete(key); });
      }
    }
  }, [recordsRestored, board.restored]);
  const quickEditVisible = usePresence(quickEdit === board.selected ? quickEdit : null);
  const rotationLocked = !!localEdit || !!quickEdit;
  useEffect(() => { setQuickEdit(null); }, [board.selected]);
  const [preview, setPreview] = useState<FullImageViewerImage | null>(null);
  const shownPanel = usePresence(open ? true : null);
  const switcherRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    const switcher = switcherRef.current;
    if (!switcher) return;
    const updateIndicator = () => {
      const active = switcher.querySelector<HTMLButtonElement>('[aria-selected="true"]');
      if (!active) return;
      setIndicatorStyle({ left: active.offsetLeft, top: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight });
    };
    updateIndicator();
    const observer = new ResizeObserver(updateIndicator);
    observer.observe(switcher);
    switcher.querySelectorAll('button').forEach(button => observer.observe(button));
    return () => observer.disconnect();
  }, [shownPanel.value, tab, locale]);
  useEffect(() => {
    if (menu !== 'conversations') return;
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.conversation-menu-anchor')) setMenu(null);
    };
    window.addEventListener('pointerdown', closeOutside, true);
    return () => window.removeEventListener('pointerdown', closeOutside, true);
  }, [menu]);
  const shownMenu = usePresence(menu);
  const zoomPercent = Math.round(board.camera.zoom * 100);
  const zoomOptions = [...new Set([10, 30, 50, 100, 200, zoomPercent])].sort((a, b) => a - b);
  const shownPreview = usePresence(preview);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const selected = board.images.find(i => i.id === board.selected);
  const hovered = !board.locked && !board.isolationActive && !board.selectedIds.includes(board.hoveredId ?? '')
    ? board.images.find(item => item.id === board.hoveredId) : undefined;
  const selectedInView = !!selected && intersectsViewport(screenBounds(imageBounds(selected), board.camera), board.size);
  const noContentInView = board.images.length > 0 && !board.images.some(item => intersectsViewport(screenBounds(imageBounds(item), board.camera), board.size));
  const returnHint = usePresence(noContentInView && !localEdit ? true : null);
  useEffect(() => { if (selected && !selectedInView) setMenu(null); }, [selectedInView, selected?.id]);
  const transform = useRef<{ item: CanvasImage; x: number; y: number; handle: string; angle: number } | null>(null);
  useEffect(() => { const close = (e: PointerEvent) => { if (!(e.target instanceof Element) || !e.target.closest('[data-workbench-menu]')) setMenu(null); }; const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); }; window.addEventListener('pointerdown', close); window.addEventListener('keydown', escape); return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', escape); }; }, []);
  const action = (text: string) => { setTab('agent'); onOpenChange(true); setPrompt(text); setMenu(null); requestAnimationFrame(() => textarea.current?.focus()); };
  const toggleMenu = (name: string) => setMenu(menu === name ? null : name);
  const startTransform = (e: ReactPointerEvent<HTMLButtonElement>, handle: string) => {
    if (!selected || (handle === 'rotate' && rotationLocked)) return; e.preventDefault(); e.stopPropagation(); board.beginEdit(); e.currentTarget.setPointerCapture(e.pointerId);
    if (handle === 'rotate') e.currentTarget.dataset.rotating = 'true';
    const rect = board.canvasRef.current!.getBoundingClientRect();
    const cx = rect.left + (selected.x + selected.width / 2) * board.camera.zoom + board.camera.x, cy = rect.top + (selected.y + selected.height / 2) * board.camera.zoom + board.camera.y;
    transform.current = { item: selected, x: e.clientX, y: e.clientY, handle, angle: Math.atan2(e.clientY - cy, e.clientX - cx) };
  };
  const moveTransform = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = transform.current; if (!drag) return;
    const item = drag.item, angle = (item.rotation ?? 0) * Math.PI / 180;
    if (drag.handle === 'rotate') {
      if (rotationLocked) return;
      const rect = board.canvasRef.current!.getBoundingClientRect(); const cx = rect.left + (item.x + item.width / 2) * board.camera.zoom + board.camera.x, cy = rect.top + (item.y + item.height / 2) * board.camera.zoom + board.camera.y;
      let rotation = (item.rotation ?? 0) + (Math.atan2(e.clientY - cy, e.clientX - cx) - drag.angle) * 180 / Math.PI;
      if (e.shiftKey) rotation = Math.round(rotation / 15) * 15;
      board.updateSelected({ rotation }, false); return;
    }
    const sx = (e.clientX - drag.x) / board.camera.zoom, sy = (e.clientY - drag.y) / board.camera.zoom;
    const dx = sx * Math.cos(angle) + sy * Math.sin(angle), dy = -sx * Math.sin(angle) + sy * Math.cos(angle);
    const h = drag.handle;
    let width = Math.max(8, item.width + (h.includes('r') ? dx : h.includes('l') ? -dx : 0));
    let height = Math.max(8, item.height + (h.includes('b') ? dy : h.includes('t') ? -dy : 0));
    if (e.shiftKey && h.length === 2) height = width * item.height / item.width;
    const ox = (width - item.width) / 2 * (h.includes('l') ? -1 : h.includes('r') ? 1 : 0), oy = (height - item.height) / 2 * (h.includes('t') ? -1 : h.includes('b') ? 1 : 0);
    board.updateSelected({ width, height, x: item.x + item.width / 2 + ox * Math.cos(angle) - oy * Math.sin(angle) - width / 2, y: item.y + item.height / 2 + ox * Math.sin(angle) + oy * Math.cos(angle) - height / 2 }, false);
  };
  const unavailable = () => { setMenu(null); onNotify(demoNotice(locale)); };
  const agentMessages = conversation.filter(message => !message.requestId || message.taskId || message.text).map(message => {
    if (!message.taskId) return { ...message, results: message.results?.map(result => ({ ...result, sourceIds: result.sourceIds ?? message.sourceIds, agentConversationId: result.agentConversationId ?? message.conversationId ?? conversationId, ...board.lookupImageFilename(result.id) })) };
    const record = generationRecords.find(record => record.id === message.taskId) ?? archivedRecords.current.get(message.taskId);
    return { ...message, results: record?.images.map((result, index): AgentImageResult => ({
      id: `${record.id}:${result.id}`, agentConversationId: record.agentConversationId ?? message.conversationId ?? conversationId, sourceIds: record.sourceIds ?? message.sourceIds, url: result.url, name: `${record.title} · ${index + 1}.png`,
      width: 92, height: result.height, status: result.status,
      ...board.lookupImageFilename(`${record.id}:${result.id}`),
    })) };
  });
  const sendAgentResultToCanvas = async (result: AgentImageResult, loaded?: HTMLImageElement) => {
    if (board.locked || !board.restored || result.status === 'generating' || result.status === 'failed') return;
    // Existing results can be focused even if their old conversation URL is no
    // longer loadable; placement always uses the current canvas instance.
    if (board.focusAgentResults([result.id])) return;
    try {
      const asset = loaded
        ? { image: loaded, url: loaded.currentSrc || loaded.src, width: loaded.naturalWidth, height: loaded.naturalHeight, name: result.name }
        : await prepareMainImage({ id: crypto.randomUUID(), url: result.url, name: result.name });
      if (!generationMounted.current) return;
      const agentConversationId = result.agentConversationId ?? conversationId;
      const sourceIds = [...new Set(result.sourceIds ?? [])];
      const outcome = board.addAgentImages([{ ...asset, id: crypto.randomUUID(), taskResultId: result.id, agentConversationId }], { agentConversationId, sourceIds });
      if (outcome.addedCount) onNotify(t('已发送至画布'), 'success');
    } catch { onNotify(t('图片加载失败，请重试'), 'error'); }
  };
  const elementAction = (label: string, entry: string) => {
    if (label === '款式' && ['局部修改', '印花上身'].includes(entry) && selected) {
      setMenu(null); setQuickEdit(null);
      if (leftTab === 'layers') setLeftTab('history');
      setLocalEditTool(entry as CanvasEditTool); board.setInteractionLocked(true); setLocalEdit(selected.id);
      return;
    }
    unavailable();
  };
  const elementMenu = (label: string, icon: string) => <ElementMenu label={label} icon={icon} open={menu === label} onToggle={() => toggleMenu(label)} onClose={() => setMenu(null)} onAction={entry => elementAction(label, entry)} />;

  return <>
    {returnHint.value && <div className="canvas-return-hint" data-canvas-ui data-phase={returnHint.phase} inert={returnHint.phase === 'exit'}>
      <p role="status">{t('当前视窗没有内容，可点击按钮快速回到内容区域')}</p>
      <Button variant="primary" size="s" onClick={board.returnToContent}>{t('回到内容')}</Button>
    </div>}
    {board.images.filter(item => item.generating !== undefined).map(item => <GeneratingPlaceholder key={item.id} active={!!item.generating} zoom={board.camera.zoom} suspended={board.isolationActive} style={{ left: item.x * board.camera.zoom + board.camera.x, top: item.y * board.camera.zoom + board.camera.y, width: item.width * board.camera.zoom, height: item.height * board.camera.zoom, visibility: board.isolationActive ? 'hidden' : 'visible' }} />)}
    {board.images.filter(item => item.generationFailed).map(item => {
      // Size the state artwork and controls on a 320px short edge, then apply
      // the image's actual dimensions and camera zoom together.
      const contentScale = Math.max(1, Math.min(item.width, item.height)) / 320;
      return <div key={item.id} className="canvas-failed-result" style={{ position: 'absolute', pointerEvents: 'none', left: item.x * board.camera.zoom + board.camera.x, top: item.y * board.camera.zoom + board.camera.y, width: item.width * board.camera.zoom, height: item.height * board.camera.zoom, transform: `rotate(${item.rotation ?? 0}deg)`, visibility: board.isolationActive ? 'hidden' : 'visible' }}>
        <div className="canvas-failed-result-content" style={{ width: item.width / contentScale, height: item.height / contentScale, transform: `scale(${contentScale * board.camera.zoom})`, transformOrigin: 'top left' }}>
          <TaskResultPlaceholder status="failed" size="large" onRetry={item.taskResultId ? () => retryCanvasImage(item.taskResultId!) : undefined} />
        </div>
      </div>;
    })}
    {hovered && <div className="element-hover" aria-hidden="true" style={{ left: hovered.x * board.camera.zoom + board.camera.x, top: hovered.y * board.camera.zoom + board.camera.y, width: hovered.width * board.camera.zoom, height: hovered.height * board.camera.zoom, transform: `rotate(${hovered.rotation ?? 0}deg)` }} />}
    {board.marquee && <div className="canvas-marquee" aria-hidden="true" style={{ left: board.marquee.x * board.camera.zoom + board.camera.x, top: board.marquee.y * board.camera.zoom + board.camera.y, width: board.marquee.width * board.camera.zoom, height: board.marquee.height * board.camera.zoom }} />}
    {board.images.filter(item => (board.selectedIds.includes(item.id) || item.id === renamingId) && !item.shape && !item.generating && !item.generationFailed).map(item => {
      const box = screenBounds(imageBounds(item), board.camera);
      return <div key={`filename:${item.id}:${item.id === renamingId}`} data-canvas-ui={item.id === renamingId ? true : undefined} className="canvas-selected-filename" style={{ left: box.x, top: box.y - IMAGE_FILENAME_TOP_SPACE, width: box.width }}>
        <span className="canvas-selected-filename-icon" aria-hidden="true" />
        {item.id === renamingId ? <EditableFilename name={item.name} autoEdit onRename={name => board.renameImage(item.id, name)} onValidationError={message => onNotify(message, 'error')} onEditingEnd={() => setRenamingId(null)} />
          : <span className="canvas-selected-filename-text">{item.name}</span>}
      </div>;
    })}
    {board.selectedIds.length > 1 && !board.marquee && <MultiSelectionControls key={board.selectedIds.join('|')} board={board} onNotify={onNotify} onTechPack={unavailable} />}
    {!leftTab && <div className="left-tools wb-surface" data-canvas-ui data-phase="enter" role="toolbar" aria-label={t("画布功能栏")}>
      <Tool icon="canvas-imgIconEditor7" label={t("图层")} disabled={!!localEdit} size={24} onClick={() => openLeftPanel('layers')} />
      <Tool icon="canvas-imgIconSystem6" label={t("资产")} size={24} onClick={() => openLeftPanel('assets')} />
      <Tool id="canvas-task-entry" icon="canvas-imgIcon2" label={t("任务")} size={24} onClick={() => openLeftPanel('history')} />
    </div>}
    <CanvasLeftPanel layersDisabled={!!localEdit} layerReorderDisabled={board.locked || !board.restored} tab={leftTab} images={board.images} selectedIds={board.selectedIds} onSelectImage={id => board.selectMany([id])} onSelectGroup={id => board.selectMany(board.images.filter(image => image.groupId === id).map(image => image.id))} onRenameImage={board.renameImage} onReorderLayer={board.reorderLayer} lookupImageFilename={board.lookupImageFilename} onTabChange={openLeftPanel} onClose={() => setLeftTab(null)} records={generationRecords} uploads={uploads} onUpload={onRememberUpload} onNotify={onNotify} onRegenerate={record => void regenerateRecord(record)} onDeleteRecord={id => { const record = generationRecords.find(item => item.id === id); if (record && !archivedRecords.current.has(id)) archivedRecords.current.set(id, record); setGenerationRecords(previous => previous.filter(record => record.id !== id)); }} onDeleteResult={(id, index) => setGenerationRecords(previous => previous.flatMap(record => {
      if (record.id !== id) return [record];
      if (!archivedRecords.current.has(id)) archivedRecords.current.set(id, record);
      const images = record.images.filter((_, imageIndex) => imageIndex !== index);
      return images.length ? [{ ...record, images }] : [];
    }))} />
    <TaskFeatureTip expanded={!!leftTab} blankClickVersion={board.blankClickVersion} />
    <div ref={bottomToolsRef} className="bottom-tools wb-surface" data-canvas-ui data-phase={phase} role="toolbar" aria-label={t("画布工具栏")} style={{ '--bottom-tools-shift': `${bottomToolsShift}px`, '--bottom-tools-bottom': `${bottomToolsBottom}px` } as CSSProperties}>
      <Tool disabled={!!localEdit} icon="canvas-imgIconEditor" label={t("选择 V")} active={board.effectiveMode === 'select' && !board.shapeTool} onClick={() => board.setMode('select')} /><Tool disabled={!!localEdit} icon="canvas-imgIconEditor1" label={t("抓手 H")} active={board.effectiveMode === 'hand'} onClick={() => board.setMode('hand')} />
      <Tool icon="canvas-imgIconEditor2" label={t("撤销")} disabled={!!localEdit || !board.canUndo} onClick={board.undo} /><Tool icon="canvas-imgIconEditor3" label={t("重做")} disabled={!!localEdit || !board.canRedo} onClick={board.redo} /><Divider vertical />
      <ShapeToolMenu disabled={!!localEdit || board.locked || !board.restored} activeShape={board.shapeTool} onSelect={board.selectShapeTool} /><Tool disabled={!!localEdit} icon="canvas-imgIconEditor5" label={t("添加画框")} onClick={unavailable} /><Tool disabled={!!localEdit} icon="canvas-imgIconEditor6" label={t("添加文字")} onClick={unavailable} /><Tool disabled={!!localEdit} icon="canvas-imgIconSystem5" label={t("上传图片")} onClick={() => onUpload()} /><Divider vertical /><Tool disabled={!!localEdit} icon="canvas-imgIconBusinessApparelDesign1" label={t("工艺单")} onClick={unavailable} />
    </div>
    <div ref={zoomToolsRef} className={`zoom-tools ${open ? 'with-panel' : ''}`} data-canvas-ui data-phase={phase}>
      <div className="zoom-pill wb-surface" data-workbench-menu><Tool icon="canvas-imgIconEditor8" label={t("缩小")} disabled={!!localEdit} onClick={() => board.zoomAt(board.camera.zoom / 1.2, undefined, { animate: true, duration: 200 })} /><Button className="zoom-trigger" disabled={!!localEdit} aria-haspopup="true" aria-expanded={menu === 'zoom'} aria-controls="canvas-zoom-menu" onClick={() => toggleMenu('zoom')}><span>{Math.round(board.camera.zoom * 100)}%</span><Icon name="zoom-chevron-up" size={16} /></Button><Tool icon="canvas-imgIconEditor9" label={t("放大")} disabled={!!localEdit} onClick={() => board.zoomAt(board.camera.zoom * 1.2, undefined, { animate: true, duration: 200 })} />{shownMenu.value === 'zoom' && <div id="canvas-zoom-menu" className="workbench-menu zoom-menu" data-phase={shownMenu.phase} inert={shownMenu.phase === 'exit'}>{zoomOptions.map(n => <button key={n} aria-pressed={n === zoomPercent} onClick={() => { board.zoomAt(n / 100, undefined, { animate: true }); setMenu(null); }}><span className="zoom-option-label">{n}%</span>{n === zoomPercent && <Icon name="check" size={16} />}</button>)}<button onClick={() => { board.fit({ animate: true }); setMenu(null); }}><span className="zoom-option-label">{t("适应屏幕")}</span></button></div>}</div>
      <div className="round-tool wb-surface canvas-arrange-control" data-workbench-menu>
        <Button className="workbench-tool" disabled={!!localEdit} aria-label={t('整理画布')} title={t('整理画布')} aria-haspopup="menu" aria-expanded={menu === 'arrange'} aria-controls="canvas-arrange-menu" onClick={() => toggleMenu('arrange')} onKeyDown={event => {
          if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); setMenu('arrange'); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('#canvas-arrange-menu button')?.focus());
        }}><Icon name="canvas-arrange" size={24} /></Button>
        {shownMenu.value === 'arrange' && <CanvasArrangeMenu id="canvas-arrange-menu" className="canvas-arrange-menu" label={t('整理画布')} phase={shownMenu.phase} onEscape={() => {
          setMenu(null); document.querySelector<HTMLButtonElement>('[aria-controls="canvas-arrange-menu"]')?.focus();
        }} onSelect={layout => { board.arrange(layout); setMenu(null); board.canvasRef.current?.focus({ preventScroll: true }); }} />}
      </div>
      <div className="canvas-map-control">
        <div className="round-tool wb-surface"><Button className="workbench-tool" disabled={!!localEdit} aria-label={t('画布小地图')} aria-pressed={minimapOpen} aria-expanded={minimapOpen && !board.locked} aria-controls="canvas-minimap" onClick={() => setMinimapOpen(value => !value)}><Icon name="canvas-minimap" size={24} /></Button></div>
        {shownMinimap.value && <div id="canvas-minimap" className="canvas-minimap" data-phase={shownMinimap.phase} inert={shownMinimap.phase === 'exit'}>
          <CanvasMinimap images={board.images} view={board.camera} canvasSize={board.size} label={t('画布小地图')} viewportLabel={t('当前可视范围')} onNavigate={board.navigateMinimap} />
        </div>}
      </div>
      <div className="round-tool wb-surface"><Tool icon="canvas-imgIconSystem7" label={t("新手引导")} size={24} onClick={onHelp} /></div><div className="round-tool wb-surface shortcuts-anchor" data-workbench-menu><Button className="workbench-tool" aria-label={t("快捷键")} title={t("快捷键")} aria-expanded={menu === 'shortcuts'} aria-controls="canvas-shortcuts-panel" onClick={() => toggleMenu('shortcuts')}><Icon name="canvas-imgIconSystem8" size={24} /></Button>{shownMenu.value === 'shortcuts' && <ShortcutsPanel phase={shownMenu.phase} onClose={() => setMenu(null)} />}</div>
    </div>
    {selected && !board.marquee && <>
      <div className="element-selection" style={{ left: selected.x * board.camera.zoom + board.camera.x, top: selected.y * board.camera.zoom + board.camera.y, width: selected.width * board.camera.zoom, height: selected.height * board.camera.zoom, transform: `rotate(${selected.rotation ?? 0}deg)` }}>
        {!board.shapeTool && ['tl', 't', 'tr', 'l', 'r', 'bl', 'b', 'br', ...(quickEdit ? [] : ['rotate'])].map(handle => localEdit ? <span key={handle} className={`selection-handle handle-${handle}`} aria-hidden="true">{handle === 'rotate' && <Icon name="canvas-imgIcon0201" size={16} />}</span> : <button key={handle} data-canvas-ui className={`selection-handle handle-${handle}`} aria-label={handle === 'rotate' ? t("旋转图片") : t("调整图片尺寸")} onPointerDown={e => startTransform(e, handle)} onPointerMove={moveTransform} onPointerUp={e => { transform.current = null; delete e.currentTarget.dataset.rotating; }} onPointerCancel={e => { transform.current = null; delete e.currentTarget.dataset.rotating; }} onLostPointerCapture={e => { transform.current = null; delete e.currentTarget.dataset.rotating; }}>{handle === 'rotate' && <Icon name="canvas-imgIcon0201" size={16} />}</button>)}
      </div>
      {!selected.shape && shownElementToolbar.value === selected.id && <div ref={toolbarRef} className="element-toolbar wb-surface" data-canvas-ui data-phase={shownElementToolbar.phase} inert={shownElementToolbar.phase === 'exit'} role="toolbar" aria-label={t("元素工具栏")} style={canvasToolbarPosition(imageBounds(selected), board.camera, board.size, toolbarSize, open ? 432 : 16, IMAGE_FILENAME_TOP_SPACE)}>
        <Button icon="canvas-imgIconBusinessAi1" aria-expanded={quickEdit === selected.id} onClick={() => { setQuickEdit(quickEdit === selected.id ? null : selected.id); setMenu(null); }}>{t("快捷编辑")}</Button><Divider vertical />
        {elementMenu('款式', 'element-fashion')}{elementMenu('印花', 'element-pattern')}{elementMenu('面料', 'element-fabric')}{elementMenu('线稿', 'element-line')}
        <div className="element-menu-anchor" data-workbench-menu>
          <Button className="workbench-tool element-menu-trigger" aria-label={t("更多操作")} title={t("更多操作")} aria-haspopup="menu" aria-expanded={menu === 'more'} aria-controls="element-more-menu" onClick={() => toggleMenu('more')}><Icon name="element-more" size={20} /></Button>
          {shownMenu.value === 'more' && <div id="element-more-menu" className="element-design-menu element-more-menu" role="menu" aria-label={t("更多操作")} data-phase={shownMenu.phase} inert={shownMenu.phase === 'exit'}>
            {[t("高清放大"), t("一键去底"), t("智能抠图"), t("智能裁图"), t("AI扩图"), t("AI消除")].map((label, index) => <Button role="menuitem" key={label} onClick={unavailable}><Icon name={`menu-41-3399-imgLeftIcon${index || ''}`} size={20} /><span>{label}</span></Button>)}
          </div>}
        </div>
        <Divider vertical /><Button onClick={unavailable}><Icon name="element-tech" size={20} />{t("工艺单")}</Button>
        <Button onClick={() => { setQuickEdit(null); setMenu(null); setTextEdit(selected); }}><Icon name="text-edit/text-edit" size={20} />{t('文字编辑')}</Button><Divider vertical />
        <div className="element-toolbar-actions" onPointerLeave={() => setHoveredToolbarAction(null)}>
          <span className="element-toolbar-action-hover" aria-hidden="true" style={{ transform: `translateX(${(hoveredToolbarAction ?? lastHoveredToolbarAction.current) * 36}px)`, opacity: hoveredToolbarAction === null ? 0 : 1 }} />
          <div className="element-toolbar-action" onPointerEnter={() => hoverToolbarAction(0)}><Tool icon="element-preview" label={t("查看大图")} onClick={() => setPreview({ url: selected.url, name: selected.name, width: selected.image.naturalWidth || selected.width, height: selected.image.naturalHeight || selected.height })} /></div>
          <div className="element-toolbar-action" onPointerEnter={() => hoverToolbarAction(1)}><Tool icon="asset-center" label={t("收藏到资源库")} onClick={unavailable} /></div>
          <div className="element-toolbar-action" onPointerEnter={() => hoverToolbarAction(2)}><DownloadFormatMenu withLabel={false} open={menu === 'download'} onToggle={() => toggleMenu('download')} onClose={() => setMenu(null)} onSelect={format => void board.downloadImage(format)} /></div>
          <div className="element-toolbar-action" onPointerEnter={() => hoverToolbarAction(3)}><ElementSendMenu open={menu === 'send'} onToggle={() => toggleMenu('send')} onClose={() => setMenu(null)} onSend={unavailable} /></div>
        </div>
      </div>}
    </>}
    {shownPanel.value && <aside id="canvas-right-sidebar" className={`right-panel ${tab === 'properties' ? 'properties-panel' : ''}`} data-canvas-ui data-phase={shownPanel.phase} inert={shownPanel.phase === 'exit'}>
      <header className="right-panel-header"><div ref={switcherRef} className="right-panel-switcher" role="tablist" aria-label={t("右侧面板")}><span className="switcher-indicator" style={indicatorStyle} aria-hidden="true" />{(['agent', 'properties'] as const).map((value, i) => <button key={value} role="tab" id={`panel-tab-${value}`} aria-controls="right-panel-content" aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = tab === 'agent' ? 'properties' : 'agent'; setTab(next); document.getElementById(`panel-tab-${next}`)?.focus(); } }}><AgentArtwork name={i ? 'properties' : 'assistant'} />{i ? t("图层属性") : t("AI助手")}</button>)}</div><Button className="workbench-tool" aria-label={t("收起右侧栏")} title={t("收起右侧栏")} onClick={() => onOpenChange(false)}><AgentArtwork name="sidebar" size={24} /></Button></header>
      <div id="right-panel-content" role="tabpanel" aria-labelledby={`panel-tab-${tab}`} className="right-panel-content">
        {tab === 'properties' ? <div className="properties-content" inert={!!localEdit}><ImageProperties board={board} onNotify={onNotify} rotationLocked={rotationLocked} onReplace={onReplace} onAction={entry => entry === t("局部编辑") ? elementAction("款式", "局部修改") : unavailable()} /></div> : <>
          <div className="conversation-bar">
            <div className="conversation-menu-anchor" data-workbench-menu>
              <Button className="conversation-trigger" aria-haspopup="menu" aria-controls="conversation-history-menu" aria-expanded={menu === 'conversations'} onClick={() => toggleMenu('conversations')} onKeyDown={event => {
                if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
                event.preventDefault(); setMenu('conversations');
                const last = event.key === 'ArrowUp';
                requestAnimationFrame(() => { const items = document.querySelectorAll<HTMLButtonElement>('#conversation-history-menu button'); items[last ? items.length - 1 : 0]?.focus(); });
              }}>{t("轻链设计助理")}<span className="conversation-chevron"><AgentArtwork name="chevron-down" /></span></Button>
              {shownMenu.value === 'conversations' && <div id="conversation-history-menu" className="element-design-menu conversation-history-menu" role="menu" aria-label={t("新对话")} data-phase={shownMenu.phase} inert={shownMenu.phase === 'exit'} onKeyDown={event => {
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setMenu(null); document.querySelector<HTMLButtonElement>('.conversation-trigger')?.focus(); return; }
                if (event.key === 'Tab') { setMenu(null); return; }
                if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault(); event.stopPropagation();
                const items = Array.from(event.currentTarget.querySelectorAll('button'));
                const index = items.indexOf(event.target as HTMLButtonElement);
                items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
              }}>{savedConversations.length ? savedConversations.map((c, i) => <Button role="menuitem" key={i} onClick={() => { const id = c[0]?.conversationId ?? crypto.randomUUID(); archiveConversation(id); setConversationId(id); setConversation(c); setMenu(null); document.querySelector<HTMLButtonElement>('.conversation-trigger')?.focus(); }}><span className="conversation-history-title">{t(c[0].text || '参考图片').slice(0, 25)}</span></Button>) : <p className="conversation-history-empty" role="status">{t("暂无历史对话")}</p>}</div>}
            </div>
            <Button className="workbench-tool" aria-label={t("新建对话")} title={t("新建对话")} onClick={() => { setMenu(null); archiveConversation(); setConversationId(crypto.randomUUID()); setConversation([]); setPrompt(''); setAttachments([]); }}><AgentArtwork name="new-chat" size={24} /></Button>
          </div>
          <div className="agent-chat-body">
          <div className="agent-content" data-scrolling={agentScrolling} onScroll={event => {
            const element = event.currentTarget;
            setAgentScrolling(element.scrollHeight > element.clientHeight);
            if (agentScrollTimer.current) clearTimeout(agentScrollTimer.current);
            agentScrollTimer.current = setTimeout(() => setAgentScrolling(false), 600);
          }}>{conversation.length ? <AgentConversation conversationId={conversationId} messages={agentMessages} onPreview={setPreview} onNotify={onNotify} onUnavailable={unavailable} canvasLocked={board.locked || !board.restored} onSendToCanvas={sendAgentResultToCanvas} onRetry={retryCanvasImage} onReference={(src, resultId) => {
            const source = resultId ? board.images.find(item => item.taskResultId === resultId && !item.generating && !item.generationFailed) : undefined;
            setAttachments(previous => source && previous.some(item => item.canvasImageId === source.id) ? previous
              : [...previous, { id: source ? `canvas:${source.id}` : crypto.randomUUID(), canvasImageId: source?.id, name: source?.name ?? `${t('参考图片')}.jpg`, kind: 'image', url: src }]);
            textarea.current?.focus();
          }} /> : <><h2>{t("今天你想设计什么？")}</h2><p>{t("从下方输入你的设计需求，或上传/从画布中选择图片进行修改与设计")}</p><div className="agent-suggestions">{[t("多款融合"), t("面料套版"), t("单款裂变"), t("印花设计"), t("工艺单素材包")].map(text => <button key={text} onClick={() => action(text)}><span className="suggestion-idea"><Icon name="suggestion-idea" size={20} /></span><span className="suggestion-label">{text}</span><span className="suggestion-add"><Icon name="suggestion-add" size={20} /></span></button>)}</div></>}</div>
          <AgentInputArea>
            <AgentRequestStatus state={agentRequestState} disabled={board.locked || !board.restored || !recordsRestored} onRetry={() => { if (activeAgentRequestId) agentRequests.retry(activeAgentRequestId); }} />
            <div className="agent-composer" onPointerDownCapture={event => {
              if (event.target instanceof Element && !event.target.closest('button, .agent-composer-attachments, [data-workbench-menu]')) lockCanvasReferences();
            }}>
            <AgentComposerAttachments items={composerAttachments} onRemove={removeComposerAttachment} disabled={board.locked || !board.restored} />
            <textarea ref={textarea} aria-label={t("设计需求")} placeholder={t("上传产品图，然后向我说出设计需求")} value={prompt} onFocus={lockCanvasReferences} onChange={e => { lockCanvasReferences(); setPrompt(e.target.value); }} />
            <div className="agent-input-footer">
              <div className="agent-attachment-anchor" data-workbench-menu>
                <Button variant="outline" className="agent-add" onClick={() => toggleMenu('attachments')} aria-label={t("添加附件")} aria-haspopup="menu" aria-expanded={menu === 'attachments'} aria-controls="agent-attachment-menu"><Icon name="agent-composer-20261029/add" size={24} /></Button>
                {shownMenu.value === 'attachments' && <div id="agent-attachment-menu" className="agent-attachment-menu" role="menu" aria-label={t("上传类型")} data-phase={shownMenu.phase} inert={shownMenu.phase === 'exit'}>
                  <button type="button" role="menuitem" onClick={() => { setMenu(null); fileInput.current?.click(); }}><span className="agent-attachment-icon agent-attachment-icon--file"><Icon name="agent-add-file" size={16} /></span><span>{t("文件")}</span></button>
                  <button type="button" role="menuitem" onClick={() => { setMenu(null); imageInput.current?.click(); }}><span className="agent-attachment-icon agent-attachment-icon--image"><Icon name="agent-add-image" size={16} /></span><span>{t("图片")}</span></button>
                </div>}
                <input ref={fileInput} hidden type="file" multiple aria-label={t("选择要上传的文件")} onChange={e => addAttachments(e.currentTarget, 'file')} />
                <input ref={imageInput} hidden type="file" accept="image/*" multiple aria-label={t("选择要上传的图片")} onChange={e => addAttachments(e.currentTarget, 'image')} />
              </div>
              <button type="button" className="agent-send" disabled={agentRequestState === 'thinking' || (!activeAgentRequestId && (board.locked || !board.restored || !recordsRestored || (!prompt.trim() && !composerAttachments.length)))} aria-label={t(activeAgentRequestId && agentRequestState !== 'thinking' ? '停止请求' : '发送设计需求')} data-tooltip={t(activeAgentRequestId && agentRequestState !== 'thinking' ? '停止请求' : '发送设计需求')} onClick={() => {
                if (activeAgentRequestId) { stopAgentRequest(); return; }
                const submitted = recordGenerationRequest([prompt.trim(), ...composerAttachments.filter(item => item.kind === 'file').map(item => `${t('附件：')}${item.name}`)].filter(Boolean).join('\n'), 'AI助手', composerAttachments.flatMap(item => item.url ? [item.url] : []), undefined, composerAttachments.flatMap(item => item.canvasImageId ? [item.canvasImageId] : []));
                if (submitted) { setPrompt(''); setAttachments([]); board.selectMany([]); }
              }}>{activeAgentRequestId && agentRequestState !== 'thinking' ? <span className="agent-send-stop" aria-hidden="true" /> : <Icon name="agent-composer-20261029/submit" size={24} />}</button>
            </div>
          </div></AgentInputArea>
          </div>
        </>}
      </div>
    </aside>}
    {!localEdit && quickEditVisible.value && board.images.find(item => item.id === quickEditVisible.value) && <QuickEditComposer onNotify={onNotify} key={quickEditVisible.value} draft={inputMemory.drafts[`quick:${quickEditVisible.value}`] ?? createQuickEditDraft()} onDraftChange={update => {
      inputMemory.update(`quick:${quickEditVisible.value}`, update);
    }} uploads={uploads} onUpload={onRememberUpload} board={board} image={board.images.find(item => item.id === quickEditVisible.value)!} phase={quickEditVisible.phase} onClose={() => setQuickEdit(null)} generating={generatingSources.current.has(quickEditVisible.value)} onSubmit={(request, draft) => { void generateQuickEdit(request, draft, quickEditVisible.value!); }} />}
    {localEdit && selected && <QuickEditComposer onNotify={onNotify} key={`local-${localEditTool}-${localEdit}`} localEdit tool={localEditTool} onAdjustPrint={draft => setPrintPlacement({ source: selected, draft })} draft={inputMemory.drafts[`${localEditTool}:${localEdit}`] ?? createQuickEditDraft()} onDraftChange={update => {
      inputMemory.update(`${localEditTool}:${localEdit}`, update);
    }} uploads={uploads} onUpload={onRememberUpload} board={board} image={selected} phase="enter" onClose={closeLocalEdit} generating={generatingSources.current.has(localEdit)} onSubmit={(request, draft) => { void generateQuickEdit(request, draft, localEdit, true); }} />}
    {shownPrintPlacement.value && <PrintPlacementDialog source={shownPrintPlacement.value.source} draft={shownPrintPlacement.value.draft} phase={shownPrintPlacement.phase} onNotify={onNotify} onClose={() => setPrintPlacement(null)} onConfirm={() => {
      if (!printPlacement) return;
      const { source, draft } = printPlacement;
      const generationDraft = { ...draft, value: '' };
      setPrintPlacement(null);
      void generateQuickEdit(t('印花上身'), generationDraft, source.id, true);
    }} />}
    {shownTextEdit.value && <TextEditDialog key={shownTextEdit.value.id} source={shownTextEdit.value} phase={shownTextEdit.phase} onClose={() => setTextEdit(null)} onSubmit={(input, prompt) => generateTextEdit(input, prompt, shownTextEdit.value!.id)} />}
    <ImageContextMenu board={board} onUpload={onUpload} />
    {shownPreview.value && <FullImageViewer image={shownPreview.value} locale={locale} phase={shownPreview.phase} onClose={() => setPreview(null)} />}
  </>;
}
