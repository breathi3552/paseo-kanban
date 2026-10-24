# Changelog

All notable changes to Paseo Kanban are documented here in bilingual format (English & 中文).

The format is based on [Keep a Changelog](https://keepachangelog.com/), adapted for strictly mirrored bilingual release notes.

## [Unreleased]

## [0.3.0] - 2026-10-24

### Features

- **Send to Agent**: Send a task card's title, markdown description, subtask checklist, and source link directly to a new Agent session. Choose an existing workspace, create a new regular workspace, or create a new worktree with branch name validation.
- **Persistent dispatch prompt**: Customize and persist the dispatch prompt across tasks and boards without polluting individual task content; includes sending status feedback, duplicate submission guards, and staged error reporting.
- **Host select for project filtering and assignment**: Replace horizontal chips with Paseo's native `SettingsSelect` for board project filtering and task modal project assignment; options adapt to host styling and themes, sort alphabetically by localized display name, and fallback safely for missing project IDs.
- **Simplified task modal field labels**: Streamline task form field labels to "Title *", "Lane", and "Project" in strict sequence; lock imported GitHub issue project assignment in a disabled select control while keeping descriptions editable.

### Compatibility & Migration

- Requires Paseo `>= 0.11.4`.
- No board data migration or dependency changes required.

---

### 新增特性

- **发送到 Agent**：将任务卡片的标题、Markdown 描述、子步骤清单及来源链接作为初始消息直接发送至新建 Agent 会话。支持选择已有工作区、新建普通工作区或通过 Git 分支名校验新建 worktree。
- **持久化协作指令与即时反馈**：支持自定义并跨任务沿用协作 prompt，不污染任务本身内容；提供发送中状态反馈与防重复提交保护，分阶段反馈异常且不自动隐式重试。
- **宿主下拉框项目筛选与关联**：看板顶部项目筛选与任务弹窗项目选择复用 Paseo 原生 `SettingsSelect` 控件，自适应宿主风格与深浅主题，按当前语言本地化名称排序，并对缺失项目 ID 进行回退显示。
- **任务弹窗字段精简与锁定**：将任务弹窗表单字段按“标题 *”“泳道”“项目”顺序呈现；GitHub 导入任务的项目关联以禁用下拉框形式锁定，其余字段与描述保持可编辑。

### 兼容性与迁移

- 依赖 Paseo `>= 0.11.4`。
- 无需看板数据迁移或依赖项变更。

## [0.2.1] - 2026-10-18

### Features

- **Unified lane management**: Manage swimlanes in a horizontal modal with in-place creation, renaming, deletion, left/right ordering controls, and drag-and-drop reordering with edge auto-scrolling.
- **Cascading lane deletion**: Deleting a swimlane containing unfinished tasks prompts for confirmation and deletes those tasks across all projects while keeping completed tasks intact.
- **Safe concurrent lane saves**: Automatically retry saving lane changes against the latest revision if only tasks were modified concurrently; preserve drafts and provide a reload action if lane structures changed.

### Fixes & Improvements

- **Desktop portal rendering**: Render the wide lane manager using an isolated React DOM portal on desktop to bypass the 520px host dialog width limit without obstructing host toast notifications.
- **Lane title uniqueness**: Enforce uniqueness across all swimlane titles (including the completion lane) after trimming leading and trailing whitespace.

### Compatibility & Migration

- Requires Paseo `>= 0.11.4`.
- No board data migration or dependency changes required.

---

### 新增特性

- **统一泳道管理**：在横向弹窗中集中管理泳道，支持就地新增、重命名与删除，提供左右移动按钮以及支持边缘自动滚动的把手拖拽排序与预览。
- **级联删除未完成任务**：删除包含未完成任务的泳道时进行二次确认，确认后同步删除各项目中归属于该泳道的未完成任务，已完成任务继续保留。
- **泳道并发安全保存**：泳道保存遇到版本冲突时，若仅任务数据更新则自动重试保存；若泳道结构被修改则保留本地草稿并提供重新加载最新数据的入口。

### 修复与优化

- **桌面端 Portal 弹窗渲染**：桌面端使用独立打包的 React DOM Portal 容器渲染 1120px 宽屏管理弹窗，突破宿主 520px 宽度限制，同时保持宿主 Toast 通知正常显示。
- **泳道名称唯一性校验**：新增与重命名泳道时自动去除首尾空格，并在全板范围内校验唯一性（包含完成泳道）。

### 兼容性与迁移

- 依赖 Paseo `>= 0.11.4`。
- 无需看板数据迁移或依赖项变更。

## [0.2.0] - 2026-10-17

### Features

- **GitHub issue import**: Import up to 25 open issues from the project's GitHub.com origin repository into a chosen swimlane with pagination, creation-time sorting, and automatic deduplication. Cards display source links and open issues in the system browser while imported tasks are managed independently.

### Fixes & Improvements

- **Drag and drop animation**: Eliminate visual jumps when dragging cards across swimlanes, smooth out drop spacer expansions and displacement transitions, and enable smooth automatic horizontal scrolling near viewport edges.
- **Subsequent drag positioning**: Resolve coordinate measurement residue after in-lane card reordering, ensuring precise hit-testing and offset calculation on subsequent drags.
- **Modal layouts**: Improve task and GitHub import modal layouts with resizable multi-line descriptions and complete input focus border visibility.

### Compatibility & Migration

- Requires Paseo `>= 0.11.4` (upgraded for native external URL navigation support).
- Includes automatic migration to settings schema version 3, adding default source metadata for existing tasks with zero data loss.

---

### 新增特性

- **GitHub Issue 导入**：支持从项目 GitHub.com origin 仓库按每页 25 条分页、全仓库创建时间排序及自动去重单向导入 Open Issues 到指定普通泳道。卡片与详情提供来源链接并支持使用系统浏览器打开，导入后任务独立管理。

### 修复与优化

- **拖拽动画与平滑交互**：消除卡片跨泳道拖拽时的视觉跳变，优化占位槽展开与卡片位移过渡动画，并支持视口边缘自动平滑水平滚动。
- **二次拖拽定位计算**：修复泳道内卡片重排后坐标测量残留问题，确保后续拖拽的槽位计算与抓取偏移准确无误。
- **弹窗布局与交互增强**：优化任务编辑与 GitHub 导入弹窗布局，支持多行描述拖拽调整高度并确保输入框焦点边框完整展示。

### 兼容性与迁移

- 依赖 Paseo `>= 0.11.4`（升级以接入宿主原生外部链接能力）。
- 自动将看板设置平滑迁移至版本 3，向后兼容现有任务并补充默认来源元数据（完全向后兼容）。

## [0.1.4] - 2026-10-17

### Features

- **Reversible task completion**: Mark tasks complete by checking the card's checkbox or dragging it into the dedicated completion lane; uncheck or drag out to restore cards to their original swimlane.
- **Host operation notifications**: Deliver instant Toast notifications for task and lane creation, updates, and deletion, alongside immediate alerts for save conflicts or operational errors.

### Fixes & Improvements

- **Locale detection**: Correctly detect browser system language preferences when Paseo is set to follow system language, ensuring appropriate localized display.
- **Draft preservation**: Keep forms, draft content, and inline error explanations intact upon save conflicts or validation failures, preventing data loss.
- **Documentation**: Introduce a streamlined bilingual marketplace overview and refined development guidelines.

### Compatibility & Migration

- Requires Paseo `>= 0.8.0`.
- Includes automatic lossless migration for legacy Done lanes; no manual setup or data migration required.

---

### 新增特性

- **可逆任务完成**：支持勾选卡片复选框或拖入专用完成泳道标记完成；取消勾选或拖出泳道可无损恢复至原泳道。
- **宿主操作通知**：接入 Paseo 宿主 Toast 即时反馈，任务与泳道的创建、更新、删除及保存异常均提供轻量提示。

### 修复与优化

- **语言环境判定**：修复 Paseo 设置跟随系统语言时浏览器环境语言判定偏差，确保准确本地化显示。
- **草稿保护机制**：保存冲突或校验失败时完整保留用户输入草稿与行内错误解释，防止数据丢失。
- **文档完善**：精炼中英双语应用商店介绍并规范本地开发指引。

### 兼容性与迁移

- 依赖 Paseo `>= 0.8.0`。
- 历史完成泳道自动无损平滑迁移，无需手动操作（完全向后兼容）。

## [0.1.3] - 2026-10-17

### Features

- **Workspace tab integration**: Open Kanban as a native workspace tab from the `+` menu and place it beside agents or terminals with Paseo's split controls; the sidebar entry remains available.
- **Independent project filtering**: Workspace tabs initially filter to their project's tasks. Filters are independent across open boards while tasks and lanes remain host-shared.

### Fixes & Improvements

- **Narrow split adaptation**: Adapt the toolbar and board responsive layout to narrow split panes using measured container width.
- **Project filter fallback**: Keep project filtering available by ID when project names cannot be resolved.
- **Plugin unloading cleanup**: Clean up surface, sidebar, and workspace panel registrations when the plugin unloads.

### Compatibility & Migration

- Requires Paseo `>= 0.8.0`.
- No board data migration or dependency changes required.

---

### 新增特性

- **工作区标签页集成**：支持通过 `+` 菜单将看板作为原生工作区标签页打开，可与 Agent、终端任意分屏；保留侧边栏入口。
- **独立项目筛选**：工作区标签页默认筛选当前项目，各看板入口筛选相互独立，任务和泳道在宿主内统一共享。

### 修复与优化

- **窄分屏响应式适配**：依据容器实测宽度自动优化工具栏与泳道在窄分屏下的响应式排布。
- **项目筛选降级容错**：项目名称读取失败时，仍支持按项目 ID 筛选。
- **插件卸载清理**：完善插件卸载时的 Surface、侧边栏及工作区面板资源释放。

### 兼容性与迁移

- 依赖 Paseo `>= 0.8.0`。
- 无需看板数据迁移或依赖项变更。
