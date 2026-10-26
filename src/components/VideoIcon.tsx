import type { CSSProperties } from 'react';
import { videoAssets } from '../video-assets';

export function VideoIcon({ name, size = 24 }: { name: keyof typeof videoAssets; size?: number }) {
  return <span aria-hidden="true" className="icon video-icon" style={{ width: size, height: size, '--icon-url': `url("${videoAssets[name]}")` } as CSSProperties} />;
}
