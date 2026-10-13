# 开发、发布与宿主验收指南

## 1. 本地检查

开发与 CI 使用 Node.js 24（`.nvmrc`、`.node-version`）；插件要求 Paseo `>= 0.8.0`（`paseo-plugin.json`）。

```bash
npm ci
npm run check
```

`npm run check` 执行类型、测试、Lint、格式及发布包检查；CI 使用同一命令。Paseo 直接加载发布包中的 TypeScript/TSX 源码。`npm run check:package` 校验入口、相对导入闭包及发包文件；发版前可运行 `npm pack --dry-run` 核对包内容。

## 2. 发布

### 2.1 标签发布（GitHub Actions）

[Release to GitHub and npm](../.github/workflows/release.yml) 工作流由维护者在已有版本 tag 上手动触发：发布 npm 包，验证包内容和 provenance，再创建 GitHub Release 并附加同一 npm tarball。发布 job 不修改源码、版本号或 tag。

**事实来源**

| 内容               | 权威来源                                | 同步方式                                                                             |
| ------------------ | --------------------------------------- | ------------------------------------------------------------------------------------ |
| 包名与版本         | `package.json`                          | `npm version` 同步生成 `package-lock.json`，tag 必须为 `v<version>`                  |
| 宿主要求           | `paseo-plugin.json`                     | README 与概览遵循 manifest                                                           |
| 功能与领域规则     | 源码、`GLOSSARY.md` 和 `docs/adr/`      | README 与 `OVERVIEW.md` 描述已实现能力                                               |
| 每版变更说明       | `docs/releases/<version>.md`            | 工作流直接用于 GitHub Release 正文                                                   |
| 发布提交           | 不可改写的 `v<version>` tag             | 工作流来源 SHA、checkout、provenance 必须与 tag 提交一致                             |
| 已发布包及校验结果 | npm 版本元数据、tarball 和 attestations | `scripts/verify-release.mjs` 核对并生成 Release 的实际提交、integrity 和源码匹配结果 |

`main` 可以包含尚未发布的改动。确定版本的功能时，以对应 tag 为准；npm 包与 GitHub Release 以同一 tag 提交发布。

**发布准备**

1. 在仓库 **Settings → Secrets and variables → Actions** 配置 `NPM_TOKEN`：使用对 `paseo-kanban` 有发布权限的 npm granular access token，包权限选择 **Read and write (publish and stage)**，并启用 **Bypass 2FA**。Token 过期、权限不足或需要 2FA 时，由维护者在 npm 配置后更新 Actions Secret；不要在聊天或日志中粘贴 token。
2. 工作流需要 `contents: write` 创建 GitHub Release，以及 `id-token: write` 生成 npm provenance。
3. 运行 `npm ci`、`npm run check`，并按第 3 节完成 Paseo 宿主验收。自动化检查与宿主手工验收分别记录结果。
4. 更新版本说明与相关文档；`OVERVIEW.md` 随源码和 npm 包发布，供插件注册表展示。

**发布权限与分支规则**

发布 job 仅接受账号 `breathi3552`（GitHub ID `243264979`）在 `vX.Y.Z` tag 上发起或重跑的工作流。更换所有者时须同步更新工作流校验。发布流程不接受 `main` 作为运行来源，也不使用输入参数 checkout 到另一个 tag，以保证 OIDC 中的来源提交与实际发布源码一致。

远端启用两个 Ruleset：[保护 `main`](https://github.com/breathi3552/paseo-kanban/rules/23888496)（禁止删除和强推、要求线性历史）与 [保护 `v*` tag](https://github.com/breathi3552/paseo-kanban/rules/23888501)（禁止删除和改写）。规则允许向 `main` 追加提交和创建新 tag；维护者先推送发版提交和 tag，工作流只负责发布与验证。

**发布步骤**

以 `0.1.3` 为例，在最新 `main` 上准备版本与说明：

```bash
npm version 0.1.3 --no-git-tag-version --ignore-scripts
# 更新 docs/releases/0.1.3.md、README 和 OVERVIEW.md
npm run check
git add package.json package-lock.json docs/releases/0.1.3.md README.md README.zh-CN.md OVERVIEW.md
# 若发布工具也有变化，将相应文件一起提交
git commit -m "chore(release): 0.1.3"
git tag -a v0.1.3 -m v0.1.3
git push --atomic origin main refs/tags/v0.1.3
gh workflow run release.yml --ref v0.1.3
```

也可在 GitHub Actions 的 **Run workflow** 中选择版本 tag。工作流验证 tag 位于 `main` 历史中，且 tag、三个 manifest/lockfile 版本字段和运行来源 SHA 一致；运行质量检查后执行 `npm publish --provenance --access public`。随后检查 tarball SHA-512、每个发布文件与 tagged source 的逐字节匹配、provenance 的仓库/tag/commit，并通过 `npm audit signatures` 验证注册表与 provenance 签名。全部通过后才创建 GitHub Release。

**失败与重试**

- npm 发布失败：修复权限或 token 后，重跑同一个 tag 的工作流。未通过 npm 验证前，不创建 GitHub Release。
- npm 已成功、后续步骤失败：重跑时跳过发包，重新验证已有包，再创建或同步 GitHub Release 说明及 tarball 附件。npm 可能先返回发布成功，再异步处理包；CDN 也可能缓存早期的 404。当前校验工具会等待并绕过 404 缓存，最长约五分钟。`v0.1.3` tag 中的校验工具会直接报错，需等 npm 元数据、tarball 和 attestations 可读取后再重跑该 tag。
- 已有 npm 包的内容或 provenance 与 tag 不匹配：停止发布；npm 版本不能覆盖，需修复流程后发布新版本。不要移动或重建旧 tag。

本地复核时，在包含当前校验工具的源码目录运行 `npm run verify:release`，并确保该版本 tag 存在。该命令以 `package.json` 对应的版本 tag 为基准，检查 npm 元数据、tarball、来源字段和本地待打包文件；本地发布文件与 tag 不一致时拒绝通过。工具支持 Windows 和 Linux 的 tar 路径与换行；密码学签名验证由工作流中的独立 `npm audit signatures` 步骤执行。

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

## 4. 官方市场素材与验收

首次收录使用已发布的 `paseo-kanban@0.1.3`，显示名称为 `Kanban`。展示名称、图标和截图通过官方 registry record 的 `listing` 提供，不修改旧 tag、npm 包或 manifest 的 Paseo `>=0.8.0` 要求。

`assets/marketplace/` 中的 `icon.png` 为 512×512 无文字看板图标；`board-0.1.3.png`、`task-editor-0.1.3.png`、`workspace-split-0.1.3.png` 按该顺序展示全景、任务编辑与 Terminal 分屏。三张截图来自 Windows 上的 Paseo Desktop/daemon 0.11.2，运行 npm `0.1.3`，仅使用独立测试宿主中的虚构项目与任务。素材 URL 必须使用完整 commit SHA 固定，不使用浮动分支链接；素材不纳入 npm 发布包。

按官方 submission 模板申请收录，引用历史审核 [#73](https://github.com/getpaseo/plugins/issues/73) 与 [v0.1.3 验证证据](https://github.com/breathi3552/paseo-kanban/releases/tag/v0.1.3)，在旧记录补新申请链接。市场介绍以该版本 npm artifact 的 `OVERVIEW.md` 为准，当前分支文档继续描述当前功能。

[Issue #13](https://github.com/breathi3552/paseo-kanban/issues/13) 仅在官方市场、公开 index/detail 可见，且独立宿主移除预装 npm 版本、通过获批 registry ID 安装后完成桌面验收时关闭。测试宿主与数据目录独立，不重启开发宿主、不替换开发插件、不读取或迁移真实看板数据；独立目录不提供插件安全沙箱。

验收按第 3 节核对 `0.1.3` 的真实能力，排除后来新增的完成泳道保护、任务完成与恢复；本次仅覆盖桌面环境，不能据此宣称已验证所有 `>=0.8.0` 宿主。
