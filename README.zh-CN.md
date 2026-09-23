# Paseo 看板插件 (Paseo Kanban)

[English](./README.md)

专为 [Paseo](https://paseo.sh) 工作区打造的轻量响应式看板插件。支持自定义泳道分类、任务子步骤细化、原生 Paseo 项目关联筛选，以及跨泳道流畅拖拽管理。

---

## 核心功能

- **灵活的泳道管理**：开箱即用三列基础泳道（`待规划`、`执行中`、`已完成`），支持自由添加、重命名与删除自定义泳道。
- **丰富的任务卡片**：
  - 任务标题与多行描述编辑。
  - 子步骤清单支持独立增删改、完成状态勾选及实时进度展示。
  - 支持关联本地已有的 Paseo 项目。
- **项目维度筛选**：一键按关联的 Paseo 项目过滤看板卡片，聚焦当前目标。
- **流畅拖拽交互**：精准的拖拽命中测试（Hit-Testing），支持同泳道排序与跨泳道状态流转。
- **版本化数据持久化**：基于 Paseo 原生 settings API 存储，内置乐观并发版本控制（CAS），杜绝多会话覆写与状态不一致。

---

## 环境要求

- **Paseo 宿主版本承诺**：`>= 0.8.0`（声明于 `paseo-plugin.json`）。作为 Paseo 工作区插件，插件的生产运行时环境由 Paseo 宿主应用提供并托管执行，不在 `package.json` 对消费端强加额外的 `engines.node` 限制。
- **开发与 CI 环境基线**：Node.js 24（显式声明于 `.nvmrc` 与 `.node-version`）。本地参与开发、运行质量检查护栏（`npm run check`）、代码格式化、类型检查与自动化测试必须基于 Node 24，依赖其原生的 `--experimental-strip-types` 类型擦除与原生测试运行器（`node --test`）。

---

## 安装

### 快速安装（推荐）

无需克隆源码或手动编译，推荐直接使用 Paseo CLI 安装：

**方式一：通过 NPM 官方包安装（推荐）**

```bash
paseo plugin install npm:paseo-kanban
```

**方式二：直接通过 GitHub 仓库安装**

```bash
paseo plugin add breathi3552/paseo-kanban
```

若需显式跟踪 `main` 分支最新更新：

```bash
paseo plugin add breathi3552/paseo-kanban --ref main
```

安装后可通过以下命令检查运行状态：

```bash
paseo plugin ls
```

状态显示为 `running` 后打开 Paseo，侧边栏将出现 **看板** 入口（图标：`PanelsTopLeft`），点击即可进入看板。

### 本地开发与调试

如需进行本地源码调试或二次开发：

```bash
# 1. 克隆代码仓库并安装依赖
git clone https://github.com/breathi3552/paseo-kanban.git
cd paseo-kanban
npm install

# 2. 将当前开发目录软链接至本地 Paseo 守护进程
paseo plugin link .
```

---

## 开发与测试

### 安装依赖

```bash
npm install
# 或干净安装验证：
npm ci
```

### 统一质量护栏检查

按顺序执行类型检查、自动化测试套件、静态代码检查、代码格式验证及发布包完整性检查：

```bash
npm run check
```

### 各独立质量命令

- **发布包完整性检查**：静态校验发布包产物清单、入口完整性与 TypeScript AST 相对导入闭包：
  ```bash
  npm run check:package
  ```
- **运行单元测试**：跨平台自动发现并执行所有 `test/*.test.mjs` 测试套件：
  ```bash
  npm test
  ```
- **类型检查**：校验前端组件与服务端扩展的 TypeScript 类型完整性：
  ```bash
  npm run typecheck
  ```
- **代码规范检查 (Lint)**：基于 ESLint 开展轻量静态检查：
  ```bash
  npm run lint
  ```
- **代码格式检查与格式化 (Format)**：基于 Prettier 校验或自动格式化：
  ```bash
  npm run format:check
  npm run format
  ```

维护者可在 GitHub Actions 的 **Release to GitHub and npm** 工作流中选择 `patch` / `minor` / `major` 一键发布 GitHub Release 与 npm 包；首次使用需配置 `NPM_TOKEN` 和仓库写入权限。操作及失败重试说明见 [开发与宿主验收指南](./docs/development.md#24-一键发布github-actions)。

详细开发贡献流程、发布前检查机制与真实宿主环境手工验收指南，请参阅 [开发与宿主验收指南](./docs/development.md)。

---

## 架构设计

完整的插件架构图景与交互式全景模型已归档于仓库：

- **交互式架构全景图**：直接使用浏览器打开 [`docs/architecture/paseo-kanban.architecture.html`](./docs/architecture/paseo-kanban.architecture.html) 查看。
- **架构定义元数据**：[`docs/architecture/paseo-kanban.architecture.json`](./docs/architecture/paseo-kanban.architecture.json)。

---

## 开源协议

MIT
