import { useEffect, useState } from 'react';
import type { GenerationRecord } from './components/CanvasLeftPanel';

// Every result in a task shares its output configuration, including state tiles.
export function useRecordResultRatio(record: GenerationRecord) {
  const [width, height] = (record.ratio ?? '').split(':').map(Number);
  const configured = width > 0 && height > 0 ? width / height : undefined;
  const result = record.images.find(image => image.status !== 'failed' && image.status !== 'generating');
  const source = result?.url;
  const [decoded, setDecoded] = useState<{ source: string; ratio: number }>();
  useEffect(() => {
    if (configured || !source) return;
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (active && image.naturalWidth > 0 && image.naturalHeight > 0) {
        setDecoded({ source, ratio: image.naturalWidth / image.naturalHeight });
      }
    };
    image.src = source;
    return () => { active = false; image.onload = null; };
  }, [configured, source]);
  const fallbackHeight = result?.height ?? record.resultHeight ?? record.images[0]?.height ?? 92;
  return configured ?? (decoded?.source === source ? decoded?.ratio : undefined) ?? (fallbackHeight > 0 ? 92 / fallbackHeight : 1);
}
