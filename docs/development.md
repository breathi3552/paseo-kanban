# 开发、发布前检查与宿主验收指南 (Development & Acceptance Guide)

本指南面向 Paseo Kanban 插件的维护者与贡献者，说明本地开发规范、统一质量护栏、发布包静态检查机制以及在真实 Paseo 宿主上的手工验收流程与边界限制。

---

## 1. 本地环境与开发基线

### 1.1 Node.js 开发基线

- **开发与 CI 基线**：本项目使用 **Node.js 24** 作为开发与 CI 护栏基线，声明于根目录 `.nvmrc` 与 `.node-version`。
  - 依赖 Node 24 原生 `--experimental-strip-types` 与原生测试运行器（`node --test`）。
- **宿主运行时承诺**：Paseo 宿主环境要求 `>= 0.8.0`（声明于 `paseo-plugin.json`）。`package.json` 中不设消费端 `engines` 限制，避免向消费端或宿主传递工具链版本要求。

### 1.2 安装依赖

```bash
# 干净安装所有依赖（保证无原生编译依赖）
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
   - _（注：Paseo 通用规范仅要求至少具备客户端或服务端任一入口；本项目因同时注册前端侧栏界面与服务端看板设置，故约定双入口均须齐全）_
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
   - **Type-only 引用处理说明**：Paseo 宿主在编译和类型推导 TS 源码时，相对导入的目标文件必须真实存在于包内；因此类型导入与运行时导入一同严格检查相对闭包。
   - 确保所有相对导入均能在包内解析到对应文件（支持 `.ts`, `.tsx`, `.d.ts`, `.json` 及目录 `index`），杜绝因缺少文件导致宿主加载失败。
3. **防止非运行时文件与敏感信息泄漏**：
   - 自动拦截测试目录与文件（`test/`, `*.test.*`, `*.spec.*`）
   - 自动拦截开发脚本与 CI（`scripts/`, `.github/`, `.agents/`, `skills/`）
   - 自动拦截工具链配置（`tsconfig.json`, `eslint.config.*`, `.prettierrc`, `.nvmrc`, `.node-version` 等）
   - 自动拦截私密与环境配置（`.env`, `.env.*`, `*.pem`, `*.key`）
4. **清单与包元数据合规**：
   - `paseo-plugin.json` 包含合法 `id` 与 `requirements.paseo` semver 范围（`>=0.8.0`）。
   - `package.json` 版本号符合标准 SemVer（不锁死 0.1.0）。
   - 宿主依赖（`@getpaseo/plugin`, `react`, `react-native`, `zod`）严格保留在 `devDependencies`，不进入 `dependencies`。

### 2.3 预览打包产物

```bash
npm pack --dry-run
```

用于人工复核最终 tarball 文件结构及压缩体积。

---

## 3. 宿主手工验收指南 (Manual Host Acceptance Guide)

静态检查保证了包的静态闭环，最终功能与交互体验需要在真实 Paseo 宿主环境中执行以下步骤验收：

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
  npm pack
  paseo plugin install /absolute/path/to/paseo-kanban-0.1.0.tgz
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

---

## 4. 实际未验证限制与边界声明 (Limitations & Boundaries)

为保证工程透明度，特别声明以下限制与边界：

1. **静态完整性 ≠ 宿主运行时执行**：
   - `npm run check:package` 与自动化测试是静态包完整性分析（AST 导入解析、清单校验、敏感文件排查），**不冒充或替代真实 Paseo 宿主与 React Native 渲染引擎的加载执行**。
2. **自动化未触及真实 Paseo 守护进程**：
   - 本地护栏未修改用户现有的本地 Paseo 守护进程配置（`config.json`），未启动后台守护进程。
   - 手工验收部分需由测试者或维护者在具备 Paseo 桌面环境的真实宿主上按照第 3 节执行。
3. **未执行真实远端发布**：
   - 阶段任务中严格杜绝执行 `npm publish`，未向公共 npm 仓库或远端私有源推送任何版本包。
