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
- **版本化数据持久化**：通过 Paseo settings API 存储看板，使用乐观并发版本控制（CAS）处理多会话写入冲突。

---

## 环境要求

- **Paseo 宿主**：`>= 0.8.0`（声明于 `paseo-plugin.json`），由 Paseo 运行插件。
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

状态显示为 `running` 后，可从两个入口打开看板：

- **侧边栏 → 看板**：默认展示全部任务。
- **工作区 → `+` → 看板**：默认筛选工作区所属项目，可切换范围；使用 Paseo 原生分屏操作与 Agent、Terminal 等并排显示。

两个入口共享任务和泳道，保留完整编辑能力，筛选互不影响。关闭重开或重启后恢复入口默认筛选。无法取得工作区所属项目时静默展示全部任务，本次打开期间不因项目上下文恢复而自动切换。窄分屏保持横向滚动浏览泳道。

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

安装依赖并运行完整检查：

```bash
npm ci
npm run check
```

单项命令（`npm test`、`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run check:package`）见 [`package.json`](./package.json)。发布、失败重试与宿主验收见[开发指南](./docs/development.md#21-一键发布github-actions)。

---

## 架构设计

核心术语和架构决策见 [`CONTEXT.md`](./CONTEXT.md) 与 [`docs/adr/`](./docs/adr/)。

---

## 开源协议

MIT
