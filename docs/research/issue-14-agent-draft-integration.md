# Issue #14：宿主新会话草稿与工作区接入核实

## 范围与结论

2026-10-20 核实。本文保留原先输入框预填方案的接入调查；后续需求提出者已明确改为直接发送并启动 Agent，发送弹窗增加模型选择。当前决策见 [设计记录](../design/issue-14-solve-with-agent.md)，模型能力见 [模型选择调研](./issue-14-model-selection.md)。本文不包含异常处理方案。

- 当前项目的 `@getpaseo/plugin@0.11.4` 与 npm 最新发布版 `0.12.0` 均未公开打开新会话草稿并预填文本的接口。
- 同时核对 Paseo `main` 提交 `ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c`：宿主内部已有新会话草稿、工作区创建流程及模型配置界面，但插件导航合同仍未开放相应能力。
- 仅升级插件 SDK 不能完成原先的输入框预填体验。当前已改用公开 API 支持的直接发送方案，不再需要草稿接入点。

## 已有能力与缺口

| 所需能力                                   | 核实结果                                             |
| ------------------------------------------ | ---------------------------------------------------- |
| 列出项目与已有工作区                       | 当前 SDK 有 `projects.list()` 与 `workspaces.list()` |
| 创建工作区、配置 local / worktree          | SDK 有创建能力；宿主自身也有创建界面                 |
| 从插件打开宿主工作区创建流程并取得选择结果 | 已检查的插件公开导航接口未提供                       |
| 打开已存在的 Agent                         | 插件导航有 `openAgent({ agentId, serverId? })`       |
| 打开新会话草稿并填入任务提示词             | 宿主内部具备草稿模型，已检查的插件公开接口未提供     |
| 新会话选择 Provider、模型和思考配置        | 宿主新会话草稿使用现有 Composer 配置控件             |

SDK 类型证据：本仓库 `node_modules/@getpaseo/client/dist/index.d.ts`；`@getpaseo/plugin@0.11.4` 与 `0.12.0` 发布包的 `dist/client/contracts.d.ts`、`dist/client/index.d.ts`、`dist/client/buttons.d.ts`。调研 `0.12.0` 仅下载至临时目录，未修改项目依赖。

## 宿主实际流程

1. `WorkspaceTabTarget` 区分 `draft` 与 `agent`；新会话草稿无需先拥有实际 Agent ID。[S1]
2. `WorkspaceDraftAgentTab` 使用 `useAgentInputDraft()` 管理文字与会话配置。用户提交时，宿主将草稿文本作为初始消息创建 Agent。因此可以让用户在真正创建 Agent 之前编辑提示词、选择模型。[S2]
3. 插件 `openAgent()` 仅转发目标 Agent ID；`openWorkspace()` 仅打开工作区，不带新草稿目标或文字。[S3][S4]
4. 宿主新建工作区入口导航到内置创建界面；创建界面分别处理空工作区与含聊天消息的提交。直接把任务提示词交给其普通聊天提交流程会触发后续发送，不能直接当作“创建工作区后保留未发送草稿”的实现。[S5][S6]

## 原预填方案的建议（当前未采用）

- 将产品中的“新建会话”映射为宿主的新会话草稿，实际 Agent 在用户点击发送时创建；模型等配置直接在宿主聊天界面选择。
- 将宿主公开接入能力列为 #14 的前置依赖：支持打开原生工作区创建流程并返回结果；支持在指定工作区新建草稿、预填文本并打开该草稿。
- 接口名称及签名仍未定，不将任何建议名称写为现有 API。

以上建议未获采用；没有新增失败恢复、自动重试或兼容回退要求。

## 后续调查：放弃输入框预填后的可行方案

需求提出者要求调查替代路径，并在后续明确选择下述方案 A；模型选择置于发送弹窗。原生工作区创建界面缺少插件接入点，具体创建表单仍待明确。

### 方案 A：新建 Agent 并直接发送

当前 SDK 0.11.4 可完成核心流程：

1. `projects.list()` / `workspaces.list()` 获取项目与工作区，由看板展示选择表单。
2. 如需新建，使用 `workspaces.create()`：`source.kind = "directory"` 可在现有项目目录创建新的工作区记录；`source.kind = "worktree"` 可创建 worktree 工作区。
3. 指定工作区句柄的 `agents.create({ config, title, prompt })` 创建新 Agent；SDK 自动使用该工作区目录和 ID，并把 `prompt` 映射到创建请求的 `initialPrompt`。
4. 用 `navigation.openAgent({ agentId })` 打开该 Agent 聊天界面。

这会实际提交任务并启动 Agent，不是保存聊天草稿。看板继续不接收 Agent 运行状态，不自动完成任务。

创建 Agent 的 `config.provider` 必填，格式为 `provider/model`；不能省略它并假定 SDK 自动读取宿主客户端上次选择。公开 `providers.listAvailable()`、`listModels()`、`listModes()`、`listFeatures()` 提供配置读取能力，可用于看板自己的配置控件。

### 方案 B：新建空 Agent 并复制任务提示词

公开 `agents.create()` 的 `prompt` 可省略；`copyText()` 可复制任务文本。可以创建空会话、复制提示词并打开会话，由用户手动粘贴发送。这保留发送前的手动检查，但增加粘贴操作；仍需在创建 Agent 前提供 Provider / 模型配置。

此方案未获选定，也不作为自动回退。

### 两种方案共同存在的界面约束

底层工作区创建 API 已有，并不意味着可以从插件复用宿主创建界面：

- 插件公开导航没有原生新建工作区入口或返回创建结果的接口。
- `@getpaseo/plugin/client/ui`、`client/react-native` 未导出原生新建工作区表单或 Agent / 模型配置表单组件。
- 宿主内部 `useNewWorkspaceForm()` 与 `/new` 路由属于应用内部实现，不是插件的公开接入合同。

因此，如果需求改为“仅在看板插件内实现，不修改宿主”，还需要确认允许看板提供自己的工作区创建表单及 Agent / 模型选择控件。若继续要求直接复用宿主创建界面，仍有宿主接口前置依赖。

以上结论来自 SDK 类型、SDK 实现和宿主源码检查，未在真实 Paseo 宿主启动 Agent。没有新增异常场景处理要求。

### 后续调查的本地源码证据

- `node_modules/@getpaseo/client/dist/index.d.ts`：`PaseoAgentCreateOptions`、`PaseoAgentConfig`、`PaseoWorkspaceHandle`、`PaseoWorkspaceActions`、`PaseoProviderActions`。
- `node_modules/@getpaseo/client/dist/index.js`：`toDaemonAgentCreateOptions()` 的初始 Prompt 映射、工作区句柄 `agents.create()` 的目录与 ID 绑定、`parseProviderModel()` 的 Provider / 模型格式要求。
- `node_modules/@getpaseo/protocol/dist/messages.js`：`WorkspaceCreateRequestSchema` 的 `directory` / `worktree` 来源定义。
- `node_modules/@getpaseo/plugin/dist/client/react-native.d.ts`：`copyText()`。
- [宿主内部工作区表单](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/app/src/screens/new-workspace/form/index.tsx#L165)。

## 一手来源

补充核实：工作区名称与分支名称独立。创建合同分别提供顶层 `title` 与 `source.branchName`；宿主[工作区持久记录](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/server/src/server/workspace-registry.ts#L49) 也明确区分显示名称、用户标题和 Git 分支。显示名称没有 Git 分支名限制。用户核实后已选择在新建 worktree 时单独显示 Git 分支名输入框，工作区名称不再承担分支命名规则；没有因此确认任何新增校验方案。

补充核实 worktree 起点：[resolveWorktreeCreationIntent()](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/server/src/server/resolve-worktree-creation-intent.ts#L72) 在 `action = "branch-off"` 时使用显式 `refName`，未指定则调用宿主默认分支解析。底层 [createWorktreeCore()](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/server/src/server/worktree-core.ts#L82) 将请求转交该逻辑。因此“从项目当前提交开始”是需要显式传入 `HEAD` 的产品选择，不能当作 Paseo 省略参数时的默认行为。目前建议沿用宿主解析的默认分支，尚待需求提出者确认。

项目与工作区合同均包含 `projectKind`，可区分 Git 项目与普通目录。新建 worktree 需要 Git 仓库；普通目录项目的选项呈现仍待确认。看板项目关联保存和 Paseo 工作区、Agent 创建属于不同调用，公开合同未提供把它们合并为一个事务的入口；失败时的新增反馈与恢复方案没有因此获得授权。

全部源码链接固定到本次核实提交。

- [S1：工作区标签目标模型](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/app/src/workspace-tabs/model.ts#L35)
- [S2：新会话草稿界面与提交创建 Agent](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/app/src/composer/draft/workspace-tab.tsx#L135)
- [S3：插件公开导航合同](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/plugin/src/client/contracts.ts#L34)
- [S4：宿主执行插件导航](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/app/src/plugins/host-navigation-model.ts#L13)
- [S5：宿主新建工作区入口](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/app/src/hooks/use-global-new-workspace-action.ts#L17)
- [S6：宿主新建工作区提交流程](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/app/src/screens/new-workspace-screen.tsx#L1289)
- [官方插件参考](https://paseo.sh/docs/plugins/reference)
