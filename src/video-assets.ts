const videoAssetBase = `${import.meta.env.BASE_URL}assets/video-workspace/`;
const entryAssetBase = `${import.meta.env.BASE_URL}assets/video-entry-20261023/`;
const materialAssetBase = `${import.meta.env.BASE_URL}assets/video-material-20261022/`;
const contextAssetBase = `${import.meta.env.BASE_URL}assets/video-context-submenus-20261023/`;

// Original artwork from Figma file 1dBgOC793NRsKgbNIaLZMK, node 64:2057.
export const videoAssets = {
  // Original slots in cascading canvas menus 159:27144 / 159:27378 / 159:27502.
  contextMaterial: `${contextAssetBase}material.svg`,
  contextVideo: `${contextAssetBase}video.svg`,
  contextChevron: `${contextAssetBase}chevron.svg`,
  contextQuick: `${contextAssetBase}quick.svg`,
  contextStoryboardImage: `${contextAssetBase}storyboard-image.svg`,
  contextMultiView: `${contextAssetBase}multi-view.svg`,
  contextGridSplit: `${contextAssetBase}grid-split.svg`,
  contextFashionVideo: `${contextAssetBase}fashion-video.svg`,
  contextProFashionVideo: `${contextAssetBase}pro-fashion-video.svg`,
  contextStoryboardVideo: `${contextAssetBase}storyboard-video.svg`,
  contextRemake: `${contextAssetBase}remake.svg`,
  contextUpload: `${contextAssetBase}upload.svg`,
  contextPaste: `${contextAssetBase}paste.svg`,
  // Figma 64:2059, updated 2026-10-23; original entry and upload-slot exports.
  entryTemplates: `${entryAssetBase}templates.svg`,
  entryQuickImage: `${entryAssetBase}quick-image.svg`,
  entryStoryboardImage: `${entryAssetBase}storyboard-image.svg`,
  entryFashionVideo: `${entryAssetBase}fashion-video.svg`,
  entryProFashionVideo: `${entryAssetBase}pro-fashion-video.svg`,
  entryUpload: `${entryAssetBase}upload.svg`,
  workspacePlate: `${videoAssetBase}workspacePlate.png`,
  workspaceIcon: `${videoAssetBase}workspaceIcon.svg`,
  templates: `${videoAssetBase}templates.svg`,
  imageGeneration: `${videoAssetBase}imageGeneration.svg`,
  videoGeneration: `${videoAssetBase}videoGeneration.svg`,
  // Icon/Business/Video masters 64:4169 / 64:4168 in the revised single-image toolbar.
  fashionVideo: `${videoAssetBase}fashion-short-video.svg`,
  storyboard: `${videoAssetBase}storyboard-to-video.svg`,
  // Icon/ImageEditingTool / upscale, master 80:77 in the single-image canvas.
  upscale: `${videoAssetBase}upscale.svg`,
  videoExtend: `${videoAssetBase}videoExtend.svg`,
  videoEdit: `${videoAssetBase}videoEdit.svg`,
  // Latest 97:6649 material controls, original 20×20 SVGs (2026-10-22).
  remakeVideo: `${materialAssetBase}remake.svg`,
  modifyVideo: `${materialAssetBase}modify.svg`,
  hdVideo: `${materialAssetBase}hd.svg`,
  saveVideoAsset: `${materialAssetBase}save.svg`,
  downloadVideo: `${materialAssetBase}download.svg`,
  playVideo: `${materialAssetBase}play.svg`,
  upload: `${videoAssetBase}upload.svg`,
  // Commerce uses the first frame of the replacement clip supplied on 2026-10-23.
  portraitPoster: `${videoAssetBase}ecommerce-poster-20261021-213138.png`,
  // Original Figma VIDEO-fill layer 76:5591, without player controls.
  landscapePoster: `${videoAssetBase}landscapePoster.png`,
  // Original MP4s supplied by the user, matched to the template orientation.
  portraitVideo: `${videoAssetBase}ecommerce.mp4?v=20261021-213138`,
  landscapeVideo: `${videoAssetBase}brand-story.mp4`,
  // EmptyIcon / 暂无数据 (6:317), used by StateMessage 64:4668.
  empty: `${videoAssetBase}empty.png`,
} as const;
