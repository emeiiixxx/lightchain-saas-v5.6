import { useLayoutEffect, useRef } from 'react';
import type { CanvasImage, useCanvas } from '../useCanvas';
import { PrintVariationPanel, type PrintVariationDraft } from './PrintVariationPanel';

/** Uses the same isolated-image viewport and bottom inset as local editing. */
export function PrintVariationDock({ board, source, phase, onClose, onGenerate }: {
  board: ReturnType<typeof useCanvas>;
  source: CanvasImage;
  phase: 'enter' | 'exit';
  onClose: () => void;
  onGenerate: (draft: PrintVariationDraft) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const focusCompleted = useRef(false);
  const { left, right } = board.editingViewport(true);
  const width = Math.min(800, Math.max(0, right - left));

  useLayoutEffect(() => {
    if (phase === 'exit') return;
    return board.focusImage(source.id, (panel.current?.offsetHeight ?? 240) + 64, {
      animate: true,
      staged: !focusCompleted.current,
      onComplete: () => { focusCompleted.current = true; },
    });
    // Tag editing must not move the camera; only entry and viewport resizing do.
  }, [source.id, phase, width, board.size.height, board.focusImage]);

  return <PrintVariationPanel ref={panel} source={source} phase={phase}
    style={{ left: (left + right - width) / 2, width, maxHeight: Math.max(0, board.size.height - 104) }}
    onClose={onClose} onGenerate={onGenerate} />;
}
