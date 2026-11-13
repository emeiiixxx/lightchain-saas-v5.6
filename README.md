# Lightchain SaaS v5.6 · 独立 Demo

基于 v5.5 工作副本建立，包含融合画布、视频工作台及设计生产工作台，沿用 v5.1 Beta 组件、深浅主题和中英日文。

## 来源

- 复制日期：2026-10-26。
- 来源目录：`/Users/emeiii/Documents/ChatGPT/SaaS v5.5/lightchain-saas-v5.5`。
- 来源提交：`d718401504409a608ee20b500bbc1615d3f9eafb`。
- 包含来源目录尚未提交的视频工作台文案修改：“从下方选择一个功能或点击添加素材，开启您的创作”。
- 原 v5.5 项目保留；本项目使用目标目录已有的独立 Git 仓库。

## 本地运行

首次安装依赖时执行 `npm ci`。

```sh
npm run dev -- --port 5176
```

- Flow 画布：`http://127.0.0.1:5176/#/canvas`
- 视频工作台：`http://127.0.0.1:5176/#/video-workspace`
- 设计生产工作台：`http://127.0.0.1:5176/#/design-workspace`

以上为启动后的地址；复制操作不会自动启动服务。生产构建命令为 `npm run build`。

## 版本与数据

包名 `lightchain-saas-v5.6`，版本 `5.6.0`。本地偏好、提示词存储与跨标签页同步使用 `lc-v56-` 前缀，与 v5.5 隔离。

项目仍为前端交互 Demo，具体功能的演示与服务边界见 `AGENTS.md` 和 `docs/`。复制项目不代表新增需求已经实现。

## 发布

- 独立仓库：[lightchain-saas-v5.6](https://github.com/emeiiixxx/lightchain-saas-v5.6)
- Flow 画布：[打开 Demo](https://emeiiixxx.github.io/lightchain-saas-v5.6/#/canvas)
- 视频工作台：[打开 Demo](https://emeiiixxx.github.io/lightchain-saas-v5.6/#/video-workspace)
- 设计生产工作台：[打开 Demo](https://emeiiixxx.github.io/lightchain-saas-v5.6/#/design-workspace)

推送 `main` 后，由 GitHub Actions 检查资源别名、画布性能、布局／选图、选择及工作台状态隔离，再执行 Pages 构建与部署。每次更新以对应提交的 Pages 工作流部署成功为准。

## 开发参考

- `src/main.tsx`：融合／视频工作台入口；`src/design-workbench/main.tsx`：设计生产工作台入口。
- 生成、解析及部分任务使用固定素材和模拟计时；不能将演示结果当作真实服务实现。
- 资源别名兼容已保存画布中的旧地址，不按文件重复或静态搜索无引用直接删除；用 `node scripts/sync-asset-aliases.mjs --check` 核对映射。
- 本轮仓库检查及维护风险见 [2026-11-13 检查记录](docs/repository-audit-2026-11-13.md)。

## 文档与来源

- [v5.6 产品需求文档](https://lightchain.feishu.cn/docx/TeGQdO1uFowzxJxvRiCc8cMMn7f)
- `AGENTS.md`：当前版本约定及继承的交互规则。
- `docs/`：设计、素材与实现来源；历史版本链接保持原样。
- `artifacts/`：继承的历史视觉记录，不代表本次复制后的验证结果。
- `src/`、`public/`：应用源码与运行时素材。

验证范围以具体检查记录和对应提交的 CI 结果为准；构建通过不等于浏览器交互验收。
