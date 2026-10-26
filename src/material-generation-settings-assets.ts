import { videoNodeAssetSets } from './video-node-assets';

const settingsBase = `${import.meta.env.BASE_URL}assets/material-settings-20261023/`;
const ratioBase = `${import.meta.env.BASE_URL}assets/video-settings/`;

// Figma 141:24676 shares the existing Beta ratio masters. Keep the artwork
// untouched; its 21:9 slot explicitly uses the 16:9 master in the supplied design.
export const materialRatioOptions = ['auto', '2:3', '3:4', '4:5', '9:16', '1:1', '3:2', '4:3', '5:4', '16:9', '21:9'] as const;
const ratioIcons: Record<string, string> = {
  auto: `${ratioBase}parameter-auto.svg`,
  '2:3': `${settingsBase}ratio-2-3.svg`,
  '3:4': `${ratioBase}parameter-3-4.svg`,
  '4:5': `${settingsBase}ratio-4-5.svg`,
  '9:16': `${ratioBase}parameter-9-16.svg`,
  '1:1': `${ratioBase}parameter-1-1.svg`,
  '3:2': `${settingsBase}ratio-3-2.svg`,
  '4:3': `${ratioBase}parameter-4-3.svg`,
  '5:4': `${settingsBase}ratio-5-4.svg`,
  '16:9': `${ratioBase}parameter-16-9.svg`,
  '21:9': `${ratioBase}parameter-16-9.svg`,
};

export const materialGenerationAssets = {
  ratioIcon: (ratio: string) => ratioIcons[ratio] ?? ratioIcons.auto,
  resolutionIcons: {
    '1K': `${settingsBase}resolution-1k.svg`,
    '2K': `${settingsBase}resolution-2k.svg`,
    '4K': `${settingsBase}resolution-4k.svg`,
  },
  tip: `${settingsBase}tip.svg`,
  info: videoNodeAssetSets.referencesEmpty.info,
  addReference: videoNodeAssetSets.referencesEmpty.addReference,
  promptExpand: videoNodeAssetSets.framesEmpty.promptExpand,
  promptSave: videoNodeAssetSets.framesEmpty.promptSave,
  promptLibrary: videoNodeAssetSets.framesEmpty.promptLibrary,
  chevron: videoNodeAssetSets.framesEmpty.chevron,
  generateStar: videoNodeAssetSets.framesEmpty.generateStar,
} as const;
