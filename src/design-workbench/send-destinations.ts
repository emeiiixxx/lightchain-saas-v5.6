// Stable IDs stay independent of localized menu labels.
export const modelDestinations = [
  { id: 'model-customization', zh: '模特定制', en: 'Model Customization', ja: 'モデルカスタマイズ' },
  { id: 'model-face-swap', zh: '模特换脸', en: 'Model Face Swap', ja: 'モデル顔交換' },
  { id: 'model-replacement', zh: '模特替换', en: 'Model Replacement', ja: 'モデル差し替え' },
  { id: 'body-adjustment', zh: '身材调整', en: 'Body Adjustment', ja: '体型調整' },
  { id: 'clothing-size', zh: '服装尺码', en: 'Clothing Size', ja: '服のサイズ' },
  { id: 'pose-adjustment', zh: '姿势调整', en: 'Pose Adjustment', ja: 'ポーズ調整' },
  { id: 'background-adjustment', zh: '背景调整', en: 'Background Adjustment', ja: '背景調整' },
  { id: 'view-adjustment', zh: '视角调整', en: 'View Adjustment', ja: 'アングル調整' },
] as const;
export const sendDestinations = [
  { id: 'outfit-fusion', zh: '万能穿搭融合', en: 'Outfit Fusion', ja: 'コーデ融合' },
  { id: 'model-planning', zh: '模特企划库', en: 'Model Planning', ja: 'モデル企画ライブラリ', children: modelDestinations },
  { id: 'directed-fashion-design', zh: '服装定向设计', en: 'Directed Fashion Design', ja: '服装指定デザイン' },
  { id: 'video-workbench', zh: '视频工作台', en: 'Video Workbench', ja: '動画ワークスペース' },
  { id: 'marketing-workbench', zh: '万能营销工作台', en: 'Marketing Workbench', ja: 'マーケティングワークスペース' },
  { id: 'ai-experiment-workbench', zh: 'AI实验工作台', en: 'AI Experiment Workbench', ja: 'AI実験ワークスペース' },
  { id: 'clothing-model', zh: '服装模型', en: 'Clothing Model', ja: '服装モデル' },
] as const;
export type SendDestinationId = Exclude<typeof sendDestinations[number]['id'], 'model-planning'> | typeof modelDestinations[number]['id'];
