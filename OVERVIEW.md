# Kanban

A Kanban board plugin for Paseo workspaces.

## Key features

- **Send to Agent**: Send task context to a new Agent session using a host preset in an existing workspace, a new regular workspace, or a new worktree. Agent execution does not update task status.
- **Drag and drop with displacement animation**: Reorder cards within a lane or move cards across lanes with animated slot displacement and edge auto-scrolling.
- **GitHub issue import**: Import up to 25 open issues per batch from the project's GitHub repository into a selected lane. Includes deduplication, creation-time sorting, and source links.
- **Completion lane and status restoration**: A dedicated completion lane collects finished tasks. Restoring a task returns it to its original ordinary swimlane without data loss.

## General features

- **Task details and subtasks**: Edit task titles and multi-line descriptions, manage subtask checklists, and link tasks to Paseo projects with compact dropdown menus. Right-click a card to edit, move, copy the prompt, open the source issue, or delete.
- **Flexible swimlanes**: Add, rename, and reorder lanes in a horizontal dialog with deletion confirmation for populated lanes.
- **Workspace tabs and splits**: Open the board beside an agent or terminal with Paseo's split controls, initially filtered to the workspace project, or use the sidebar entry.

## Storage and requirements

- **Data and privacy**: Stores board data in host-scoped plugin settings. Optional GitHub import reads GitHub using the daemon machine's existing `gh` authentication and copies selected issue content into local settings.
- **Host requirement**: Paseo 0.11.4 or later.

---

# 看板 (Kanban)

Paseo 工作区的任务看板插件。

## 核心特性

- **发送到 Agent**：选择宿主预设并在已有工作区、新建普通工作区或 worktree 中启动新 Agent，直接发送任务上下文。Agent 执行不修改任务状态。
- **拖拽交互与位移动画**：支持同泳道拖拽排序与跨泳道移动。移动过程中目标泳道展示平滑的占位槽避让动画，拖拽靠近视口边缘时自动滚动。
- **GitHub Issue 导入**：从项目关联的 GitHub 仓库单向导入 Open Issue 到指定泳道，单次上限 25 项。导入后任务独立管理并保留外链。该功能要求运行 Paseo daemon 的机器已安装 Git 并完成 `gh auth login`。
- **完成泳道与状态回弹**：专用完成泳道集中收拢已完成任务。取消完成时，卡片无损恢复至其原本归属的普通泳道。

## 基础功能

- **任务详情与子步骤**：支持任务标题与多行描述编辑、子步骤清单管理，以及通过下拉框关联 Paseo 项目。右键卡片可快速编辑、流转、复制提示词、跳转来源 Issue 与删除。
- **灵活的泳道管理**：在横向弹窗中添加、重命名与调整泳道顺序。删除含有未完成任务的泳道需要二次确认，避免误删。
- **工作区标签页与分屏**：支持通过 Paseo 原生分屏控件与 Agent、终端并排展示。默认自动筛选当前工作区项目，也可通过侧边栏独立打开。

## 存储与环境要求

- **数据与隐私**：看板数据保存在宿主本地插件设置中。可选的 GitHub 导入使用 daemon 所在机器的 `gh` 登录态读取 GitHub，并将选中的 Issue 内容复制到本地设置。
- **宿主要求**：Paseo 0.11.4 或更高版本。
