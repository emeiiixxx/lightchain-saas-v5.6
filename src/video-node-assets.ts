const base = `${import.meta.env.BASE_URL}assets/video-node-final/`;
const legacyBase = `${import.meta.env.BASE_URL}assets/video-workflow/`;

// Figma 84:6110 / 119:11242: the combined settings trigger uses Icon/Editor edit-parameters.
export const videoSettingsIcon = `${base}settings-edit-parameters.svg`;

// Original SVG source records live in docs/video-node-final-assets.json.
// tip contains the design gradient: render with <img>, never a monochrome mask.
function assetUrls<T extends Record<string, string>>(files: T) {
  return Object.fromEntries(Object.entries(files).map(([name, file]) => [name, `${base}${file}`])) as { [Key in keyof T]: string };
}

export const videoNodeAssetSets = {
  framesEmpty: assetUrls({
    auto: "frames-empty-auto.svg",
    tip: "frames-empty-tip.svg",
    addImage: "frames-empty-add-image.svg",
    info: "frames-empty-info.svg",
    promptExpand: "frames-empty-prompt-expand.svg",
    promptSave: "frames-empty-prompt-save.svg",
    promptLibrary: "frames-empty-prompt-library.svg",
    promptGenerate: "frames-empty-prompt-generate.svg",
    chevron: "frames-empty-chevron.svg",
    generateStar: "frames-empty-generate-star.svg",
  }),
  framesFilled: assetUrls({
    auto: "frames-filled-auto.svg",
    tip: "frames-filled-tip.svg",
    addImage: "frames-filled-add-image.svg",
    info: "frames-filled-info.svg",
    promptExpand: "frames-filled-prompt-expand.svg",
    promptSave: "frames-filled-prompt-save.svg",
    promptLibrary: "frames-filled-prompt-library.svg",
    promptGenerate: "frames-filled-prompt-generate.svg",
    chevron: "frames-filled-chevron.svg",
    generateStar: "frames-filled-generate-star.svg",
    tooltipArrow: "frames-filled-tooltip-arrow.svg",
  }),
  referencesEmpty: assetUrls({
    auto: "references-empty-auto.svg",
    tip: "references-empty-tip.svg",
    info: "references-empty-info.svg",
    addReference: "references-empty-add-reference.svg",
    promptExpand: "references-empty-prompt-expand.svg",
    promptSave: "references-empty-prompt-save.svg",
    promptLibrary: "references-empty-prompt-library.svg",
    promptGenerate: "references-empty-prompt-generate.svg",
    chevron: "references-empty-chevron.svg",
    generateStar: "references-empty-generate-star.svg",
    tooltipArrow: "references-empty-tooltip-arrow.svg",
  }),
  referencesFilled: assetUrls({
    auto: "references-filled-auto.svg",
    tip: "references-filled-tip.svg",
    info: "references-filled-info.svg",
    addReference: "references-filled-add-reference.svg",
    promptExpand: "references-filled-prompt-expand.svg",
    promptSave: "references-filled-prompt-save.svg",
    promptLibrary: "references-filled-prompt-library.svg",
    promptGenerate: "references-filled-prompt-generate.svg",
    chevron: "references-filled-chevron.svg",
    generateStar: "references-filled-generate-star.svg",
  }),
} as const;

// Preserve existing helper keys while exposing the canonical final-node artwork.
export const videoNodeAssets = {
  add: `${legacyBase}add.svg`,
  expandText: `${legacyBase}expand-text.svg`,
  imageToPrompt: `${legacyBase}image-to-prompt.svg`,
  ...videoNodeAssetSets.framesEmpty,
  addReference: videoNodeAssetSets.referencesEmpty.addReference,
  tooltipArrow: videoNodeAssetSets.framesFilled.tooltipArrow,
} as const;
