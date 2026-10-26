import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Locale } from '../i18n';
import { videoTemplateReferenceAssets as assets, type VideoTemplateReferenceSet } from '../video-template-reference-assets';
import { ProgressiveImage } from './ProgressiveImage';
import { Button } from './ui';
import './video-template-references.css';

type ReferenceImage = { key: string; thumbnail: string; label: string };
type Props = { locale: Locale; references: VideoTemplateReferenceSet };
const copy = {
  'zh-CN': {
    references: '模版参考素材', modelImage: '模特参考图',
    subjectImage: (index: number) => `商品参考图 ${index}`,
    previous: '向左查看更多参考图', next: '向右查看更多参考图',
  },
  en: {
    references: 'Template references', modelImage: 'Model reference image',
    subjectImage: (index: number) => `Product reference image ${index}`,
    previous: 'Scroll left to view more reference images', next: 'Scroll right to view more reference images',
  },
  ja: {
    references: 'テンプレートの参考素材', modelImage: 'モデルの参考画像',
    subjectImage: (index: number) => `商品の参考画像 ${index}`,
    previous: '左にスクロールして参考画像をもっと見る', next: '右にスクロールして参考画像をもっと見る',
  },
};

export function VideoTemplateReferences({ locale, references }: Props) {
  const t = copy[locale];
  const images = useMemo<ReferenceImage[]>(() => [
    ...references.subjects.map((url, index) => ({ key: `subject-${index}`,
      thumbnail: index === 0 ? references.subjectThumbnail : url, label: t.subjectImage(index + 1) })),
    { key: 'model', thumbnail: references.modelThumbnail, label: t.modelImage },
  ], [references, t]);
  const [edges, setEdges] = useState({ left: false, right: false });
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const id = useId();
  const updateEdges = useCallback(() => {
    const element = track.current;
    if (!element) return;
    const max = Math.max(0, element.scrollWidth - element.clientWidth);
    const left = element.scrollLeft > 1, right = max - element.scrollLeft > 1;
    setEdges(current => current.left === left && current.right === right ? current : { left, right });
  }, []);
  useLayoutEffect(() => {
    const element = track.current;
    if (!element) return;
    element.scrollLeft = 0;
    updateEdges();
    const observer = new ResizeObserver(updateEdges);
    observer.observe(element);
    return () => observer.disconnect();
  }, [references, updateEdges]);
  useEffect(() => {
    // Keep keyboard navigation usable when its current edge arrow disappears.
    const previous = root.current?.querySelector<HTMLButtonElement>('.video-template-reference-scroll-arrow.is-left');
    const next = root.current?.querySelector<HTMLButtonElement>('.video-template-reference-scroll-arrow.is-right');
    if (!edges.right && edges.left && document.activeElement === next) previous?.focus({ preventScroll: true });
    if (!edges.left && edges.right && document.activeElement === previous) next?.focus({ preventScroll: true });
  }, [edges]);

  function scrollReferences(direction: -1 | 1) {
    const element = track.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollBy({ left: direction * Math.max(98, element.clientWidth * .72), behavior: reduced ? 'auto' : 'smooth' });
  }

  return <div ref={root} className="video-template-references" role="group" aria-label={t.references} data-node-id="171:30350">
    <div ref={track} id={`${id}-thumbnails`} className="video-template-reference-track" onScroll={updateEdges}>
      {images.map(image => <div key={image.key} className="video-template-reference-card">
        <ProgressiveImage src={image.thumbnail} alt={image.label} eager />
      </div>)}
    </div>
    {([-1, 1] as const).map(direction => {
      const available = direction === -1 ? edges.left : edges.right;
      const label = direction === -1 ? t.previous : t.next;
      return <Button variant="tonal" key={direction}
        className={`video-template-reference-scroll-arrow ${direction === -1 ? 'is-left' : 'is-right'}`}
        aria-label={label} title={available ? label : undefined} aria-controls={`${id}-thumbnails`}
        aria-hidden={!available} aria-disabled={!available} tabIndex={available ? 0 : -1} data-available={available}
        onClick={() => { if (available) scrollReferences(direction); }}>
        <span aria-hidden="true" className="icon" style={{ width: 16, height: 16,
          transform: direction === -1 ? 'rotate(180deg)' : undefined,
          '--icon-url': `url("${assets.thumbnailNext}")` } as CSSProperties} />
      </Button>;
    })}
  </div>;
}
