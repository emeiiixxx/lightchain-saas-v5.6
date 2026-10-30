import { EditableFilename } from './EditableFilename';
import { canvasMediaFilename } from '../canvas-media-filename';
import { ProgressiveImage } from './ProgressiveImage';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon } from './ui';
import { usePresence } from '../usePresence';
import { messages, type Locale } from '../i18n';

export type CanvasTask = { id: string; status: 'running' | 'completed' | 'failed'; createdAt: string; thumbnailUrl?: string; resultIds?: string[]; resultFiles?: { id: string; name: string; thumbnailUrl?: string }[] };
// Keep each result's last known name and thumbnail after deletion; live names follow undo/redo.
export function syncTaskFilenames(tasks: CanvasTask[], images: ReadonlyArray<{ id: string; name: string; url: string; generation?: unknown }>) {
  const live = new Map(images.filter(image => !image.generation).map(image => [image.id, {
    id: image.id, name: canvasMediaFilename(image.name, image.url), thumbnailUrl: image.url,
  }]));
  let changed = false;
  const next = tasks.map(task => {
    if (task.status !== 'completed') return task;
    const previous = new Map(task.resultFiles?.map(file => [file.id, file]));
    const resultFiles = (task.resultIds ?? task.resultFiles?.map(file => file.id) ?? []).flatMap(id => {
      const file = live.get(id) ?? previous.get(id);
      return file ? [file] : [];
    });
    if (JSON.stringify(resultFiles) === JSON.stringify(task.resultFiles ?? [])) return task;
    changed = true; return { ...task, resultFiles };
  });
  return changed ? next : tasks;
}
type CanvasTaskRow = CanvasTask & { rowId: string };
// Batch execution stays intact; the list and navigation expose one result per row.
function taskRows(tasks: CanvasTask[]): CanvasTaskRow[] {
  return tasks.flatMap<CanvasTaskRow>(task => {
    const resultIds = task.resultIds ?? task.resultFiles?.map(file => file.id) ?? [];
    if (!resultIds.length) return [{ ...task, rowId: task.id }];
    const files = new Map(task.resultFiles?.map(file => [file.id, file]));
    return resultIds.map(resultId => {
      const file = files.get(resultId);
      return {
        ...task, rowId: `${task.id}:${resultId}`, resultIds: [resultId], resultFiles: file ? [file] : [],
        thumbnailUrl: task.status === 'completed'
          ? file?.thumbnailUrl ?? (resultIds.length === 1 ? task.thumbnailUrl : undefined)
          : task.thumbnailUrl,
      };
    });
  });
}
const TASK_ROW_HEIGHT = 80;
const copy = {
  'zh-CN': { running: '生成中...', completed: '生成完成', failed: '生成失败', count: '进行中', focusResult: '聚焦到画布生成结果' },
  en: { running: 'Generating...', completed: 'Completed', failed: 'Failed', count: 'running', focusResult: 'Focus generated results on canvas' },
  ja: { running: '生成中...', completed: '生成完了', failed: '生成失敗', count: '件実行中', focusResult: 'キャンバス上の生成結果に移動' },
};
const emptyTasks: CanvasTask[] = [];

type Props = {
  tasks?: CanvasTask[];
  locale: Locale;
  onSelectTask?: (task: CanvasTask) => void;
  canSelectTask?: (task: CanvasTask) => boolean;
  nodeId?: string;
  onRenameFile?: (id: string, name: string) => void;
  canRenameFile?: (id: string) => boolean;
};

export function CanvasTaskList({ tasks = emptyTasks, locale, onSelectTask, canSelectTask, nodeId = '74:20493', onRenameFile, canRenameFile }: Props) {
  const [expanded, setExpanded] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => taskRows(tasks), [tasks]);
  const hasTasks = rows.length > 0;
  const open = expanded && hasTasks;
  const shown = usePresence(open ? rows : null);
  const id = useId();
  const t = copy[locale];
  useEffect(() => { if (!hasTasks) setExpanded(false); }, [hasTasks]);
  const running = rows.filter(task => task.status === 'running').length;
  const selectable = (task: CanvasTask) => task.status === 'completed' && Boolean(onSelectTask)
    && (canSelectTask ? canSelectTask(task) : Boolean(task.resultIds?.length));
  // Explicit row geometry lets the shell transition in either direction,
  // including an interrupted close, without snapping between height and auto.
  const count = shown.value?.length ?? 0;
  const expandedHeight = 2 + 40 + 24 + count * TASK_ROW_HEIGHT + Math.max(0, count - 1) * 8;
  return <div ref={root} className={`canvas-task-widget ${open ? 'is-expanded' : ''}`} data-node-id={nodeId}
    style={{ '--task-expanded-height': `${expandedHeight}px` } as CSSProperties}
    onKeyDown={event => {
      if (event.key !== 'Escape' || !open) return;
      event.preventDefault(); event.stopPropagation();
      root.current?.querySelector<HTMLButtonElement>('.canvas-task-trigger')?.focus({ preventScroll: true });
      setExpanded(false);
    }}>
    <button type="button" className="canvas-task-trigger" aria-label={messages[locale].taskList} aria-expanded={open} aria-controls={id} disabled={!hasTasks}
      onClick={() => setExpanded(value => !value)}>
      <Icon name="canvasTaskListIcon" size={20} /><span className="canvas-task-label">{messages[locale].tasks}</span>
      <span className="canvas-task-count">{running} {t.count}</span><Icon name="canvasTaskListChevron" size={16} className="canvas-task-chevron" />
    </button>
    {shown.value && <div id={id} className="canvas-task-content" role="list" aria-label={messages[locale].taskList} data-phase={shown.phase} inert={shown.phase === 'exit'}>
      {shown.value.map(task => {
        const createdAt = new Date(task.createdAt).toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        const file = task.resultFiles?.[0];
        const content = <>
          <span className="canvas-task-thumbnail">
            {task.status === 'running' ? <span className="canvas-task-generating" aria-hidden="true"><span className="canvas-task-gradient">
              <span className="task-gradient-green"><img src="/assets/canvas-task-list/generating-green.svg" alt="" /></span>
              <span className="task-gradient-blue"><img src="/assets/canvas-task-list/generating-blue.svg" alt="" /></span>
              <span className="task-gradient-purple"><img src="/assets/canvas-task-list/generating-purple.svg" alt="" /></span>
            </span></span> : task.thumbnailUrl ? <ProgressiveImage src={task.thumbnailUrl} alt="" fit="contain" /> : null}
          </span>
          <span className="canvas-task-details">
            {file && <span className="canvas-task-filename" onClick={event => event.stopPropagation()}>
              <EditableFilename name={file.name} onRename={task.status === 'completed' && onRenameFile && canRenameFile?.(file.id) ? name => onRenameFile(file.id, name) : undefined} />
            </span>}
            <span className="canvas-task-status">{t[task.status]}</span>
            <time dateTime={task.createdAt}>{createdAt}</time>
          </span>
        </>;
        return <div className="canvas-task-item" role="listitem" key={task.rowId}>
          {selectable(task) ? <div role="button" tabIndex={0} className="canvas-task-row canvas-task-row--action" aria-label={`${file ? `${file.name} · ` : ''}${t.completed} · ${createdAt} · ${t.focusResult}`}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectTask?.(task); } }} onClick={() => { if (selectable(task)) onSelectTask?.(task); }}>{content}</div> : <div className="canvas-task-row">{content}</div>}
        </div>;
      })}
    </div>}
  </div>;
}
