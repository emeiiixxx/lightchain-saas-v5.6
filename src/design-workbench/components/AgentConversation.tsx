import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useLocale } from '../LocaleContext';
import { exportImage, type DownloadFormat } from '../download-image';
import type { Notify } from '../notification';
import { Button } from './ui';
import { GenerationImageTag } from './GenerationImageTag';
import type { FullImageViewerImage } from './FullImageViewer';
import { DownloadFormatMenu } from './DownloadFormatMenu';
import { TaskResultPlaceholder } from './TaskResultPlaceholder';

const assetRoot = '/assets/design-workbench/agent-chat-20261028/';
export type AgentImageResult = {
  id: string; url: string; name: string;
  agentConversationId?: string;
  width?: number; height?: number;
  status?: 'generating' | 'failed' | 'success';
};
type SendToCanvas = (results: AgentImageResult[], loaded?: HTMLImageElement) => Promise<void>;
export type AgentMessage = {
  role: 'user' | 'assistant';
  text: string;
  images?: string[];
  requestId?: string;
  taskId?: string;
  conversationId?: string;
  results?: AgentImageResult[];
  kind?: 'analysis' | 'plan';
  analysis?: { image: string; text: string }[];
  plan?: { title: string; details: string[] }[];
  conclusion?: string;
  demo?: boolean;
};

// Static conversation from Figma 25:15945. Result identity survives re-opening
// this conversation and is independent of its asset URL or message position.
export const demoConversation: AgentMessage[] = [
  { role: 'user', text: '参考图1的颜色，图2的布局重新设计', images: [`${assetRoot}reference-1.jpg`, `${assetRoot}reference-2.jpg`], demo: true },
  {
    role: 'assistant', kind: 'analysis', text: '', demo: true,
    analysis: [
      { image: `${assetRoot}reference-1.jpg`, text: '浅蓝色为主色，搭配细密的浅色竖条纹。连衣裙采用深 V 领、抽褶收腰和宽松长袖，裙摆带有荷叶边层次。重新设计时可提取浅蓝配色与竖向纹理。' },
      { image: `${assetRoot}reference-2.jpg`, text: '浅紫色连衣裙采用深 V 领、宽幅抽褶腰线和蓬松长袖，袖口收拢。镂空纹样沿领口、衣身和裙摆分布，荷叶边形成前短后长的层次。重新设计时可参考领口、腰线、袖型及裙摆的布局。' },
    ],
  },
  {
    role: 'assistant', kind: 'plan', demo: true,
    text: '根据您的要求，我将把4款面料分别应用到线稿图（立领夹克外套）中，生成4张实物款式图。具体安排如下：',
    plan: Array.from({ length: 4 }, (_, index) => ({ title: `image${index + 1}`, details: ['款式面料：黑色荔枝纹皮革', '款式方向：黑色皮革质感立领夹克', '图片比例：2:3', '关键差异：光泽皮革质感，挺括有型'] })),
    conclusion: '所有款式图均保留线稿图原有的结构设计（立领、斜向门襟、纽扣、插袋、罗纹收口等），仅替换面料质感与颜色，确保面料纹理细腻真实。',
  },
  { role: 'assistant', text: '确认后我将先生成第1张（黑色皮革款）作为Pilot图供您确认方向。如需调整顺序或风格，请告诉我。', demo: true },
  { role: 'user', text: '确认', demo: true },
  { role: 'assistant', text: '', results: [{ id: 'agent-demo-20261028:pilot-1', url: `${assetRoot}result.jpg`, name: '示例结果图1.jpg' }], demo: true },
  { role: 'assistant', text: 'Pilot图 — 面料1：黑色荔枝纹皮革款立领夹克\n这是第1张Pilot图（黑色荔枝纹皮革款）。您对这个方向满意吗？确认后我将继续生成剩余3款面料的效果图。如有调整需求也请告诉我。', demo: true },
];

export function AgentArtwork({ name, size = 16, colored = false }: { name: string; size?: number; colored?: boolean }) {
  return <span className="agent-artwork" aria-hidden="true" style={{ width: size, height: size }}>
    {colored ? <img src={`${assetRoot}${name}.svg`} alt="" /> : <span className="agent-artwork-mask" style={{ maskImage: `url("${assetRoot}${name}.svg")`, WebkitMaskImage: `url("${assetRoot}${name}.svg")` }} />}
  </span>;
}

function ReferenceTags({ images }: { images: string[] }) {
  const { t } = useLocale();
  return <div className="agent-reference-tags">{images.map((src, index) => <GenerationImageTag key={`${src}-${index}`} src={src} label={`${t('图片')}${index + 1}`} active />)}</div>;
}

function ImageAnalysis({ references }: { references: AgentMessage['analysis'] }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const triggerId = useId();
  return <section className="agent-analysis agent-card" data-open={open}>
    <button id={triggerId} type="button" className="agent-analysis-trigger" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen(value => !value)}>
      <AgentArtwork name="analyze" size={20} colored /><span>{t('图片分析')}</span><AgentArtwork name="chevron-right" />
    </button>
    <div id={contentId} className="agent-analysis-disclosure" role="region" aria-labelledby={triggerId} aria-hidden={!open} inert={!open}>
      <div className="agent-analysis-clip">
        <div className="agent-analysis-references">{references?.map((reference, imageIndex) => <figure className="agent-analysis-reference" key={`${reference.image}-${imageIndex}`}>
          <img src={reference.image} alt={`${t('参考图片')} ${imageIndex + 1}`} />
          <figcaption><h4>{t('图片')}{imageIndex + 1}</h4><p>{t(reference.text)}</p></figcaption>
        </figure>)}</div>
      </div>
    </div>
  </section>;
}

function AgentImage({ result, onPreview, onReference, onSendToCanvas, canvasLocked, onUnavailable, onNotify }: {
  result: AgentImageResult; onPreview: (image: FullImageViewerImage) => void; onReference: (src: string) => void; onSendToCanvas: SendToCanvas; canvasLocked: boolean; onUnavailable: () => void; onNotify: Notify;
}) {
  const { t } = useLocale();
  const { url: src, name } = result;
  const [sending, setSending] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<'download' | null>(null);
  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setMenu(null);
    };
    window.addEventListener('pointerdown', dismiss);
    return () => window.removeEventListener('pointerdown', dismiss);
  }, [menu]);
  const download = async (format: DownloadFormat) => {
    try {
      if (!image.current?.naturalWidth) throw new Error('下载失败，请重试。');
      await exportImage(image.current, name, format);
    } catch (error) { onNotify(t(error instanceof Error ? error.message : '下载失败，请重试。')); }
  };
  return <>
    <div ref={container} className="agent-result-image" data-menu-open={menu !== null}>
      <button className="agent-image-preview" type="button" aria-label={`${t('查看大图')} · ${name}`} onClick={() => {
        setMenu(null);
        if (!image.current?.naturalWidth) { onNotify(t('图片尚未加载完成，请稍后重试。'), 'error'); return; }
        onPreview({ url: src, name, width: image.current.naturalWidth, height: image.current.naturalHeight });
      }}>
        <img ref={image} src={src} alt={name} />
      </button>
      <div className="agent-image-actions" role="toolbar" aria-label={t('图片操作')} data-workbench-menu onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setMenu(null); } }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMenu(null); }}>
        <Button aria-label={t('用作参考图')} title={t('用作参考图')} onClick={() => onReference(src)}><AgentArtwork name="reference" /></Button>
        <Button aria-label={t('发送至画布')} title={t('发送至画布')} disabled={canvasLocked || sending} onClick={async () => {
          setMenu(null);
          setSending(true);
          try { await onSendToCanvas([result], image.current?.naturalWidth ? image.current : undefined); }
          finally { setSending(false); }
        }}><AgentArtwork name="send" /></Button>
        <Button aria-label={t('收藏到资源库')} title={t('收藏到资源库')} onClick={onUnavailable}><AgentArtwork name="save" /></Button>
        <DownloadFormatMenu withLabel={false} open={menu === 'download'} onToggle={() => setMenu(menu === 'download' ? null : 'download')} onClose={() => setMenu(null)} onSelect={format => void download(format)} icon={<AgentArtwork name="download" />} />
      </div>
    </div>
  </>;
}

export function AgentConversation({ conversationId, messages, onPreview, onReference, onSendToCanvas, onRetry, canvasLocked, onUnavailable, onNotify }: {
  conversationId: string; messages: AgentMessage[]; onPreview: (image: FullImageViewerImage) => void; onReference: (src: string) => void; onSendToCanvas: SendToCanvas; onRetry: (resultId: string) => void; canvasLocked: boolean; onUnavailable: () => void; onNotify: Notify;
}) {
  const { t } = useLocale();
  const thread = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = thread.current?.parentElement;
    if (!container) return;
    let keepAtBottom = true;
    let previousTop = container.scrollTop;
    const onScroll = () => {
      const top = container.scrollTop;
      // Any upward movement pauses following, including a small first step.
      keepAtBottom = top >= previousTop && container.scrollHeight - top - container.clientHeight <= 2;
      previousTop = top;
    };
    const onWheel = (event: WheelEvent) => { if (event.deltaY < 0) keepAtBottom = false; };
    const onDisclosureClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('.agent-analysis-trigger')) keepAtBottom = false;
    };
    const pin = () => {
      if (!keepAtBottom || !container.clientHeight) return;
      container.scrollTop = container.scrollHeight;
      previousTop = container.scrollTop;
    };
    pin();
    container.addEventListener('scroll', onScroll, { passive: true });
    container.addEventListener('wheel', onWheel, { passive: true });
    container.addEventListener('click', onDisclosureClick, true);
    const observer = new ResizeObserver(pin);
    observer.observe(thread.current!);
    observer.observe(container);
    return () => {
      observer.disconnect();
      container.removeEventListener('scroll', onScroll);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('click', onDisclosureClick, true);
    };
    // Message arrays also change on unrelated parent renders (including scroll
    // bar visibility). Only a different conversation resets the reading state.
  }, [conversationId]);
  return <div ref={thread} className="agent-thread" role="log" aria-label={messages[0]?.demo ? t('演示对话') : t('AI助手')} aria-live="polite">
    {messages.map((message, index) => <div className={`agent-turn agent-turn--${message.role}`} key={index} aria-label={message.role === 'user' ? t('我') : t('AI助手')}>
      {message.role === 'user' ? <div className="agent-turn-bubble">
        {!!message.images?.length && <ReferenceTags images={message.images} />}
        {message.text && <p>{t(message.text)}</p>}
      </div> : message.kind === 'analysis' ? <ImageAnalysis references={message.analysis} /> : message.kind === 'plan' ? <section className="agent-plan agent-card">
        <div className="agent-plan-content"><header><h3>{t('生成计划')}</h3><p>{t(message.text)}</p></header>
          {message.plan?.map(item => <section key={item.title}><h4>{item.title}</h4><ul>{item.details.map(detail => <li key={detail}>{t(detail)}</li>)}</ul></section>)}
          {message.conclusion && <p className="agent-plan-conclusion">{t(message.conclusion)}</p>}
        </div>
      </section> : <>
        {!!message.results?.length && <div className="agent-image-task agent-card">
          <div className="agent-task-heading"><AgentArtwork name="image-task" size={20} colored /><span>{t('图片任务')}</span>
            {message.results.length > 1 && <Button className="agent-task-send" aria-label={t('全部发送至画布')} title={t('全部发送至画布')} disabled={canvasLocked || message.results.some(result => result.status === 'generating') || !message.results.some(result => !result.status || result.status === 'success')} onClick={() => void onSendToCanvas(message.results!.filter(result => !result.status || result.status === 'success'))}><AgentArtwork name="send" /></Button>}
          </div>
          <div className="agent-task-images">{message.results.map(result => result.status === 'generating' || result.status === 'failed'
            ? <div key={result.id} className="agent-result-image agent-result-placeholder" style={{ aspectRatio: `${result.width ?? 2} / ${result.height ?? 3}` }}><TaskResultPlaceholder status={result.status} size="large" onRetry={result.status === 'failed' ? () => onRetry(result.id) : undefined} /></div>
            : <AgentImage key={result.id} result={result} onPreview={onPreview} onReference={onReference} onSendToCanvas={onSendToCanvas} canvasLocked={canvasLocked} onUnavailable={onUnavailable} onNotify={onNotify} />)}</div>
        </div>}
        {message.text && <div className="agent-assistant-text"><p>{t(message.text)}</p></div>}
      </>}
    </div>)}
  </div>;
}
