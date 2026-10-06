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
| 功能与领域规则     | 源码、`CONTEXT.md` 和 `docs/adr/`       | README 与 `OVERVIEW.md` 描述已实现能力                                               |
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

`0.1.2` 曾在同一次工作流运行中升级版本、创建提交并发布，导致 provenance 指向升级前的提交。新流程从已存在的版本 tag 启动，避免这个不一致。

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

### 3.3 双入口与原生分屏

1. 打开 Paseo 客户端，确认侧边栏出现 `PanelsTopLeft` 图标，标题为“看板”或“Kanban”；打开后默认展示全部任务。
2. 在项目 A 的工作区点击 `+` → 看板，确认以普通标签页打开、默认筛选 A，并保留任务编辑、拖拽及泳道管理。
3. 用 Paseo 原生操作将看板与 Agent/Terminal 分屏；在宽窗口内将看板缩至约 360px，确认工具栏可访问、泳道可横向滚动。再次扩宽，验证跨泳道拖拽和落位位置正确。
4. 将当前筛选改为 B，验证其他工作区和侧边栏的筛选不变。切换标签页、调整分屏、切换主题和语言时保留 B；关闭重开或重启后恢复 A。
5. 在 B 筛选下新建任务，确认默认关联 B；在全部或未关联筛选下新建任务，确认默认不关联。保存前可修改项目，其他入口可见共享更新。
6. 工作区上下文不可用时应静默展示全部任务；上下文恢复不自动切换，关闭重开后才重新应用默认项目。仅项目名称加载失败时应仍按已知 ID 筛选，项目选项回退显示 ID。

### 3.4 任务与泳道编辑持久化验收

1. **任务创建**：点击泳道中的 “添加任务”，输入任务标题与多行描述，添加子步骤并保存。
2. **状态保留与重开**：关闭看板标签页或切换到其他侧边栏项目后重新打开看板，确认新建的任务完整保留。
3. **泳道管理**：添加新泳道、重命名泳道，验证包含任务的泳道或最后一条泳道受删除保护。

### 3.5 项目关联与筛选排序验收

1. **项目关联**：在任务编辑模态框中将任务关联到当前工作区的特定 Paseo 项目。
2. **项目筛选**：点击工具栏上的项目筛选器，选择特定项目，确认非关联任务被即时隐藏；清除筛选后恢复全部展示。
3. **泳道内排序与跨泳道移动**：拖动或移动任务，验证任务位置更新。

### 3.6 版本冲突验收

1. 在同一宿主中通过另一会话更新看板版本。
2. 在旧版本的任务或泳道编辑会话中保存，确认保存失败、草稿保留，并显示冲突提示；宿主中的新版本保持不变。

### 3.7 拖拽手势交互验收（鼠标与触屏）

1. **鼠标拖拽分流**：
   - 鼠标左键点击任务卡片并在 5px 以内松开：判定为轻点，弹出任务详情/编辑模态框。
   - 鼠标按住位移 ≥ 5px：激活拖拽并锁定互斥锁，出现虚线占位槽与半透明拖拽浮层。
2. **跨泳道与落位动画**：
   - 拖拽卡片移动至其他泳道，观察目标泳道卡片的动态避让动画。
   - 在目标位置释放，卡片执行平滑落位动画并触发状态持久化提交。
   - 拖拽至看板外部或工具栏释放，确认操作安全取消且不发生位移。
3. **触屏与触控板手势**：
   - 触屏长按（220ms）抓起卡片触发拖拽。
   - 快速上下或左右滑动手势让渡给原生滚动，不误触发拖拽与轻点。

### 3.8 语言切换与热重载验收

1. **多语言切换**：
   - 切换 Paseo 客户端语言（中文 zh / 英文 en）。
   - 确认侧边栏及工作区看板入口标题、工具栏按钮及弹窗文本即时响应切换；已保存的泳道标题保持原文，已打开看板的筛选不变。
2. **插件热重载**：
   - 执行 `paseo plugin reload paseo-kanban`。
   - 确认守护进程热重载插件成功，客户端界面正常同步，无需重启 Paseo 守护进程。
