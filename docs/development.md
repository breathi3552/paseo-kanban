# 开发、发布与宿主验收指南

## 1. 本地检查

开发与 CI 统一使用 Node.js 24（`.nvmrc`、`.node-version`），插件要求 Paseo 宿主版本 `>= 0.11.4`（`paseo-plugin.json`）。

```bash
npm ci
npm run check
```

`npm run check` 是本地与 CI 统一的质量检查护栏，涵盖 Portal 产物校验（`check:portal`）、类型检查（`typecheck`）、单元测试（`test`）、Lint、Prettier 格式及发布包结构校验（`check:package`）。发版前可运行 `npm pack --dry-run` 核对待打包文件。

## 2. 发布流程

### 2.1 发布机制与准备

发布通过 [GitHub Actions Release 工作流](../.github/workflows/release.yml) 在版本 tag（`v<version>`）上手动触发。工作流自动发布带有 provenance 的 npm 包，完成完整性与签名校验后创建 GitHub Release 并附加同一 npm tarball。

**前置准备**：

1. **NPM 凭据**：在仓库 Actions Secret 中配置 `NPM_TOKEN`（具备发布权限的 npm granular token，并开启 Bypass 2FA）。
2. **质量与验收**：本地运行 `npm run check` 并通过，完成第 3 节宿主手工验收。
3. **版本说明**：在 `CHANGELOG.md` 顶部按中英镜像规范追加新版本说明，同步更新 `README.md`、`README.zh-CN.md` 及 `OVERVIEW.md`。

### 2.2 发布步骤

```bash
VERSION="0.1.4" # 替换为目标版本号

npm version "$VERSION" --no-git-tag-version --ignore-scripts
# 在 CHANGELOG.md 顶部追加新版本记录，并更新 README 及 OVERVIEW.md
npm run check
git add package.json package-lock.json CHANGELOG.md README.md README.zh-CN.md OVERVIEW.md
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
2. **任务与泳道编辑**：创建/编辑任务并保存描述与子步骤，重开看板完整保留；从工具栏进入横向泳道管理（主看板泳道头部不再显示管理入口）；桌面弹窗最大宽 1120px，窄屏保留宿主 sheet；新增按钮位于管理标题右侧，点击后显示新增草稿块；泳道块顶部显示拖动把手，点击标题旁的编辑按钮改名（点击标题不触发编辑）；名称、确认/取消和移动/删除各占固定高度，切换编辑态不挤动其他控件；无底部关闭按钮，支持右上角关闭及其他支持的关闭方式退出，就地增改立即保存，左右移动或拖动排序仅预览，保存顺序后才更新主看板。拖住泳道靠近横向列表左右边缘时持续向对应方向自动滚动，指针停在边缘也能继续；回到中央、松手、取消或关窗后停止，滚动过程仍只预览排序。排序未保存时先保存或还原才能增删改；关闭直接放弃未提交内容。完成泳道及最后一条普通泳道不可删除；其余泳道为空时直接删除，有未完成任务时不显示数量地二次确认，确认后按最新范围跨项目删除，保留已完成任务。
3. **项目关联与筛选**：看板标题区下方与任务弹窗的项目选择均复用宿主 `SettingsSelect`，样式、浮层与深浅主题自适应宿主；选项按当前语言的显示名称排序。普通任务支持关联或清除项目（设为“未关联项目”），GitHub 导入任务锁定关联项目并显示禁用下拉框；任务弹窗表单字段按“标题”“泳道”“项目”顺序呈现。验收时检查窄分屏宽度自适应、超长名称截断、缺失项目 ID 回退，以及卡片拖拽与落位期间项目筛选下拉框正确禁用。规格见 [#26](https://github.com/breathi3552/paseo-kanban/issues/26)。
4. **版本并发冲突 (CAS)**：多会话同时编辑时，旧版本提交失败并保留草稿，宿主新数据不被覆盖。泳道管理允许在泳道未变化、仅任务更新时基于最新数据重试；泳道成员、名称或顺序更新时停止自动合并并保留草稿，提供放弃修改并加载最新的恢复入口。删除提交前若由空变为有未完成任务且尚未确认连带删除，须补确认；已经确认后，任务变化不重复询问。
5. **卡片手势与右键菜单**：桌面左键单击、双击或 <5px 抖动不打开详情；鼠标位移 ≥5px 触发拖拽。卡片和拖拽预览不显示把手及独立 Issue 外链图标，仅保留完成 checkbox 与发送图标；从标题、项目标签、子步骤计数、内边距与空白区域均可拖拽或右键。验证两个独立控件及其完整点击区域不触发父级拖拽或菜单，右键不执行其左键动作。触屏保留轻点详情、长按 220ms 抓起及快速滑动让渡滚动；支持跨泳道动态避让与平滑落位。桌面右键菜单提供编辑、完成/取消完成、移动、完整提示词复制、Issue 跳转与二次确认删除；移动符合筛选与完成恢复规则，复制符合已保存/默认/空白 prompt 语义且不启动 Agent。确认菜单在四个视口边缘、长泳道列表、窄分屏及深浅主题下可见；二级菜单向左避让、内部滚动不关闭，外部点击、Esc、看板滚动、尺寸及筛选变化关闭，菜单键/Shift+F10、方向键、Enter、Tab 与焦点恢复正常。检查实际剪贴板与浏览器跳转，以及删除确认遇到外部修改、刷新失败后的错误保留和恢复。
6. **多语言与热重载**：切换系统语言（中/英）界面即时响应；执行 `paseo plugin reload paseo-kanban` 热重载生效，无需重启守护进程。
7. **任务完成与恢复**：卡片左侧勾选或拖入完成泳道即完成，按时间倒序展示；取消勾选恢复至原归属泳道末尾，拖出普通泳道按实际落点恢复。
8. **操作反馈**：按[编码约定](./coding-standards.md)验收通知行为，并检查关窗后可见性、多入口去重、中英文及深浅色、窄屏呈现。
9. **GitHub Issue 导入**：从项目 GitHub 仓库单向导入 Open Issues，支持分页、排序、去重、项目锁定与外部链接打开。
10. **发送到 Agent**：从卡片发送图标打开弹窗，支持选择已有工作区、新建普通工作区或 worktree，整套应用 Agent 配置并直接发送任务内容，校验与分阶段提交反馈正常。

宿主 SDK 0.11.4 的 Modal 桌面宽度固定为 520px。任务编辑、Issue 导入与泳道管理通过 `client/business-dialog.tsx` 声明各自的尺寸、滚动和关闭策略；宽屏 Web 使用 `client/web.ts` 创建自己的 Portal 容器，位于应用内容之上、宿主 overlay plane 之下，不读取或修改宿主私有 DOM。窄屏和原生客户端仍使用宿主 Modal，尺寸与安全区由宿主拥有。

按 [#39](https://github.com/breathi3552/paseo-kanban/issues/39) 验收三个弹窗的差异：泳道管理最大宽 1120px 及横向预览；导入最大宽 840px、90vw 宽度及长列表内部滚动；任务编辑最大宽 520px、编辑态 57vh、描述调整及输入焦点可见性。分别检查深浅主题、窄分屏、原生客户端、Esc、Tab/Shift+Tab 圈定与关窗焦点恢复，以及保存中任务编辑/导入拒绝关闭、泳道保存允许关窗后继续完成的既有规则。保存/失败 Toast 和命令面板继续由宿主呈现，检查其不被遮挡、嵌套删除确认正常，以及同时从两个看板入口打开弹窗时样式隔离、关闭其中一个不影响另一个。模拟宿主测试不代表真实布局、键盘焦点或层级验收已通过。

Portal 使用 React DOM 19.1.0 的公开 `createPortal`，以与宿主共享 React 的预打包产物发布。`npm run build:portal` 更新 `client/generated/` 内的代码、类型与 MIT 许可证；更新 React DOM 或构建工具后重跑并提交产物。`npm run check:portal` 核对产物一致性及无 Node `process` 依赖，避免宿主 neutral 编译器未替换 NODE_ENV 导致客户端失败。

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
