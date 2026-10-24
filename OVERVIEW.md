# Kanban

A lightweight, responsive Kanban board plugin for Paseo workspaces.

## Features

- **Send to Agent**: Send task context to a new Agent using a Paseo preset in an existing workspace, new regular workspace, or new worktree. Agent execution does not update task status.
- **GitHub issue import**: Import up to 25 open issues from the project’s GitHub.com origin into a chosen lane. Tasks remain independent and link back to their source. Requires Git and an authenticated `gh` on the daemon machine.
- **Flexible swimlanes**: Add, rename, and delete in one horizontal dialog. Preview lane order with left/right controls or dragging, then save. Deleting a populated lane requires confirmation and removes unfinished tasks across all projects; completed tasks are kept.
- **Rich task cards**: Edit task titles and multi-line descriptions, manage subtask checklists, and link tasks to Paseo projects with native dropdown selectors.
- **Task completion**: Check a card or drag it into the completion lane to finish; uncheck or drag out to restore.
- **Workspace tabs and splits**: Open the board beside an agent or terminal with Paseo's native split controls, initially filtered to the workspace's project, or use the sidebar entry.
- **Smooth drag and drop**: Support intra-lane reordering and cross-lane movement.

## Storage and requirements

- **Data and privacy**: Board data is stored locally in host-scoped plugin settings with revision checks for concurrent edits. Core board use requires no external service; optional GitHub import reads GitHub using the daemon machine’s existing `gh` authentication and copies selected issue content into local settings.
- **Host requirement**: Paseo 0.11.4 or later.

---

# 看板 (Kanban)

专为 Paseo 工作区打造的轻量响应式看板插件。

## 核心功能

- **发送到 Agent**：选择 Paseo 预设，在已有工作区、新建普通工作区或 worktree 中新建 Agent 并直接发送任务上下文；Agent 执行不修改任务状态。
- **GitHub Issue 导入**：从项目的 GitHub.com origin 选择 Open Issues，每次最多导入 25 项到指定泳道；任务独立管理并保留外链。需要在 daemon 所在机器安装 Git 并登录 `gh`。
- **灵活的泳道管理**：在横向弹窗中增删改，通过左右按钮或拖动预览排列，再保存顺序。含任务的泳道经确认后连同所有项目中的未完成任务删除，已完成任务保留。
- **丰富的任务卡片**：支持任务标题与多行描述编辑、子步骤清单管理，以及通过原生下拉框关联 Paseo 项目。
- **任务完成与恢复**：通过卡片勾选或拖入完成泳道标记完成；取消勾选或拖出即可恢复。
- **工作区标签页与分屏**：支持通过 Paseo 原生分屏控件与 Agent、Terminal 并排打开，默认筛选工作区所属项目，或使用侧边栏入口。
- **流畅拖拽交互**：支持同泳道排序与跨泳道状态流转。

## 存储与要求

- **数据与隐私**：看板数据保存在宿主本地插件设置中，具备版本并发冲突保护（CAS）。看板基础功能无需外部服务；可选的 GitHub 导入使用 daemon 所在机器的 `gh` 登录态读取 GitHub，并将选中的 Issue 内容复制到本地设置。
- **宿主要求**：Paseo 0.11.4 或更高版本。
