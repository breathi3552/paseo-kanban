# 开发、发布与宿主验收指南

## 1. 本地检查

开发与 CI 使用 Node.js 24（`.nvmrc`、`.node-version`）；插件要求 Paseo `>= 0.8.0`（`paseo-plugin.json`）。

```bash
npm ci
npm run check
```

`npm run check` 执行类型、测试、Lint、格式及发布包检查；CI 使用同一命令。Paseo 直接加载发布包中的 TypeScript/TSX 源码。`npm run check:package` 校验入口、相对导入闭包及发包文件；发版前可运行 `npm pack --dry-run` 核对包内容。

## 2. 发布

### 2.1 一键发布（GitHub Actions）

[Release to GitHub and npm](../.github/workflows/release.yml) 工作流由维护者手动触发，依次发布 npm 包和 GitHub Release。

**发布准备**

1. 在仓库 **Settings → Secrets and variables → Actions** 配置 `NPM_TOKEN`：使用对 `paseo-kanban` 有发布权限的 npm granular access token，包权限选择 **Read and write (publish and stage)**，并为自动发布启用 **Bypass 2FA**。将 token 保存在仓库 Secret 中。公开仓库支持工作流使用的 npm provenance。
2. 确认发布工作流拥有 `contents: write` 权限。当前规则允许 `github-actions[bot]` 向 `main` 推送版本提交和新 tag。
3. 按第 3 节在 Paseo 宿主中验收插件交互。

**发布权限与分支规则**

工作流仅在 `main` 上由账号 `breathi3552`（GitHub ID `243264979`）发起或重跑时执行发布 job。其他有写权限的账号仍可发起工作流，但发布 job 会跳过。仓库写权限仅授予可信人员；能修改 `main` 的人员也能修改此校验。更换账号或仓库所有者时须同步更新校验条件。

远端启用两个 Ruleset：[保护 `main`](https://github.com/breathi3552/paseo-kanban/rules/23888496)（禁止删除和强推、要求线性历史）与 [保护 `v*` tag](https://github.com/breathi3552/paseo-kanban/rules/23888501)（禁止删除和改写）。现有发布流程直接向 `main` 推送版本提交，因此这两项规则保留正常追加提交与创建 tag 的权限。要强制 PR 审核和 CI 状态检查，需先将发布推送改为可获得规则豁免的 GitHub App，或改用经 PR 合并的发版流程。

**发布与重试**

在 GitHub **Actions → Release to GitHub and npm → Run workflow** 中选择 `main`、选择 `patch` / `minor` / `major`，保持 `retry_tag` 为空。工作流更新 `package.json` 与 `package-lock.json`，运行 `npm ci` 和 `npm run check`，原子推送版本提交和 `vX.Y.Z` tag，发布 npm 包（含 provenance），最后创建 GitHub Release。GitHub Actions 的 `GITHUB_TOKEN` 推送不会触发常规 CI；发布工作流自行完成检查。

若 tag 已推送而 npm 或 GitHub Release 步骤失败，填入该版本的 `retry_tag`（如 `v0.1.2`）重试。工作流会校验 tag 与包版本，并跳过 npm 上已有的版本。推送之前失败时，排除故障后重新选择版本升级即可。

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
