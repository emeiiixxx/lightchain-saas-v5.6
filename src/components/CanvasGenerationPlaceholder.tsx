import type { Locale } from '../i18n';
import '../canvas-generation-placeholder.css';

const copy = {
  'zh-CN': { running: '生成中...', failed: '生成失败' },
  en: { running: 'Generating...', failed: 'Generation failed' },
  ja: { running: '生成中...', failed: '生成失敗' },
};

type Props = { locale: Locale; failed?: boolean };

/** The canvas node owns dimensions, selection and dragging. */
export function CanvasGenerationPlaceholder({ locale, failed = false }: Props) {
  return <div className={`canvas-generation-placeholder${failed ? ' is-failed' : ''}`} role="status" aria-busy={!failed}>
    <span className="canvas-task-generating" aria-hidden="true">
      <span className="canvas-task-gradient">
        <span className="task-gradient-green"><img src="/assets/canvas/generatingGreen.svg" alt="" draggable={false} /></span>
        <span className="task-gradient-blue"><img src="/assets/canvas/generatingBlue.svg" alt="" draggable={false} /></span>
        <span className="task-gradient-purple"><img src="/assets/canvas/generatingPurple.svg" alt="" draggable={false} /></span>
      </span>
    </span>
    <span className="canvas-generation-placeholder-label">{copy[locale][failed ? 'failed' : 'running']}</span>
  </div>;
}
