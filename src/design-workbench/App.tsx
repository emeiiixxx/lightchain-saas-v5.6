import { readDemoState, writeDemoState } from './demo-storage';
import { useLocale } from './LocaleContext';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Dialog } from './components/ui';
import { useCanvas } from './useCanvas';
import { DefaultPageUpload } from './components/DefaultPageUpload';
import { ProjectPanel } from './components/ProjectPanel';
import { ProjectCard } from './components/ProjectCard';
import { demoNotice } from './demo-feedback';
import { usePresence } from './usePresence';
import { AssetPicker } from './components/AssetPicker';
import type { LibraryImage } from './asset-library';
import { Workbench } from './components/Workbench';
import type { CanvasImage } from './useCanvas';
import { Toast, type ToastNotice } from './components/Toast';
import type { Notify } from './notification';
import { MOTION_DURATION } from './motion';

export default function App() {
  const { t, locale, setLocale } = useLocale();
  const [title, setTitle] = useState(() => readDemoState('project-title', 'Untitle'));
  const [panel, setPanel] = useState(false);
  const [modal, setModal] = useState<'help' | 'support' | 'points' | 'project' | 'upload' | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => { try { return localStorage.getItem('lc-v56-design-theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } });
  useLayoutEffect(() => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; try { localStorage.setItem('lc-v56-design-theme', theme); } catch { /* The current session still switches theme. */ } }, [theme]);
  useEffect(() => {
    const configure = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const config = event.data as { type?: unknown; locale?: unknown; theme?: unknown } | null;
      if (!config || typeof config !== 'object' || config.type !== 'lc-v56-design-workbench-config') return;
      if (config.locale !== 'zh-CN' && config.locale !== 'en' && config.locale !== 'ja') return;
      if (config.theme !== 'dark' && config.theme !== 'light') return;
      setLocale(config.locale);
      setTheme(config.theme);
    };
    window.addEventListener('message', configure);
    if (window.parent !== window) window.parent.postMessage({ type: 'lc-v56-design-workbench-ready' }, window.location.origin);
    return () => window.removeEventListener('message', configure);
  }, [setLocale]);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [uploads, setUploads] = useState<LibraryImage[]>([]);
  const uploadUrls = useRef(new Set<string>());
  useEffect(() => () => { uploadUrls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  const rememberUpload = useCallback((image: LibraryImage) => { uploadUrls.current.add(image.url); setUploads(previous => [image, ...previous]); }, []);
  const [dragging, setDragging] = useState(false);
  const dragCount = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify: Notify = useCallback((message, tone = 'info') => { setToast({ message: t(message), tone }); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 3500); }, [t]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const board = useCanvas(notify, theme, locale);
  const [projectUpdatedAt, setProjectUpdatedAt] = useState(Date.now);
  useEffect(() => { setProjectUpdatedAt(Date.now()); writeDemoState('project-title', title); }, [board.images, title]);
  const replaceTarget = useRef<string | null>(null);
  const additionPoint = useRef<{ x: number; y: number } | undefined>(undefined);
  const uploadRequest = useRef(0);
  const [pickerSession, setPickerSession] = useState(0);
  const clearUploadRequest = useCallback(() => {
    uploadRequest.current++;
    additionPoint.current = undefined;
    replaceTarget.current = null;
  }, []);
  const closeUpload = () => { clearUploadRequest(); setModal(null); };
  useEffect(() => {
    const leave = () => { clearUploadRequest(); setModal(current => current === 'upload' ? null : current); };
    const routeChanged = () => { if (window.parent.location.hash.split('?')[0] !== '#/design-workspace') leave(); };
    window.addEventListener('lc-v56-design:leave-project', leave);
    if (window.parent !== window) window.parent.addEventListener('hashchange', routeChanged);
    return () => {
      window.removeEventListener('lc-v56-design:leave-project', leave);
      if (window.parent !== window) window.parent.removeEventListener('hashchange', routeChanged);
      clearUploadRequest();
    };
  }, [clearUploadRequest]);
  const shownModal = usePresence(modal);
  const shownToast = usePresence(toast);
  const shownWelcome = usePresence(!board.images.length && !board.shapeTool ? true : null);
  const shownToolbar = usePresence(true);
  const shownDrop = usePresence(dragging && board.images.length ? true : null);
  const chooseFiles = (point?: { x: number; y: number }) => {
    clearUploadRequest();
    additionPoint.current = point ? { ...point } : undefined;
    setPickerSession(uploadRequest.current);
    setModal('upload');
  };
  const replaceImage = () => {
    clearUploadRequest();
    replaceTarget.current = board.selected;
    setPickerSession(uploadRequest.current);
    setModal('upload');
  };
  const confirmImages = (items: Omit<CanvasImage, 'x' | 'y'>[], session: number) => {
    // A decoded selection from a cancelled/replaced picker cannot reuse a new
    // request's placement point, even before the closing animation unmounts it.
    if (session !== uploadRequest.current || modal !== 'upload') return;
    if (replaceTarget.current && items[0]) { const item = items[0]; board.updateSelected({ image: item.image, url: item.url, name: item.name, mimeType: item.mimeType, width: item.image.naturalWidth, height: item.image.naturalHeight, generatedFile: undefined, origin: 'upload', generatedAt: undefined, taskResultId: undefined, generationPlacement: undefined }); }
    else board.addImages(items, { point: additionPoint.current, panDelay: MOTION_DURATION });
    closeUpload();
  };

  return <div className="app-shell">
    <main className={`canvas-stage ${dragging ? 'is-dragging' : ''}`} aria-label={t("设计生产工作台")} onDragEnter={e => { if (!board.locked && e.dataTransfer.types.includes('Files')) { e.preventDefault(); dragCount.current++; setDragging(true); } }} onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = board.locked ? 'none' : 'copy'; } }} onDragLeave={e => { if (e.dataTransfer.types.includes('Files')) { dragCount.current--; if (dragCount.current <= 0) setDragging(false); } }} onDrop={e => { e.preventDefault(); dragCount.current = 0; setDragging(false); if (board.locked) return; const r = e.currentTarget.getBoundingClientRect(); void board.upload(e.dataTransfer.files, board.images.length ? { x: e.clientX - r.left, y: e.clientY - r.top } : undefined); }}>
      <canvas ref={board.canvasRef} className={board.locked ? 'is-locked' : board.panning ? 'is-panning' : board.effectiveMode === 'hand' ? 'is-hand' : board.shapeTool ? 'is-drawing-shape' : ''} tabIndex={0} aria-label={t("无限画布。拖动空白处框选，Shift 点选多张；空格拖动平移；按住 Control、Command 或 Option / Alt 滚轮缩放。")} />
      <ProjectPanel name={title} onNameChange={setTitle} onBack={() => { window.dispatchEvent(new Event('lc-v56-design:leave-project')); setModal('project'); }} />
      {!panel && <Button className="sidebar-toggle" icon="sidebar" aria-label={panel ? t("收起右侧栏") : t("展开右侧栏")} title={panel ? t("收起右侧栏") : t("展开右侧栏")} aria-expanded={panel} aria-controls="canvas-right-sidebar" data-canvas-ui onClick={() => setPanel(true)} />}
      {shownWelcome.value && <section data-phase={shownWelcome.phase} inert={shownWelcome.phase === 'exit'} className="welcome" aria-label={t("开始设计")}>
        <h1>{t("Hello✨ 设计从这里开始")}</h1>
        <p>{t("请先点击下方上传线稿图 / 款式图 / 图案 / 面料图")}</p>
        <DefaultPageUpload dragging={dragging} onUpload={() => chooseFiles()} />
      </section>}
      {shownDrop.value && <div data-phase={shownDrop.phase} className="drop-overlay">{t("松开，将图片添加到画布")}</div>}
      <div className={`workbench ${board.images.length ? '' : 'workbench-empty'}`}><Workbench uploads={uploads} onRememberUpload={rememberUpload} board={board} open={panel} onOpenChange={setPanel} phase={shownToolbar.phase} onUpload={chooseFiles} onReplace={replaceImage} onHelp={() => setModal('help')} onNotify={notify} /></div>
    </main>
    {shownToast.value && <Toast notice={shownToast.value} phase={shownToast.phase} />}
    {shownModal.value === 'upload' && <AssetPicker key={pickerSession} locale={locale} phase={shownModal.phase} uploads={uploads} onUpload={rememberUpload} onClose={closeUpload} onConfirm={image => confirmImages([image], pickerSession)} onConfirmBatch={replaceTarget.current ? undefined : items => confirmImages(items, pickerSession)} />}
    {shownModal.value && shownModal.value !== 'upload' && <Dialog phase={shownModal.phase} title={shownModal.value === 'project' ? t("项目概览") : shownModal.value === 'help' ? t("画布操作指南") : shownModal.value === 'support' ? t("联系客服") : t("积分账户")} onClose={() => setModal(null)}>{shownModal.value === 'project' ? <><div className="project-card-preview-area"><ProjectCard name={title} coverUrl={board.projectCover?.url} updatedAt={projectUpdatedAt} onNameChange={setTitle} onOpen={() => setModal(null)} onMoreAction={() => notify(demoNotice(locale))} /></div><p className="text-xs leading-5 text-muted">{t("当前 Demo 项目保存在此浏览器中，暂不支持跨浏览器同步。")}</p><div className="flex justify-end mt-6"><Button variant="outline" onClick={() => setModal(null)}>{t("返回画布")}</Button></div></> : shownModal.value === 'help' ? <div className="help-content"><p>{t("点击素材卡，或者将图片拖入画布，开始设计。")}</p><dl><dt>{t("平移画布")}</dt><dd>{t("空格 + 拖动 / 手形工具 / 中键拖动 / 滚轮")}</dd><dt>{t("缩放画布")}</dt><dd>{t("⌘ / Ctrl / Option / Alt + 滚轮，或触控板捏合")}</dd><dt>{t("移动图片")}</dt><dd>{t("按住图片拖动")}</dd><dt>{t("恢复 100% / 适应画布")}</dt><dd>1 / 2</dd><dt>{t("删除选中图片")}</dt><dd>Delete / Backspace</dd><dt>{t("撤销上传、移动、删除")}</dt><dd>⌘ / Ctrl + Z</dd></dl><p className="muted">{t("当前 Demo 的图片保存在此浏览器中。")}</p></div> : shownModal.value === 'support' ? <p className="muted">{t("当前为设计生产工作台 Demo，暂未接入在线客服。")}</p> : <div><p className="muted">{t("演示账户可用积分")}</p><p className="text-3xl font-medium my-4">99,999</p><p className="muted">{t("当前 Demo 暂未接入积分购买。")}</p></div>}</Dialog>}
  </div>;
}
