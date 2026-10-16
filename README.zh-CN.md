# Paseo 看板插件 (Paseo Kanban)

[English](./README.md)

专为 [Paseo](https://paseo.sh) 工作区打造的轻量响应式看板插件。

---

## 核心功能

- **GitHub Issue 导入**：从项目仓库选择 Open Issues，每次最多导入 25 项到指定泳道；卡片可打开来源链接，任务独立管理。
- **灵活的泳道管理**：支持泳道增删与改名。
- **丰富的任务卡片**：
  - 任务标题与多行描述编辑。
  - 子步骤清单。
  - 支持关联 Paseo 中创建的项目。
- **工作区标签页与分屏**：与 Agent、Terminal 并排打开看板，默认筛选工作区所属项目；或使用侧边栏入口。
- **流畅拖拽交互**：支持同泳道排序与跨泳道状态流转。

---

## 环境要求

- **Paseo 宿主**：`>= 0.11.4`（声明于 `paseo-plugin.json`），由 Paseo 运行插件。
- **GitHub 导入（可选）**：在 daemon 所在机器安装 Git 与 GitHub CLI（`gh`），执行 `gh auth login`，并将项目仓库的 `origin` 配置为 GitHub.com 仓库；支持公开及有权访问的私有仓库。
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

单项命令（`npm test`、`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run check:package`）见 [`package.json`](./package.json)。标签发布、事实来源、失败重试与宿主验收见[开发指南](./docs/development.md#21-标签发布github-actions)。

---

## 版本发布

参见 [0.1.4 版本说明](./docs/releases/0.1.4.md)。每版 npm 包与 GitHub Release 对应同一个版本 tag，GitHub 附带经过验证的 npm tarball。`main` 可能包含最新发布版之后的改动。

---

## 架构设计

核心术语和架构决策见 [`GLOSSARY.md`](./GLOSSARY.md) 与 [`docs/adr/`](./docs/adr/)。

---

## 开源协议

MIT
