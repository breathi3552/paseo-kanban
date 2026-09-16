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

- **Paseo**：`>= 0.8.0`
- **Node.js**：`>= 20.0.0`（开发环境推荐）

---

## 快速上手 / 本地安装

### 在 Paseo 中作为本地插件载入

可直接将本工程链接至本地正在运行的 Paseo 守护进程中：

```bash
# 将当前目录链接为本地插件
paseo plugin link .

# 或指定绝对路径链接
paseo plugin link C:/Users/breathi/Desktop/paseo-kanban
```

链接完成后打开 Paseo 界面，侧边栏将出现 **看板** 入口（图标：`PanelsTopLeft`），点击即可直接打开看板主界面。

---

## 开发与测试

### 安装依赖

```bash
npm install
```

### 运行单元测试

执行看板状态模型、并发校验、子步骤更新以及拖拽命中测试的自动化用例：

```bash
npm test
```

### 类型检查

校验前端组件与服务端扩展的 TypeScript 类型完整性：

```bash
npm run typecheck
```

---

## 架构设计

完整的插件架构图景与交互式全景模型已归档于仓库：

- **交互式架构全景图**：直接使用浏览器打开 [`docs/architecture/paseo-kanban.architecture.html`](./docs/architecture/paseo-kanban.architecture.html) 查看。
- **架构定义元数据**：[`docs/architecture/paseo-kanban.architecture.json`](./docs/architecture/paseo-kanban.architecture.json)。

---

## 开源协议

MIT
