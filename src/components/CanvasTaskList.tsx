import { EditableFilename } from './EditableFilename';
import { canvasMediaFilename } from '../canvas-media-filename';
import { ProgressiveImage } from './ProgressiveImage';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Icon } from './ui';
import { usePresence } from '../usePresence';
import { messages, type Locale } from '../i18n';

export type CanvasTask = { id: string; status: 'running' | 'completed' | 'failed'; createdAt: string; thumbnailUrl?: string; resultIds?: string[]; resultFiles?: { id: string; name: string }[] };
// Keep the last known name when a result is deleted; live names also follow undo/redo.
export function syncTaskFilenames(tasks: CanvasTask[], images: ReadonlyArray<{ id: string; name: string; url: string; generation?: unknown }>) {
  const live = new Map(images.filter(image => !image.generation).map(image => [image.id, canvasMediaFilename(image.name, image.url)]));
  let changed = false;
  const next = tasks.map(task => {
    if (task.status !== 'completed') return task;
    const previous = new Map(task.resultFiles?.map(file => [file.id, file.name]));
    const resultFiles = (task.resultIds ?? []).flatMap(id => {
      const name = live.get(id) ?? previous.get(id);
      return name ? [{ id, name }] : [];
    });
    if (JSON.stringify(resultFiles) === JSON.stringify(task.resultFiles ?? [])) return task;
    changed = true; return { ...task, resultFiles };
  });
  return changed ? next : tasks;
}
const taskHeight = (task: CanvasTask) => 64 + (task.status === 'completed' ? (task.resultFiles?.length ?? 0) * 20 : 0);
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

export function CanvasTaskList({ tasks = emptyTasks, locale, onSelectTask, canSelectTask, nodeId = '103:4291', onRenameFile, canRenameFile }: Props) {
  const [expanded, setExpanded] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const hasTasks = tasks.length > 0;
  const open = expanded && hasTasks;
  const shown = usePresence(open ? tasks : null);
  const id = useId();
  const t = copy[locale];
  useEffect(() => { if (!hasTasks) setExpanded(false); }, [hasTasks]);
  const running = tasks.filter(task => task.status === 'running').length;
  const selectable = (task: CanvasTask) => task.status === 'completed' && Boolean(onSelectTask)
    && (canSelectTask ? canSelectTask(task) : Boolean(task.resultIds?.length));
  // Explicit row geometry lets the shell transition in either direction,
  // including an interrupted close, without snapping between height and auto.
  const count = shown.value?.length ?? 0;
  const expandedHeight = 2 + 32 + 24 + (shown.value ?? []).reduce((height, task) => height + taskHeight(task), 0) + Math.max(0, count - 1) * 8;
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
      <Icon name="taskIcon" size={20} /><span className="canvas-task-label">{messages[locale].tasks}</span>
      <span className="canvas-task-count">{running} {t.count}</span><Icon name="imgChevron" size={16} className="canvas-task-chevron" />
    </button>
    {shown.value && <div id={id} className="canvas-task-content" role="list" aria-label={messages[locale].taskList} data-phase={shown.phase} inert={shown.phase === 'exit'}>
      {shown.value.map(task => {
        const createdAt = new Date(task.createdAt).toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        const content = <>
          <span className="canvas-task-thumbnail">
            {task.status === 'running' ? <span className="canvas-task-generating" aria-hidden="true"><span className="canvas-task-gradient">
              <span className="task-gradient-green"><img src="/assets/canvas/generatingGreen.svg" alt="" /></span>
              <span className="task-gradient-blue"><img src="/assets/canvas/generatingBlue.svg" alt="" /></span>
              <span className="task-gradient-purple"><img src="/assets/canvas/generatingPurple.svg" alt="" /></span>
            </span></span> : task.thumbnailUrl ? <ProgressiveImage src={task.thumbnailUrl} alt="" fit="contain" /> : null}
          </span>
          <span className="canvas-task-details"><span>{t[task.status]}</span>{task.status === 'completed' && task.resultFiles?.map(file => <span className="canvas-task-filename" key={file.id} onClick={event => event.stopPropagation()}><EditableFilename name={file.name} onRename={onRenameFile && canRenameFile?.(file.id) ? name => onRenameFile(file.id, name) : undefined} /></span>)}<time dateTime={task.createdAt}>{createdAt}</time></span>
        </>;
        return <div className="canvas-task-item" style={{ '--task-row-height': `${taskHeight(task)}px` } as CSSProperties} role="listitem" key={task.id}>
          {selectable(task) ? <div role="button" tabIndex={0} className="canvas-task-row canvas-task-row--action" aria-label={`${t.completed} · ${createdAt} · ${t.focusResult}`}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectTask?.(task); } }} onClick={() => { if (selectable(task)) onSelectTask?.(task); }}>{content}</div> : <div className="canvas-task-row">{content}</div>}
        </div>;
      })}
    </div>}
  </div>;
}
