# 开发、发布与宿主验收指南

## 1. 本地检查

开发与 CI 统一使用 Node.js 24（`.nvmrc`、`.node-version`），插件要求 Paseo 宿主版本 `>= 0.8.0`（`paseo-plugin.json`）。

```bash
npm ci
npm run check
```

`npm run check` 是本地与 CI 统一的质量检查护栏，涵盖类型检查（`typecheck`）、单元测试（`test`）、Lint、Prettier 格式及发布包结构校验（`check:package`）。发版前可运行 `npm pack --dry-run` 核对待打包文件。

## 2. 发布流程

### 2.1 发布机制与准备

发布通过 [GitHub Actions Release 工作流](../.github/workflows/release.yml) 在版本 tag（`v<version>`）上手动触发。工作流自动发布带有 provenance 的 npm 包，完成完整性与签名校验后创建 GitHub Release 并附加同一 npm tarball。

**前置准备**：

1. **NPM 凭据**：在仓库 Actions Secret 中配置 `NPM_TOKEN`（具备发布权限的 npm granular token，并开启 Bypass 2FA）。
2. **质量与验收**：本地运行 `npm run check` 并通过，完成第 3 节宿主手工验收。
3. **版本说明**：编写 `docs/releases/<version>.md`，同步更新 `README.md`、`README.zh-CN.md` 及 `OVERVIEW.md`。

### 2.2 发布步骤

```bash
VERSION="0.1.4" # 替换为目标版本号

npm version "$VERSION" --no-git-tag-version --ignore-scripts
# 编辑 docs/releases/$VERSION.md、README 及 OVERVIEW.md
npm run check
git add package.json package-lock.json "docs/releases/$VERSION.md" README.md README.zh-CN.md OVERVIEW.md
git commit -m "chore(release): $VERSION"
git tag -a "v$VERSION" -m "v$VERSION"
git push --atomic origin main "refs/tags/v$VERSION"
gh workflow run release.yml --ref "v$VERSION"
```

工作流会验证 tag 与 `package.json`、`package-lock.json` 版本一致性，执行检查后发布至 npm，并在校验产物一致性与签名后生成 GitHub Release。

### 2.3 校验与异常恢复

- **本地复核**：在包含对应 tag 的源码目录运行 `npm run verify:release`，核对 npm 元数据、tarball 与本地待打包文件的一致性。
- **发布失败**：若因凭据或网络问题导致 npm 发布失败，修复后在同一 tag 上重跑工作流。
- **重试恢复**：若 npm 已发布成功但在后续校验或创建 Release 步骤失败，重跑工作流会自动跳过重复发包，重新验证并同步 GitHub Release。
- **版本不可变**：npm 版本一旦发布无法覆盖，严禁移动或删除已有 tag。若发现包内容或 provenance 异常，须修复问题后递增版本号发布新版本。

---

## 3. 宿主手工验收指南 (Manual Host Acceptance Guide)

`npm run check` 检查源码、测试和发布包结构；宿主加载、布局和交互行为按以下步骤在 Paseo 中验收：

### 3.1 宿主前置条件

1. 检查目标 Paseo 守护进程配置（`<home>/config.json`），确认 `pluginsEnabled: true`。
2. 运行 `paseo daemon status --json` 查看当前守护进程运行状态。

### 3.2 插件安装与加载验证

- **本地源码链接（推荐调试方式）**：
  ```bash
  paseo plugin link /absolute/path/to/paseo-kanban
  ```
- **或本地发布包安装测试**：
  ```bash
  PACKAGE_TARBALL=$(npm pack --silent)
  paseo plugin install "./$PACKAGE_TARBALL"
  ```
- **检查运行状态**：
  ```bash
  paseo plugin ls
  ```
  确认 `paseo-kanban` 处于 `running` 状态且无报错。若有异常，执行 `paseo plugin logs paseo-kanban` 查看日志。

### 3.3 核心功能手工验收清单

1. **入口与分屏**：侧边栏入口默认展示全部任务；工作区 `+` 标签页默认筛选当前项目。支持与 Agent、Terminal 并排分屏及窄分屏横向滚动。
2. **任务与泳道编辑**：创建/编辑任务并保存描述与子步骤，重开看板完整保留；支持添加与重命名泳道；完成泳道及包含未完成任务的普通泳道受删除保护。
3. **项目关联与筛选**：任务模态框关联项目；工具栏按项目过滤即时生效，清除筛选恢复全部展示。
4. **版本并发冲突 (CAS)**：多会话同时编辑时，旧版本提交失败并保留草稿，提示版本冲突，宿主新数据不被覆盖。
5. **拖拽手势交互**：鼠标位移 ≥5px 触发拖拽，<5px 判定为轻点；触屏长按 220ms 抓起，快速滑动让渡原生滚动；支持跨泳道动态避让与平滑落位。
6. **多语言与热重载**：切换系统语言（中/英）界面即时响应；执行 `paseo plugin reload paseo-kanban` 热重载生效，无需重启守护进程。
7. **任务完成与恢复**：卡片左侧勾选或拖入完成泳道即完成，按时间倒序展示；取消勾选恢复至原归属泳道末尾，拖出普通泳道按实际落点恢复。
8. **操作反馈**：按[编码约定](./coding-standards.md)验收通知行为，并检查关窗后可见性、多入口去重、中英文及深浅色、窄屏呈现。

## 4. 官方市场素材与验收

### 4.1 市场素材规范

市场静态素材存放在 `assets/marketplace/` 目录（不纳入 npm 发布包）：

- **图标**：`icon.png` 为 512×512 无文字看板图标。
- **截图**：按顺序展示全景（`board-*.png`）、任务编辑（`task-editor-*.png`）与分屏场景（`workspace-split-*.png`）。
- **链接引用**：官方 registry record（`listing`）中的素材 URL 必须使用完整 commit SHA 固定，不使用浮动分支。

### 4.2 申请与验收流程

1. **元数据与文案**：市场显示名称统一为 `Kanban`。展示名称、图标与截图在官方 registry record 中维护；插件市场介绍以发布包中的 `OVERVIEW.md` 为准。
2. **提交申请**：按官方 submission 模板向插件注册表提交收录或更新，提供对应的 npm 版本、GitHub Release 及验证证据。
3. **市场验收**：收录生效后，在独立宿主环境中通过注册表 ID 安装并按第 3 节清单验收核心功能，确认安装、加载与交互符合预期。
