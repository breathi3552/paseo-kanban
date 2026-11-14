# Kanban

A Kanban board plugin for Paseo workspaces.

## Features

- **Task context menu**: Right-click a card to edit, move, complete, copy the prompt, open the source issue, or delete. Drag a card from anywhere on its surface except the checkbox and the Send to Agent button.
- **Send to Agent**: Send task context to a new Agent session using a host preset in an existing workspace, a new regular workspace, or a new worktree. Agent execution does not update task status.
- **GitHub issue import**: Import up to 25 open issues per batch from the project's GitHub repository into a selected lane. Tasks remain independent and link back to their source. This feature requires Git and an authenticated `gh` CLI on the daemon machine.
- **Flexible swimlanes**: Add, rename, and delete lanes in a horizontal dialog. Preview lane order with left and right buttons or drag handles, then save. Deleting a populated lane requires confirmation and deletes unfinished tasks across all projects. Completed tasks are kept.
- **Task details and subtasks**: Edit task titles and multi-line descriptions, manage subtask checklists, and link tasks to Paseo projects with compact dropdown menus.
- **Native UI components**: Built on local React components (`Button`, `Input`, `Dialog`, `ConfirmDialog`, `Badge`, `Checkbox`, `Select`) styled with Paseo theme CSS variables.
- **Task completion**: Check a card or drag it into the completion lane to finish. Uncheck or drag out to restore.
- **Workspace tabs and splits**: Open the board beside an agent or terminal with Paseo's split controls, initially filtered to the workspace project, or use the sidebar entry.
- **Drag and drop**: Supports intra-lane reordering and cross-lane movement.

## Storage and requirements

- **Data and privacy**: Stores board data in host-scoped plugin settings with optimistic revision checks (CAS) for concurrent edits. Core board use requires no external service. Optional GitHub import reads GitHub using the daemon machine's existing `gh` authentication and copies selected issue content into local settings.
- **Host requirement**: Paseo 0.11.4 or later.

---

# 看板 (Kanban)

Paseo 工作区的任务看板插件。

## 核心功能

- **任务右键菜单**：右键点击卡片打开菜单，支持编辑、移动、标记完成、复制提示词、打开来源 Issue 与删除。复选框和发送按钮独立响应点击，不触发卡片拖拽。
- **发送到 Agent**：选择宿主预设并在已有工作区、新建普通工作区或 worktree 中启动新 Agent，直接发送任务上下文。Agent 执行不修改任务状态。
- **GitHub Issue 导入**：从项目关联的 GitHub 仓库单向导入 Open Issue 到指定泳道，单次上限 25 项。导入后任务独立管理并保留外链。该功能要求运行 Paseo daemon 的机器已安装 Git 并完成 `gh auth login`。
- **灵活的泳道管理**：在横向弹窗中添加、重命名与删除泳道。支持通过左右按钮或拖拽预览顺序并保存。删除含有未完成任务的泳道需要二次确认，确认后连同所有项目中的未完成任务一并删除；已完成任务继续保留。
- **任务详情与子步骤**：支持任务标题与多行描述编辑、子步骤清单管理，以及通过下拉框关联 Paseo 项目。
- **统一基础组件**：使用插件内部封装的组件（`Button`、`Input`、`Dialog`、`ConfirmDialog`、`Badge`、`Checkbox`、`Select`），样式全部基于 Paseo 主题 CSS 变量，无第三方 UI 库依赖。
- **任务完成与恢复**：勾选卡片复选框或将卡片拖入完成泳道即可标记完成。取消勾选或拖出完成泳道即可恢复至原普通泳道。
- **工作区标签页与分屏**：支持通过 Paseo 原生分屏控件与 Agent、终端并排展示。默认自动筛选当前工作区项目，也可通过侧边栏独立打开。
- **拖拽交互**：支持同泳道拖拽排序与跨泳道移动。

## 存储与环境要求

- **数据与隐私**：看板数据保存在宿主本地插件设置中，具备版本并发冲突保护（CAS）。看板基础功能无需外部服务。可选的 GitHub 导入使用 daemon 所在机器的 `gh` 登录态读取 GitHub，并将选中的 Issue 内容复制到本地设置。
- **宿主要求**：Paseo 0.11.4 或更高版本。
