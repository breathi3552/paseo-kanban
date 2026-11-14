# Paseo 看板插件 (Paseo Kanban)

[English](./README.md)

[Paseo](https://paseo.sh) 工作区的任务看板插件。

![Paseo 看板全景概览](./assets/marketplace/board-0.1.3.png)

---

## 亮点特性

- **泳道管理**：在横向弹窗中添加、重命名与删除泳道。支持通过左右按钮或拖拽调整顺序并保存。删除含有未完成任务的泳道需要二次确认，确认后将连同所有项目中的未完成任务一并删除；已完成任务继续保留。
- **任务右键菜单**：右键卡片可编辑、移动、完成、复制提示词、打开来源 Issue 或删除。除复选框和发送按钮外，卡片其余区域均可抓起拖拽。
- **拖拽交互**：支持卡片在同泳道内拖拽排序或跨泳道移动。拖拽时动态展示占位虚线框，靠近视口边缘时自动滚动。
- **发送到 Agent**：选择宿主预设并在已有工作区、新建普通工作区或 worktree 中启动新 Agent，直接发送标题、描述、子步骤与来源。Agent 执行状态不回流看板。
- **GitHub Issue 导入**：从项目关联的 GitHub 仓库单向导入 Open Issue 到指定泳道。支持分页浏览、全仓库创建时间排序、自动去重与外链直达。

---

## 其他特性

- **任务详情与子步骤**：
  - 支持任务标题与多行描述编辑（可调节描述框高度）。
  - 提供子步骤清单与完成进度实时统计。
  - 支持通过下拉选择框将任务关联至 Paseo 项目。
- **任务完成与恢复**：勾选卡片复选框或将卡片拖入完成泳道即可标记完成。取消勾选或拖出完成泳道即可恢复至原普通泳道。
- **工作区标签页与分屏**：支持通过 Paseo 原生分屏控件与 Agent、终端并排展示。默认自动筛选当前工作区项目，也可通过侧边栏独立打开。
- **项目筛选**：支持通过下拉框按项目筛选任务或查看未关联任务。长列表支持实时搜索过滤。各窗口筛选状态相互独立，共享底层看板数据。
- **统一基础组件**：使用插件内部封装的组件（`Button`、`Input`、`Dialog`、`ConfirmDialog`、`Badge`、`Checkbox`、`Select`），样式全部基于 Paseo 主题 CSS 变量，无第三方 UI 库依赖。
- **宿主持久化与并发保护**：看板数据保存在宿主插件设置中。保存时通过版本号比对（CAS）防止并发覆盖，保存失败时保留表单草稿。

---

## 界面预览

### 看板全景

![看板全景](./assets/marketplace/board-0.1.3.png)

### 任务详情与子步骤

![任务详情与子步骤](./assets/marketplace/task-editor-0.1.3.png)

### 工作区标签页与分屏

![工作区标签页与分屏](./assets/marketplace/workspace-split-0.1.3.png)

---

## 环境要求

- **Paseo 宿主**：`>= 0.11.4`（声明于 `paseo-plugin.json`）。
- **GitHub 导入（可选）**：在 daemon 所在机器安装 Git 与 GitHub CLI（`gh`），执行 `gh auth login`，并将项目仓库的 `origin` 配置为 GitHub.com 仓库。支持公开仓库与有权访问的私有仓库。
- **开发与 CI**：使用 Node.js 24（声明于 `.nvmrc` 与 `.node-version`）执行质量检查、TypeScript 类型擦除和原生测试。

---

## 安装

### 快速安装（推荐）

通过 Paseo CLI 从 npm 或 GitHub 安装：

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

可从两个入口打开看板：

- **侧边栏 → 看板**：默认展示全部任务。
- **工作区 → `+` → 看板**：默认筛选工作区所属项目，可切换范围；使用 Paseo 原生分屏操作与 Agent、Terminal 等并排显示。

### 本地开发与调试

如需进行本地源码调试或二次开发：

```bash
# 1. 克隆代码仓库并安装依赖
git clone https://github.com/breathi3552/paseo-kanban.git
cd paseo-kanban
npm ci

# 2. 将当前开发目录软链接至本地 Paseo 守护进程
paseo plugin link .
```

---

## 开发与测试

安装依赖并运行完整检查：

```bash
npm ci
npm run check
```

单项命令（`npm test`、`npm run check:portal`、`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run check:package`）见 [`package.json`](./package.json)。标签发布、事实来源、失败重试与宿主验收见[开发指南](./docs/development.md#3-发布流程)。

---

## 版本发布

参见 [更新日志 (CHANGELOG)](./CHANGELOG.md)。每版 npm 包与 GitHub Release 对应同一个版本 tag，GitHub 附带经过验证的 npm tarball。`main` 可能包含最新发布版之后的改动。

---

## 架构设计

核心术语和架构决策见 [`GLOSSARY.md`](./GLOSSARY.md) 与 [`docs/adr/`](./docs/adr/)。

---

## 开源协议

MIT
