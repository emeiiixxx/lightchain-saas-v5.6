import { useEffect, useRef } from 'react';
import { useLocale } from '../LocaleContext';
import { Button, Icon } from './ui';

const groups = [
  { title: '画布', rows: [
    ['抓手', '空格+拖动 / 按住中键拖动'], ['选择', 'V / 单击左键'],
    ['穿透选择', 'Ctrl + 单击左键'], ['放大画布', 'Ctrl + + / 滚轮'],
    ['缩小画布', 'Ctrl + − / 滚轮'], ['缩放画布', 'Option / Alt + 滚轮'], ['适合屏幕', 'Ctrl + 1'], ['实际大小', 'Ctrl + 0'],
  ] },
  { title: '元素', rows: [
    ['复制', 'Ctrl + C'], ['复制为图片', 'Ctrl + Shift + C'], ['粘贴', 'Ctrl + V'],
    ['复制并粘贴', 'Ctrl + D'], ['删除', 'Delete / Backspace'], ['剪切', 'Ctrl + X'],
    ['撤销', 'Ctrl + Z'], ['重做', 'Ctrl + Shift + Z'], ['全选', 'Ctrl + A'],
    ['多选', '框选 / Shift + 单击左键'], ['取消', 'ESC'], ['建组', 'Ctrl + G'], ['解组', 'Ctrl + Shift + G'],
  ] },
  { title: '新建对象', rows: [
    ['文本', 'T'], ['矩形', 'R'], ['椭圆', 'O'], ['线段', 'L'],
  ] },
  { title: '层级操作', rows: [
    ['移到顶层', 'Ctrl + Shift + ↑'], ['上移一层', 'Ctrl + ↑'],
    ['下移一层', 'Ctrl + ↓'], ['移到底层', 'Ctrl + Shift + ↓'],
  ] },
];

export function ShortcutsPanel({ phase, onClose }: { phase: 'enter' | 'exit'; onClose: () => void }) {
  const { t } = useLocale();
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopImmediatePropagation(); close.current();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, []);
  return <section ref={panel} id="canvas-shortcuts-panel" className="shortcuts-panel" role="dialog" aria-modal="false" aria-labelledby="shortcuts-title" tabIndex={-1} data-phase={phase} inert={phase === 'exit'} data-node-id="44:2782">
    <header className="shortcuts-header"><h2 id="shortcuts-title">{t('快捷键')}</h2><Button className="shortcuts-close" aria-label={t('关闭')} onClick={() => { onClose(); document.querySelector<HTMLButtonElement>('[aria-controls="canvas-shortcuts-panel"]')?.focus(); }}><Icon name="shortcuts-close" size={16} /></Button></header>
    <div className="element-menu-divider" />
    <div className="shortcuts-list">
      {groups.map(group => <section className="shortcuts-group" key={group.title}><h3>{t(group.title)}</h3><dl>{group.rows.map(([label, keys]) => <div className="shortcut-row" key={label}><dt>{t(label)}</dt><dd><kbd>{t(keys)}</kbd></dd></div>)}</dl></section>)}
    </div>
  </section>;
}
