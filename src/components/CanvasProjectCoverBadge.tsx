import type { Locale } from '../i18n';
import { projectCoverMessages } from '../canvas-project-cover';

export function CanvasProjectCoverBadge({ locale }: { locale: Locale }) {
  return <span className="canvas-project-cover-badge" data-node-id="5:7906">{projectCoverMessages[locale].label}</span>;
}
