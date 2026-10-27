import type { GenerationRecord } from './components/CanvasLeftPanel';

// Prepared showcase data; these results are generated assets, not live AI calls.
export const PROMO_TASK_SEED_VERSION = '2026-10-13-kol-4';
const asset = (name: string) => `/assets/design-workbench/promo-tasks/${name}.${name === 'kol-cutout' ? 'png' : 'jpg'}`;
const input = (label: string, name: string) => ({ label, image: asset(name) });
const tags = (...labels: string[]) => labels.map(label => ({ label }));
type Example = {
  key: string; title: string; inputs: GenerationRecord['tags']; outputs: string[];
  prompt?: string; ratio?: string; resolution?: string; parameters?: GenerationRecord['tags'];
  printMode?: 'position' | 'repeat';
};

const examples: Example[] = [
  {
    key: 'quick-edit', title: '快捷编辑', inputs: [input('原图', 'kol-city')], outputs: ['kol-quick'], ratio: '2:3', resolution: '2K',
    prompt: '将牛仔外套换成巧克力棕色麂皮短夹克，保留原来的版型，搭配黄铜纽扣。保持人物、围巾、短裤、长靴和街景不变，呈现自然的秋日街拍质感。',
  },
  {
    key: 'local-edit', title: '款式 - 局部修改', inputs: [input('服装图', 'kol-coast')], outputs: ['kol-local'], ratio: '2:3', resolution: '2K',
    prompt: '把卷袖改成及肘的泡泡袖，袖口做窄收口，增加轻盈的度假感。保留米白亚麻、衬衫领、抽绳腰和贴袋，人物动作及背景不变。',
  },
  {
    key: 'print-on-body', title: '款式 - 印花上身', inputs: [input('服装图', 'mask-dress'), input('印花图', 'print-source')], outputs: ['kol-print'], ratio: '2:3', resolution: '2K',
    printMode: 'repeat', parameters: tags('满印', '印花缩放：0.25'),
  },
  {
    key: 'replace-fabric', title: '款式 - 面料替换', inputs: [input('服装图', 'kol-coast'), input('面料图', 'fabric-source')], outputs: ['kol-stripe'], ratio: '2:3', resolution: '2K', parameters: tags('应用位置：全身'),
  },
  {
    key: 'garment-color', title: '款式 - 颜色修改', inputs: [input('服装图', 'kol-coast')], outputs: ['kol-rose'], ratio: '2:3', resolution: '2K',
    parameters: [{ label: '#BB9CAC', color: '#BB9CAC' }, ...tags('改色区域：全部')],
  },
  {
    key: 'try-on', title: '款式 - AI试衣', inputs: [input('服装图', 'kol-coast'), input('模特图', 'kol-city')], outputs: ['kol-tryon'], ratio: '2:3', resolution: '2K',
    prompt: '让图2的模特穿上图1的米白抽绳衬衫裙。准确保留领口、卷袖和贴袋细节，保留模特的表情、动作、长靴、手袋及咖啡店街景，衣服自然贴合身体。',
  },
  {
    key: 'flat-3d', title: '款式 - 转3D平铺', inputs: [input('服装图', 'kol-coast')], outputs: ['kol-flat'], ratio: '2:3', resolution: '2K', parameters: tags('选择区域：全身', '生成面：正面'),
  },
  {
    key: 'multi-view', title: '款式 - 多视角', inputs: [input('服装图', 'kol-coast'), input('背面参考图', 'kol-back')], outputs: ['kol-back'], ratio: '2:3', resolution: '2K', parameters: tags('视角：背面'),
  },
  {
    key: 'variations', title: '款式 - 款式裂变', inputs: [input('服装图', 'kol-coast')], outputs: ['kol-local', 'kol-sage', 'kol-blue', 'kol-rose'],
    parameters: tags('连衣裙', '衬衫领', '抽绳收腰', '短款', '亚麻', '发散程度：中'),
  },
  {
    key: 'print-design', title: '印花 - 印花设计', inputs: [input('原图', 'print-source')], outputs: ['print-designed'], ratio: '1:1', resolution: '2K',
    prompt: '保留手绘野花的自然笔触，加入少量陶土橙花朵，与靛蓝枝叶搭配。米白底色，花型疏密有变化，适合轻盈的夏日度假衬衫和短裤。',
  },
  {
    key: 'style-transfer', title: '印花 - 风格迁移', inputs: [input('原图', 'print-source'), input('参考图', 'print-woodblock')], outputs: ['print-woodblock'], ratio: '1:1', resolution: '2K',
  },
  {
    key: 'seamless', title: '印花 - 四方连续', inputs: [input('原图', 'print-source')], outputs: ['print-repeat'], parameters: tags('拼接', '缩放：0.5'),
  },
  {
    key: 'fabric-on-body', title: '面料 - 面料上身', inputs: [input('面料图', 'fabric-source'), input('应用款式图', 'kol-coast')], outputs: ['kol-stripe'], ratio: '2:3', resolution: '2K', parameters: tags('面料缩放：0.5', '应用位置：全身'),
  },
  {
    key: 'fabric-create', title: '面料 - 面料创款', inputs: [input('面料图', 'fabric-source')], outputs: ['kol-creative'], ratio: '2:3', resolution: '2K', parameters: tags('面料比例：1:1'),
    prompt: '用这块蓝白条纹亚麻设计一套夏日街头套装：修身无袖马甲配高腰短裤，保留自然织纹和清晰条纹。搭配棕色手袋及平底凉鞋，年轻亚洲女生在树影下的咖啡店门前自然抓拍。',
  },
  {
    key: 'fabric-color', title: '面料 - 颜色修改', inputs: [input('面料图', 'fabric-source')], outputs: ['fabric-sage'], ratio: '1:1', resolution: '2K',
    parameters: [{ label: '#839582', color: '#839582' }, ...tags('改色区域：自定义')],
    prompt: '只将蓝色条纹改为鼠尾草绿，保留米白底色、条纹间距、亚麻织纹与原有褶皱。',
  },
  {
    key: 'sketch-to-product', title: '线稿 - 线稿转实物', inputs: [input('线稿图', 'kol-sketch')], outputs: ['kol-flat'], ratio: '2:3', resolution: '2K',
    prompt: '将线稿还原为米白亚麻衬衫裙。保留衬衫领、卷袖袢、隐藏门襟、抽绳腰及两个贴袋，表现柔软的亚麻肌理和自然褶皱，浅灰背景，正面立体平铺，无模特。',
  },
  {
    key: 'product-to-sketch', title: '线稿 - 实物转线稿', inputs: [input('实物图', 'kol-coast')], outputs: ['kol-sketch'], ratio: '2:3', resolution: '2K', parameters: tags('位置：全身', '色彩：黑白', '移除模特：是'),
  },
  {
    key: 'sketch-vector', title: '线稿 - 线稿转矢量', inputs: [input('原始线稿图', 'kol-sketch')], outputs: ['kol-sketch'],
  },
  {
    key: 'pattern-vector', title: '线稿 - 图案转矢量', inputs: [input('原始图案图', 'print-woodblock')], outputs: ['print-woodblock'], parameters: tags('分层方式：按颜色分层'),
  },
  {
    key: 'upscale', title: '高清放大', inputs: [input('原图', 'kol-city')], outputs: ['kol-city'], resolution: '2K',
  },
  {
    key: 'remove-background', title: '一键去底', inputs: [input('原图', 'kol-coast')], outputs: ['kol-cutout'],
  },
  {
    key: 'smart-cutout', title: '智能抠图', inputs: [input('原图', 'mask-person')], outputs: ['kol-cutout'],
  },
  {
    key: 'crop', title: '智能裁图', inputs: [input('原图', 'kol-coast')], outputs: ['kol-crop'], ratio: '1:1',
  },
  {
    key: 'outpaint', title: 'AI扩图', inputs: [input('原图', 'kol-coast')], outputs: ['kol-outpaint'], resolution: '2K', parameters: tags('扩图倍数：自定义'),
  },
  {
    key: 'erase', title: 'AI消除', inputs: [input('原图', 'mask-bag')], outputs: ['kol-erase'],
  },
];

const showcaseRecords: GenerationRecord[] = examples.map((example, index) => {
  const id = `promo-task-${example.key}`;
  const urls = example.outputs.map(asset);
  const square = example.outputs[0].startsWith('print-') || example.outputs[0].startsWith('fabric-') || example.outputs[0] === 'kol-crop';
  const height = square ? 92 : example.outputs[0] === 'kol-outpaint' ? 92 * 2 / 3 : 138;
  return {
    id, title: example.title, time: `2026-10-13 10:${String(58 - index * 2).padStart(2, '0')}`,
    supportsPrompt: !!example.prompt, prompt: example.prompt, printMode: example.printMode,
    tags: [...example.inputs, ...(example.parameters ?? [])], ratio: example.ratio,
    resolution: example.resolution, count: urls.length, replayable: true,
    demoOutputUrls: urls,
    images: urls.map((url, resultIndex) => ({ id: `${id}-result-${resultIndex}`, url, height, status: 'success' })),
  };
});

const variationExample = showcaseRecords.find(record => record.id === 'promo-task-variations')!;
const failureExample: GenerationRecord = {
  ...variationExample,
  id: 'promo-task-partial-failure',
  time: '2026-10-13 10:08',
  images: variationExample.images.map((image, index) => ({
    ...image,
    id: `promo-task-partial-failure-result-${index}`,
    status: index === 3 ? 'failed' : 'success',
  })),
};
export const initialDemoRecords: GenerationRecord[] = [...showcaseRecords, failureExample];

/** One-time requested cleanup: keep the new showcase and one old failed task. */
export function restoreTaskExamples(records: GenerationRecord[], seedVersion?: string): GenerationRecord[] {
  if (seedVersion === PROMO_TASK_SEED_VERSION) return records;
  const showcaseIds = new Set(showcaseRecords.map(record => record.id));
  const retainedFailure = records.find(record =>
    !showcaseIds.has(record.id) && record.images.some(image => image.status === 'failed')
  ) ?? failureExample;
  // Keep intentional deletions of showcase examples when upgrading an existing set.
  const retainedShowcase = seedVersion?.startsWith('2026-10-13-kol-')
    ? records.filter(record => showcaseIds.has(record.id))
    : showcaseRecords;
  const multiView = showcaseRecords.find(record => record.id === 'promo-task-multi-view')!;
  const outpaint = showcaseRecords.find(record => record.id === 'promo-task-outpaint')!;
  return [...retainedShowcase.map(record => {
    if (record.id === outpaint.id) return { ...record, tags: outpaint.tags, ratio: undefined };
    if (record.id === multiView.id) return { ...record, tags: multiView.tags };
    return record;
  }), retainedFailure];
}
