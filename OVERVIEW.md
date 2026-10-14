# Kanban

A lightweight, responsive Kanban board plugin for Paseo workspaces.

## Features

- **Flexible swimlanes**: Add, delete, and rename lanes.
- **Rich task cards**: Edit task titles and multi-line descriptions, manage subtask checklists, and link tasks to Paseo projects.
- **Task completion**: Check a card or drag it into the completion lane to finish; uncheck or drag out to restore.
- **Workspace tabs and splits**: Open the board beside an agent or terminal with Paseo's native split controls, initially filtered to the workspace's project, or use the sidebar entry.
- **Smooth drag and drop**: Support intra-lane reordering and cross-lane movement.

## Storage and requirements

- **Data and privacy**: Board data is stored locally in host-scoped plugin settings with revision checks for concurrent edits. No accounts, tokens, or external network requests are required.
- **Host requirement**: Paseo 0.8.0 or later.

---

# 看板 (Kanban)

专为 Paseo 工作区打造的轻量响应式看板插件。

## 核心功能

- **灵活的泳道管理**：支持泳道增删与改名。
- **丰富的任务卡片**：支持任务标题与多行描述编辑、子步骤清单管理，以及关联 Paseo 项目。
- **任务完成与恢复**：通过卡片勾选或拖入完成泳道标记完成；取消勾选或拖出即可恢复。
- **工作区标签页与分屏**：支持通过 Paseo 原生分屏控件与 Agent、Terminal 并排打开，默认筛选工作区所属项目，或使用侧边栏入口。
- **流畅拖拽交互**：支持同泳道排序与跨泳道状态流转。

## 存储与要求

- **数据与隐私**：看板数据保存在宿主本地插件设置中，具备版本并发冲突保护（CAS）。无需账号、Token 或任何外部网络请求。
- **宿主要求**：Paseo 0.8.0 或更高版本。
