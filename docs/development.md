# 开发、发布与宿主验收指南 (Development & Acceptance Guide)

本指南介绍本地检查、发布包校验、GitHub Actions 发版和 Paseo 宿主验收。

---

## 1. 本地环境与开发基线

### 1.1 Node.js 开发基线

- **开发与 CI 基线**：本项目使用 **Node.js 24** 作为开发与 CI 护栏基线，声明于根目录 `.nvmrc` 与 `.node-version`。
  - 依赖 Node 24 原生 `--experimental-strip-types` 与原生测试运行器（`node --test`）。
- **宿主运行时**：`paseo-plugin.json` 声明 Paseo 版本要求 `>= 0.8.0`。Node.js 24 是开发工具链要求，不是插件消费者的运行时要求。

### 1.2 安装依赖

```bash
# 按锁文件安装依赖
npm ci
```

### 1.3 统一质量护栏 (Check)

在提交代码或发布前，运行统一质量护栏命令：

```bash
npm run check
```

该命令按序执行：

1. `npm run typecheck` (`tsc --noEmit`)：TypeScript 类型校验
2. `npm run test` (`node --experimental-strip-types --test "test/*.test.mjs"`)：全量自动化测试（含负例）
3. `npm run lint` (`eslint .`)：ESLint 静态规则检查
4. `npm run format:check` (`prettier --check .`)：Prettier 代码格式一致性校验
5. `npm run check:package` (`node scripts/check-package.mjs`)：发布包完整性静态校验

CI 工作流（`.github/workflows/ci.yml`）直接执行 `npm run check`，全量覆盖上述护栏。

---

## 2. 发布前检查与自动化包校验

Paseo 采用 **TypeScript/TSX 源码直接发布** 模型，由 Paseo 宿主在运行时动态编译与装载。发布包的完整性由 `scripts/check-package.mjs` 提供静态守护。

### 2.1 独立发布包校验命令

```bash
npm run check:package
```

### 2.2 自动检查项与规则

校验脚本通过 `npm pack --dry-run --json --ignore-scripts` 获得最终发包清单，执行以下校验：

1. **必要文件齐全性**：
   - 客户端入口：`index.client.tsx`（或 `index.client.ts`）
   - 服务端入口：`index.server.ts`（或 `index.server.tsx`）
   - 本插件注册客户端侧栏和服务端设置，因此同时检查两个入口。
   - 插件清单：`paseo-plugin.json`
   - 包元数据：`package.json`
   - 源码目录：`client/` 与 `shared/`
2. **源码相对导入闭包（基于 TypeScript AST 解析）**：
   - 遍历所有包内源码（`.ts`, `.tsx`, `.js`, `.mjs`），使用官方 TypeScript 编译器 API（`ts.createSourceFile`）构建 AST。
   - 提取所有相对导入（`./...`、`../...`）：
     - `import ... from "..."`（含 `import type`）
     - `export ... from "..."`（含 `export type ... from`）
     - 静态动态导入 `import("...")`
     - CommonJS 别名 `import x = require("...")`
     - TS 类型查询 `import("...").Type`
   - 宿主编译 TS 源码时也需要 type-only 引用的目标文件；检查所有相对导入是否能解析到包内文件（支持 `.ts`, `.tsx`, `.d.ts`, `.json` 及目录 `index`）。
3. **排除开发文件与敏感信息**：
   - 自动拦截测试目录与文件（`test/`, `*.test.*`, `*.spec.*`）
   - 自动拦截开发脚本与 CI（`scripts/`, `.github/`, `.agents/`, `skills/`）
   - 自动拦截工具链配置（`tsconfig.json`, `eslint.config.*`, `.prettierrc`, `.nvmrc`, `.node-version` 等）
   - 自动拦截私密与环境配置（`.env`, `.env.*`, `*.pem`, `*.key`）
4. **清单与包元数据合规**：
   - `paseo-plugin.json` 包含合法 `id` 与 `requirements.paseo` semver 范围（`>=0.8.0`）。
   - `package.json` 版本号符合标准 SemVer。
   - 宿主提供的依赖（`@getpaseo/plugin`, `react`, `react-native`, `zod`）位于 `devDependencies`。

### 2.3 预览打包产物

```bash
npm pack --dry-run
```

用于人工复核最终 tarball 文件结构及压缩体积。

### 2.4 一键发布（GitHub Actions）

[Release to GitHub and npm](../.github/workflows/release.yml) 工作流由维护者手动触发，依次发布 npm 包和 GitHub Release。

**发布准备**

1. 在仓库 **Settings → Secrets and variables → Actions** 配置 `NPM_TOKEN`：使用对 `paseo-kanban` 有发布权限的 npm granular access token，包权限选择 **Read and write (publish and stage)**，并为自动发布启用 **Bypass 2FA**。将 token 保存在仓库 Secret 中。公开仓库支持工作流使用的 npm provenance。
2. 确认发布工作流拥有 `contents: write` 权限。当前规则允许 `github-actions[bot]` 向 `main` 推送版本提交和新 tag。
3. 按第 3 节在 Paseo 宿主中验收插件交互。

npm [计划在 2027 年 1 月停用 token 直接发包](https://docs.npmjs.com/about-access-tokens/#direct-publishing-is-being-deprecated)。届时将此工作流迁移到 [Trusted Publishing（OIDC）](https://docs.npmjs.com/trusted-publishers/)；当前工作流仍使用 `NPM_TOKEN`。

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

### 3.3 侧边栏与界面打开

1. 打开 Paseo 客户端窗口。
2. 在左侧边栏确认出现看板图标（`PanelsTopLeft` 图标，标题为 “看板” 或 “Kanban”）。
3. 点击图标，确认能够正常唤起看板主视图（KanbanBoardView）。

### 3.4 任务与泳道编辑持久化验收

1. **任务创建**：点击泳道中的 “添加任务”，输入任务标题、Markdown 描述，添加子任务项并保存。
2. **状态保留与重开**：关闭看板标签页或切换到其他侧边栏项目后重新打开看板，确认新建的任务完整保留。
3. **泳道管理**：添加新泳道、重命名泳道，验证包含任务的泳道或最后一条泳道受删除保护。

### 3.5 项目关联与筛选排序验收

1. **项目关联**：在任务编辑模态框中将任务关联到当前工作区的特定 Paseo 项目。
2. **项目筛选**：点击工具栏上的项目筛选器，选择特定项目，确认非关联任务被即时隐藏；清除筛选后恢复全部展示。
3. **泳道内排序与跨泳道移动**：拖动或移动任务，验证任务位置更新。

### 3.6 并发冲突防护 (CAS 冲突提示)

1. 在同一工作区内模拟外部修改或多端操作（例如通过服务端 API 修改看板数据版本）。
2. 在旧版本草稿界面点击保存，确认系统弹出冲突提示，拒绝覆盖外部新版本，防止数据丢失。

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

### 3.8 多语言自适应与热重载 (Reload) 验收

1. **多语言切换**：
   - 切换 Paseo 客户端语言（中文 zh / 英文 en）。
   - 确认侧边栏标题、看板默认泳道、工具栏按钮及弹窗文本即时响应切换。
2. **插件热重载**：
   - 执行 `paseo plugin reload paseo-kanban`。
   - 确认守护进程热重载插件成功，客户端界面正常同步，无需重启 Paseo 守护进程。
