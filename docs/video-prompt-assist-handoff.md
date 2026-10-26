# 提示词扫光按钮：归档组件示例

本文仅保存 `PromptAssistButton` 与 `GradientText` 的扫光效果和复用示例，不作为当前视频节点需求。视频工作台的短视频、长视频及放大输入框使用「智能扩写」开关，接入规范见 [智能扩写开关交付](video-smart-expand-handoff.md)。扫光组件源码保留，当前视频节点不调用。

## 颜色与外观

| 主题 | 默认基色 | 悬停基色 | 扫光颜色 |
| --- | --- | --- | --- |
| 深色 | `Text/link` · `#0BC1B8` | `Text/link-hover` · `#70EBDE` | `Brand/200` · `#A7FCF0`，以50%不透明度叠在当前基色上 |
| 浅色 | `Text/link` · `#069B96` | `Text/link-hover` · `#0BC1B8` | `Brand/200` · `#A7FCF0`，以50%不透明度叠在当前基色上 |

图标与文字共用按钮的 `currentColor`：默认读取 `--text-link`，悬停读取 `--text-link-hover`，移出后恢复默认。扫光读取 `--prompt-assist-highlight`，仅显示在图标与字形内部。深浅模式均使用 `color-mix(in srgb, var(--primitive-brand-200) 50%, currentColor)`，等同于Brand/200以50%不透明度叠在当前基色上，文字与图标本身保持不透明。Brand/200来自5.1 Beta的Primitive Colors（VariableID:30:5）。悬停切换沿用200ms ease-out，不重启扫光；切换主题时即时换色，保持当前动画进度。

复用时沿用 Beta Ghost 按钮：高24px、左右内边距8px、圆角6px，图标16px，图文间距4px，文字12px/20px、字重500。悬停沿用 State/hover，保留键盘聚焦反馈，不显示 tooltip。

## 动效配置

基于设计提供的 React Bits `GradientText` 源码，新增本地 `shimmer` 分支，复用图文共用尺寸和动画生命周期。使用项目 TypeScript，无新增依赖。

| 参数 | 取值 |
| --- | --- |
| `variant` | `shimmer`，本地扫光分支 |
| `angle` | `90`，从左到右 |
| `animationSpeed` | `2`，单次扫光2秒 |
| `pauseDuration` | `1`，每次扫光后停顿1秒 |
| 光带宽度 | 整条图文宽度的60%，中心向两侧各延伸30%并柔和衰减 |
| `glow` | `0`，无外发光 |
| `yoyo` | `false` |
| `showBorder` | `false` |
| `pauseOnHover` | `false` |
| `followPointer` | `false` |

总周期3秒：单条柔和光带用2秒从图标左缘进入，经过文字并从文字右缘离开；随后停顿1秒，只显示纯当前基色（默认Text/link、悬停Text/link-hover），再开始下一次。始终从左向右，不倒放、不加外发光。

图标和文字以整条图文内容的尺寸共用同一扫光坐标，文字不重新起光。文案或语言变化时，坐标随内容尺寸自动同步。

悬停和聚焦等状态沿用200ms ease-out。按钮离开视口或浏览器进入后台时暂停，返回后继续；卸载清理动画。系统开启减少动态效果时使用纯当前基色，不播放扫光。高对比度模式使用可见的普通文字与图标。

## 文案与点击

- 输入为空或只有空格、换行：显示「提示词生成」，点击传出 `generate`。
- 输入包含有效内容：显示「提示词扩写」，点击传出 `expand`。
- 输入、清空、应用提示词后即时切换。
- 按钮只负责显示和传出操作，调用方负责接入服务。以下示例不包含请求、结果写回或请求中状态，不代表已接入 AI 服务。

## 源码与接入

| 文件 | 用途 |
| --- | --- |
| `src/components/PromptAssistButton.tsx`、`.css` | 业务按钮、文案判断、图标和文字布局 |
| `src/components/GradientText.tsx`、`.css` | 本地 shimmer 分支、图文共用尺寸及动画生命周期 |
| `src/tokens.css` | 深浅主题的 Text/link 颜色变量 |

按钮依赖项目现有 `ui` 中的 Beta `Button`，图标继续使用设计导出的原SVG。迁入其他项目时，一并映射 Button、图标及颜色变量。

```tsx
import { PromptAssistButton } from './PromptAssistButton';

function ExamplePromptAction({ prompt, promptIcon, onPromptAssist }) {
  return (
  <PromptAssistButton
    value={prompt}
    icon={promptIcon}
    onAction={kind => onPromptAssist(kind, prompt)}
  />
  );
}
```

`onPromptAssist` 由业务调用方提供。中英日文可通过 `generateLabel`、`expandLabel` 传入文案，默认使用中文。

## 验收要点

复用该组件时，图标与文字均使用上表颜色；空白与有内容时的名称、点击操作一致；扫光从图标延续到文字，光带宽度为整条图文的60%，2秒扫完、停1秒后循环，不倒放、无外发光；切换文案或语言后光带仍连续，布局不跳动；停顿期间及减少动态效果时显示纯当前基色；键盘可聚焦和触发按钮。
