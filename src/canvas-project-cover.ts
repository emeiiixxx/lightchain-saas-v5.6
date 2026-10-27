import type { CanvasImage } from './canvas';
import type { Locale } from './i18n';

export function isProjectCoverCandidate(image: CanvasImage): boolean {
  // Video canvas media already use their existing poster frame as image.url.
  return !image.nodeOnly && !image.generation && Boolean(image.url);
}

function hasCoverOrder(image: CanvasImage): boolean {
  return typeof image.coverOrder === 'number' && Number.isFinite(image.coverOrder) && image.coverOrder > 0;
}

// Assign when an image or video first becomes available. Existing values belong to the
// canvas snapshot, so undo/redo preserves the original appearance order.
export function withProjectCoverOrder<T extends CanvasImage>(next: T[], previous: readonly T[]): T[] {
  const previousById = new Map(previous.map(image => [image.id, image]));
  let order = [...previous, ...next].reduce((latest, image) => hasCoverOrder(image) ? Math.max(latest, image.coverOrder!) : latest, 0);
  return next.map(image => {
    if (!isProjectCoverCandidate(image) || hasCoverOrder(image)) return image;
    const previousImage = previousById.get(image.id);
    const coverOrder = previousImage && isProjectCoverCandidate(previousImage) && hasCoverOrder(previousImage)
      ? previousImage.coverOrder! : ++order;
    return { ...image, coverOrder };
  });
}

export function resolveProjectCover<T extends CanvasImage>(items: readonly T[]): T | null {
  let latest: T | null = null;
  for (const image of items) {
    if (!isProjectCoverCandidate(image)) continue;
    if (image.projectCover) return image;
    if (!latest || (image.coverOrder ?? 0) >= (latest.coverOrder ?? 0)) latest = image;
  }
  return latest;
}

export function toggleProjectCover<T extends CanvasImage>(images: T[], id: string): T[] {
  const target = images.find(image => image.id === id);
  if (!target || !isProjectCoverCandidate(target)) return images;
  const manualId = target.projectCover ? null : id;
  return images.map(image => {
    const projectCover = image.id === manualId;
    return Boolean(image.projectCover) === projectCover ? image : { ...image, projectCover };
  });
}

export const projectCoverMessages: Record<Locale, { set: string; reset: string; setDone: string; resetDone: string; label: string }> = {
  'zh-CN': { set: '设为项目封面', reset: '恢复默认封面', setDone: '已设为项目封面', resetDone: '已恢复默认封面', label: '封面' },
  en: { set: 'Set as project cover', reset: 'Restore default cover', setDone: 'Set as project cover', resetDone: 'Default cover restored', label: 'Cover' },
  ja: { set: 'プロジェクトのカバーに設定', reset: 'デフォルトのカバーに戻す', setDone: 'プロジェクトのカバーに設定しました', resetDone: 'デフォルトのカバーに戻しました', label: 'カバー' },
};
