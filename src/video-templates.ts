import type { Locale } from './i18n';
import { videoTemplateReferenceSets, type VideoTemplateReferenceSet } from './video-template-reference-assets';
import type { VideoWorkflow } from './video-workflow';
import { videoAssets } from './video-assets';

type LocalizedText = Record<Locale, string>;
type TemplateMedia = { video: string; poster: string; width?: number; height?: number };

export type VideoTemplateId = 'commerce' | 'creator' | 'runway' | 'brand' | 'launch' | 'fabric' | 'live' | 'wholesale';
export type VideoTemplateImageSlot = 'garment' | 'model';
export type VideoTemplateReplacements = Partial<Record<VideoTemplateImageSlot, { url: string; name: string }>>;
export type VideoTemplateWorkflow = Pick<VideoWorkflow, 'mode' | 'generationMode' | 'ratio' | 'resolution' | 'duration' | 'audio' | 'smartExpand'> & {
  prompt: LocalizedText;
  inputs: readonly {
    slot: VideoTemplateImageSlot;
    target: 'main' | 'endFrame' | 'references';
    images: readonly string[];
  }[];
};
export type VideoTemplate = {
  id: VideoTemplateId;
  label: LocalizedText;
  preview?: 'portrait' | 'landscape';
  media?: TemplateMedia;
  description?: LocalizedText;
  references?: VideoTemplateReferenceSet;
  workflow?: VideoTemplateWorkflow;
};

const creatorImage = `${import.meta.env.BASE_URL}assets/video-template-creator/reference.jpg`;

// Figma examples and the creator assets supplied by the user.
export const videoTemplates: readonly VideoTemplate[] = [
  {
    id: 'commerce',
    label: { 'zh-CN': '电商视频', en: 'E-commerce', ja: 'EC動画' },
    preview: 'portrait',
    references: videoTemplateReferenceSets.commerce,
    workflow: {
      mode: 'references', generationMode: 'fast', ratio: '9:16', resolution: '2K', duration: '10s', audio: 'auto', smartExpand: false,
      inputs: [
        { slot: 'garment', target: 'references', images: videoTemplateReferenceSets.commerce.subjects },
        { slot: 'model', target: 'references', images: [videoTemplateReferenceSets.commerce.modelPreview] },
      ],
      prompt: {
        'zh-CN': '让参考人物展示参考商品，保持商品款式、面料和人物形象一致。依次展示全身穿着效果、侧面版型和面料细节，动作自然，镜头平稳衔接，突出商品的穿着效果。',
        en: 'Show the reference model wearing the reference products. Preserve the clothing design, fabric and model identity. Move smoothly between full-body looks, side profiles and fabric details with natural motion.',
        ja: '参考人物に参考商品を着用させ、デザイン、素材、人物の外見を保ちます。全身、側面のシルエット、素材のディテールを自然な動きと滑らかなカメラで順に見せてください。',
      },
    },
    description: {
      'zh-CN': '让消费者快速看清衣服的款式、版型、穿着效果和购买理由',
      en: 'Help shoppers quickly understand the style, fit, look and reasons to buy.',
      ja: '服のデザイン、シルエット、着用イメージ、購入する理由を素早く伝えます。',
    },
  },
  {
    id: 'creator',
    label: { 'zh-CN': '博主种草', en: 'Creator picks', ja: 'クリエイター紹介' },
    preview: 'portrait',
    media: { video: `${import.meta.env.BASE_URL}assets/video-template-creator/creator.mp4`, poster: creatorImage, width: 1124, height: 1844 },
    references: { subjects: [], subjectThumbnail: creatorImage, modelThumbnail: creatorImage, modelPreview: creatorImage },
    workflow: {
      mode: 'references', generationMode: 'professional', ratio: '3:4', resolution: '720p', duration: '5s', audio: 'auto', smartExpand: false,
      inputs: [
        { slot: 'garment', target: 'references', images: [] },
        { slot: 'model', target: 'references', images: [creatorImage] },
      ],
      prompt: {
        'zh-CN': '以参考人物与穿搭为主体，呈现自然的博主日常分享。保持人物形象与服装细节一致，在阳光下的街边场景中轻微转头、自然看向镜头，发丝与衣摆随微风轻动，镜头缓慢推进，突出穿搭质感；如提供商品参考图，将人物服装替换为参考商品。',
        en: 'Create a natural creator-style outfit moment using the reference model and styling. Preserve identity and clothing details in a sunlit street setting, with a gentle turn toward the camera, a light breeze and a slow camera push. If a product reference is supplied, dress the model in that product.',
        ja: '参考人物とコーディネートで、自然な日常紹介動画を作成します。人物の外見と服のディテールを保ち、日差しのある街角でゆっくりカメラに顔を向け、髪や裾が微風で揺れる様子を描きます。商品参考画像がある場合、その商品に着替えさせてください。',
      },
    },
    description: {
      'zh-CN': '用自然的日常穿搭分享，展示服装质感与上身效果',
      en: 'Show the fabric and fit through a natural everyday outfit moment.',
      ja: '自然な日常のコーディネートで、服の質感と着用イメージを伝えます。',
    },
  },
  { id: 'runway', label: { 'zh-CN': '高级秀场', en: 'Runway', ja: 'ランウェイ' } },
  {
    id: 'brand',
    label: { 'zh-CN': '品牌故事', en: 'Brand story', ja: 'ブランドストーリー' },
    preview: 'landscape',
    references: videoTemplateReferenceSets.brand,
    workflow: {
      mode: 'references', generationMode: 'fast', ratio: '16:9', resolution: '2K', duration: '10s', audio: 'auto', smartExpand: false,
      inputs: [
        { slot: 'garment', target: 'references', images: videoTemplateReferenceSets.brand.subjects },
        { slot: 'model', target: 'references', images: [videoTemplateReferenceSets.brand.modelPreview] },
      ],
      prompt: {
        'zh-CN': '围绕参考商品与参考人物讲述品牌故事，保持商品设计和人物形象一致。结合人物穿着、场景氛围与面料工艺特写，镜头自然衔接，展示服装的设计细节和品牌气质。',
        en: 'Tell a brand story using the reference products and model. Preserve the product designs and model identity. Connect styled looks, atmospheric settings and fabric craftsmanship with smooth camera transitions.',
        ja: '参考商品と参考人物でブランドストーリーを描きます。商品のデザインと人物の外見を保ち、着用シーン、空間の雰囲気、素材や縫製の細部を滑らかな映像でつないでください。',
      },
    },
    description: {
      'zh-CN': '通过人物、场景和细节，让观众理解品牌为何做这件衣服',
      en: 'Use people, settings and details to tell the story behind the garment.',
      ja: '人物、シーン、ディテールを通じて、この服に込めたブランドの想いを伝えます。',
    },
  },
  { id: 'launch', label: { 'zh-CN': '新品预热', en: 'Product launch', ja: '新作ティーザー' } },
  { id: 'fabric', label: { 'zh-CN': '面料工艺', en: 'Fabric & craft', ja: '素材と技術' } },
  { id: 'live', label: { 'zh-CN': '直播预热', en: 'Livestream teaser', ja: 'ライブ配信予告' } },
  { id: 'wholesale', label: { 'zh-CN': '招商订货', en: 'Wholesale', ja: '商談・受注' } },
];

export function videoTemplateMedia(template: VideoTemplate): TemplateMedia {
  return template.media ?? (template.preview === 'portrait'
    ? { video: videoAssets.portraitVideo, poster: videoAssets.portraitPoster }
    : { video: videoAssets.landscapeVideo, poster: videoAssets.landscapePoster });
}

export const videoTemplateMessages = {
  'zh-CN': {
    title: '热门视频模版', categories: '模版分类', close: '关闭',
    appearanceLock: '形象锁定：', yes: '是', no: '否',
    uploadTitle: '上传对应素材，替换模版中的商品或人物',
    uploadRequirement: '使用模版生成时，服装图/模特图2选1，必填',
    garment: '上传服装图', model: '上传模特图',
    garmentPlaceholder: '替换模版商品', modelPlaceholder: '替换模版人物',
    replace: '替换图片', remove: '删除图片', reading: '正在读取图片…',
    uploadError: '请上传 JPG、JPEG、PNG 或 WebP 图片，单张不超过 20 MB。',
    singleImage: '每处最多上传 1 张图片。', decodeError: '图片读取失败，请重新选择。',
    formats: '支持 JPG、JPEG、PNG、WebP，单张不超过 20 MB',
    emptyTitle: '暂无数据', emptyDescription: '当前没有可展示的内容',
    edit: '编辑模版', generate: '立即生成',
    preparing: '正在准备素材…', generateError: '模版素材读取失败，请重试。',
    videoUnavailable: '预览视频暂不可用', videoError: '视频加载失败，请稍后重试',
  },
  en: {
    title: 'Popular video templates', categories: 'Template categories', close: 'Close',
    appearanceLock: 'Appearance locked: ', yes: 'Yes', no: 'No',
    uploadTitle: 'Upload matching images to replace the template’s product or model',
    uploadRequirement: 'A garment image or model image is required to generate from this template.',
    garment: 'Upload garment image', model: 'Upload model image',
    garmentPlaceholder: 'Replace template product', modelPlaceholder: 'Replace template model',
    replace: 'Replace image', remove: 'Remove image', reading: 'Reading image…',
    uploadError: 'Upload a JPG, JPEG, PNG or WebP image, up to 20 MB.',
    singleImage: 'Upload one image per field.', decodeError: 'Could not read this image. Please choose another.',
    formats: 'JPG, JPEG, PNG or WebP, up to 20 MB per image',
    emptyTitle: 'No data yet', emptyDescription: 'There is no content to display',
    edit: 'Edit template', generate: 'Generate now',
    preparing: 'Preparing assets…', generateError: 'Could not load the template assets. Please try again.',
    videoUnavailable: 'Video preview is currently unavailable', videoError: 'Video could not load. Please try again later.',
  },
  ja: {
    title: '人気動画テンプレート', categories: 'テンプレートの分類', close: '閉じる',
    appearanceLock: '外見固定：', yes: 'あり', no: 'なし',
    uploadTitle: '素材をアップロードして、テンプレートの商品や人物を差し替え',
    uploadRequirement: 'テンプレートで生成するには、服装画像またはモデル画像が必要です。',
    garment: '服装画像をアップロード', model: 'モデル画像をアップロード',
    garmentPlaceholder: 'テンプレートの商品を差し替え', modelPlaceholder: 'テンプレートの人物を差し替え',
    replace: '画像を差し替え', remove: '画像を削除', reading: '画像を読み込み中…',
    uploadError: 'JPG・JPEG・PNG・WebP形式、1枚20 MB以内の画像を選択してください。',
    singleImage: '各欄にアップロードできる画像は1枚です。', decodeError: '画像を読み込めませんでした。別の画像を選択してください。',
    formats: 'JPG・JPEG・PNG・WebP形式、1枚20 MB以内',
    emptyTitle: 'データがありません', emptyDescription: '現在表示できるコンテンツはありません',
    edit: 'テンプレート編集', generate: '今すぐ生成',
    preparing: '素材を準備中…', generateError: 'テンプレートの素材を読み込めませんでした。再度お試しください。',
    videoUnavailable: '動画プレビューは現在利用できません', videoError: '動画を読み込めませんでした。後でもう一度お試しください。',
  },
} satisfies Record<Locale, Record<string, string>>;
