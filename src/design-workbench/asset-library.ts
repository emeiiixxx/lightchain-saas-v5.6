import type { CanvasImage } from './useCanvas';

export type LibraryImage = Pick<CanvasImage, 'id' | 'name' | 'url'> & Partial<Pick<CanvasImage, 'width' | 'height' | 'mimeType' | 'uploadedAt'>>;
// Figma-provided demo fixtures, not a connected account's upload history.
export const demoAssets: LibraryImage[] = [
  { id: 'figma-text-edit-tech-pack', name: '文字编辑 · 工艺单', url: '/assets/design-workbench/text-edit/tech-pack.png' },
  { id: 'figma-single-select', name: '彩色毛绒穿搭', url: '/assets/design-workbench/upload/single-select-asset.png' },
];

// Figma 17:1333 multi-select demo fixtures; original exported assets.
export const multiDemoAssets: LibraryImage[] = [
  { id: 'figma-text-edit-tech-pack', name: '文字编辑 · 工艺单', url: '/assets/design-workbench/text-edit/tech-pack.png' },
  {
    "id": "figma-multi-0",
    "name": "浅色花卉图案",
    "url": "/assets/design-workbench/upload/imgAsset.png"
  },
  {
    "id": "figma-multi-1",
    "name": "蓝色几何图案",
    "url": "/assets/design-workbench/upload/imgAsset1.png"
  },
  {
    "id": "figma-multi-2",
    "name": "小狗印花",
    "url": "/assets/design-workbench/upload/imgAsset2.png"
  },
  {
    "id": "figma-multi-3",
    "name": "绿色连衣裙",
    "url": "/assets/design-workbench/upload/imgAsset3.png"
  },
  {
    "id": "figma-multi-4",
    "name": "海边印花套装",
    "url": "/assets/design-workbench/upload/imgAsset4.png"
  },
  {
    "id": "figma-multi-5",
    "name": "蓝色褶皱面料",
    "url": "/assets/design-workbench/upload/imgAsset5.png"
  },
  {
    "id": "figma-multi-6",
    "name": "紫色无袖连衣裙",
    "url": "/assets/design-workbench/upload/imgAsset6.png"
  },
  {
    "id": "figma-multi-7",
    "name": "浅蓝吊带裙",
    "url": "/assets/design-workbench/upload/imgAsset7.png"
  },
  {
    "id": "figma-multi-8",
    "name": "彩色织带面料",
    "url": "/assets/design-workbench/upload/imgAsset8.png"
  },
  {
    "id": "figma-multi-9",
    "name": "白色吊带上衣",
    "url": "/assets/design-workbench/upload/imgAsset9.png"
  },
  {
    "id": "figma-multi-10",
    "name": "米白衬衫套装",
    "url": "/assets/design-workbench/upload/imgAsset10.png"
  },
  {
    "id": "figma-multi-11",
    "name": "白色系带连衣裙",
    "url": "/assets/design-workbench/upload/imgAsset11.png"
  },
  {
    "id": "figma-multi-12",
    "name": "粉色无袖套装",
    "url": "/assets/design-workbench/upload/imgAsset12.png"
  },
  {
    "id": "figma-multi-13",
    "name": "黑色无袖上衣",
    "url": "/assets/design-workbench/upload/imgAsset13.png"
  },
  {
    "id": "figma-multi-14",
    "name": "蓝色条纹衬衫",
    "url": "/assets/design-workbench/upload/imgAsset14.png"
  },
  {
    "id": "figma-multi-15",
    "name": "黄色半身裙",
    "url": "/assets/design-workbench/upload/imgAsset15.png"
  },
  {
    "id": "figma-multi-16",
    "name": "粉色吊带套装",
    "url": "/assets/design-workbench/upload/imgAsset16.png"
  }
];

export async function prepareMainImage(asset: LibraryImage): Promise<Omit<CanvasImage, 'x' | 'y'>> {
  const image = new Image();
  image.src = asset.url;
  await image.decode();
  return { id: crypto.randomUUID(), name: asset.name, mimeType: asset.mimeType, uploadedAt: asset.uploadedAt, url: asset.url, width: image.naturalWidth, height: image.naturalHeight, image };
}
