# Issue #14：发送弹窗的模型选择能力

## 结论与核实范围

2026-10-20，需求提出者已选择直接发送任务提示词并启动新 Agent，要求在发送弹窗增加模型选择。本次核对项目使用的 `@getpaseo/plugin`、`@getpaseo/client`、`@getpaseo/protocol` 0.11.4 发布包，以及 Paseo 源码提交 `ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c`。

现有 SDK 已提供模型目录、运行模式、思考选项与动态功能的数据及创建参数，无需仅为这些能力升级 SDK。后续需求已进一步收敛为只选择宿主已配置的 Agent Profile，不单独展示模型等参数。下方保留能力对照，当前预设方案与设置跳转可行性见“Agent 预设下拉框”一节。尚未连接真实宿主读取配置或启动 Agent，不能据此列出用户当前可用的具体预设。

## 公开能力

| 能力                         | 公开接口或字段                                                                                | 返回内容及含义                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 获取完整 Provider / 模型目录 | `paseo.providers.snapshot({ cwd })`                                                           | `entries` 含 Provider 身份、名称、启用标记、状态、内置或自定义来源、模型、运行模式、默认模式 ID             |
| 查询 Provider 可用性         | `providers.listAvailable()`                                                                   | Provider ID、是否可用；不包含完整模型目录                                                                   |
| 按 Provider 查询模型         | `providers.listModels(providerId, { cwd })`                                                   | 模型 ID、名称、描述、默认标记、是否可选、别名、上下文窗口及思考配置                                         |
| 查询运行模式                 | `providers.listModes(providerId, { cwd })`                                                    | 模式 ID、名称、描述、图标等；具体选项由 Provider 提供                                                       |
| 读取模型思考选项             | 模型的 `thinkingOptions` / `defaultThinkingOptionId`                                          | 选项 ID、名称、描述及默认标记；不是所有模型都有                                                             |
| 查询动态功能                 | `providers.listFeatures({ provider: "provider/model", modeId?, thinkingOptionId? }, { cwd })` | Provider 根据当前配置返回的 `toggle` 或 `select` 字段、当前值、选项及说明                                   |
| 创建 Agent 时应用选择        | 工作区句柄的 `agents.create({ config, title, prompt })`                                       | `config.provider` 必填，格式为 `providerId/modelId`；可选传入 `modeId`、`thinkingOptionId`、`featureValues` |
| 读取宿主配置中的 Agent 预设  | `paseo.config.get()` 的 `config.agentProfiles`                                                | 名称、Provider、模型、模式、思考选项及动态功能值；这是配置预设，不是客户端上次使用的模型                    |

Provider 不等于模型供应商。界面应该以宿主返回的 Provider 标签分组，并保留 Provider ID 与模型 ID 的组合身份，避免把不同 Agent 提供的同名模型混为一个选项。

`cwd` 是公开查询参数；模型目录可以与目标项目或工作区目录有关，不应仅凭插件运行目录获取目录。

## 宿主界面可复用到哪一层

- 宿主的 `CombinedModelSelector` 将 Provider 与模型合并选择，内部使用 `ModelBrowser`。组件属于 `packages/app/src`，没有从 `@getpaseo/plugin/client/ui` 或 `client/react-native` 导出。[S1]
- 宿主模型目录逻辑用 `isSelectable !== false` 判断是否可选；模型别名用于解析模型引用。上述字段是现有选择语义，来源于目录合同，并非新增防御场景。[S2]
- 模型默认标记 `isDefault` 只说明对应 Provider 目录内的默认模型，不能推导用户在多个 Provider 中偏爱哪一个。
- 宿主通过客户端 `createAgentPreferencesService` 记录 Provider、各 Provider 的模型、模式、按模型保存的思考选项及动态功能偏好；该服务和 `useAgentFormState()` 都是应用内部实现，没有对应的插件偏好读取接口。[S3][S4]
- 动态功能查询依赖 Provider、模型、模式与思考配置；有能力读取不代表本功能已经决定展示所有高级选项。[S5]

## 先前的独立模型选择建议（已由预设方案取代）

以下先前建议未确认为实施要求，需求提出者已选择更简单的整套预设下拉框：

1. 首版在发送弹窗提供单个“模型”选择字段，按 Provider 分组；使用宿主返回的标签与模型 ID，不硬编码模型目录。
2. 首版是否同时展示运行模式、思考选项或动态功能，需要需求提出者选择范围。建议先只选模型，其余不显式覆盖，让 Provider 使用其默认配置；这仍需真实宿主验收确认具体 Provider 行为。
3. 模型默认选中策略仍需明确。建议首次由用户显式选择；是否记住看板内上次选择是另一项产品决策，不能把宿主内部偏好当作公开可读数据。

本次仅调查能力，没有新增模型不可用、目录读取失败、自动切换、恢复或重试等异常场景处理要求。

## Agent 预设下拉框

### 已确认的产品方向

需求提出者要求只提供一个下拉框，从 Paseo 已有的 Provider、模型、thinking 等整套预设中选择，默认选列表第一项。核实设置导航接口缺失后，用户已放弃跳转按钮，改为静态小提示。插件不再分别提供参数选择器，也不新增上次选择偏好。

### 预设读取与应用：公开 API 可行

- `paseo.config.get()` 返回的 `config.agentProfiles` 即宿主设置维护的 Agent Profile 列表，属于当前所选宿主配置，不是看板私有预设。
- 每项含 `id`、`name`、`provider`，以及可选的 `model`、`modeId`、`thinkingOptionId`、`featureValues`，另有图标、颜色和说明。
- 下拉框可使用 `id` 识别预设、`name` 显示预设名称，选择后将其 Agent 配置用于新会话创建。名称、图标和说明等展示属性不应作为 Agent 配置字段传入。
- 宿主 `useAgentProfiles()` 本身也从 daemon 配置读取该列表；新建和编辑预设通过更新整份 `agentProfiles` 完成。看板只需读取及应用，不需要复制一套预设编辑功能。
- 宿主配置没有给预设定义全局 `isDefault` 标记。用户已决定直接沿用列表顺序、默认第一项，不使用模型默认标记推导默认预设。
- 预设 schema 中模型等字段允许省略；该事实尚未转化为任何额外默认值、纠正或异常处理方案。

### 跳转宿主设置：没有找到公开插件入口

- 宿主的 `HostAgentsPage` 包含 `AgentProfilesSection`；其内置页面路由是 `/settings/hosts/{serverId}/agents`。
- 当前插件公开 `openSettings(id)` 只允许打开本插件注册的设置页。宿主 `createPluginCapabilities()` 会先验证 ID 属于该插件的 `settingsScreens`，不能用它打开内置 Agents 设置页。
- `navigation` 仅公开 Agent、工作区及可选浏览器导航；没有内置设置页导航。已核实项目 SDK 0.11.4、发布 SDK 0.12.0 及本次固定的宿主 main 合同。
- 因此，“预设下拉框并发送”可以依靠现有 API 实现；跳转内置 Agent 设置曾存在接口缺口，用户现已选择以静态提示替代按钮，不再需要为本功能补齐该导航接口。

这属于所需导航能力的可用性判断，不是新增异常处理要求。本次未操作宿主配置或实际创建 Agent。

源码证据：

- 本地 `node_modules/@getpaseo/protocol/dist/agent-profile.js`：预设字段合同。
- [宿主读取与保存预设](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/app/src/agent-profiles/internal/use-agent-profiles.ts#L17)。
- [宿主 Agents 设置页包含预设管理](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/app/src/screens/settings/host-page.tsx#L277)。
- [插件 openSettings 的注册校验](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/app/src/plugins/actions.ts#L26)。
- [插件设置导航的实际路由](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/app/src/plugins/settings/routes.ts#L1)。

## 一手证据

本地发布包：

- `node_modules/@getpaseo/client/dist/index.d.ts` 的 `PaseoProviderActions`、`PaseoAgentConfig`。
- `node_modules/@getpaseo/client/dist/index.js` 的 `parseProviderModel()` 及 `toDaemonAgentCreateOptions()`。
- `node_modules/@getpaseo/protocol/dist/messages.js` 的 `ProviderSnapshotEntrySchema`、`AgentModelDefinitionSchema`、`AgentFeatureSchema` 与 Provider 查询请求及响应。

宿主源码：

- [S1：组合模型选择器](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/app/src/components/combined-model-selector.tsx#L29)
- [S2：模型目录选择语义](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/app/src/provider-selection/model-catalog.ts#L18)
- [S3：客户端新建会话偏好](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/app/src/create-agent-preferences/preferences.ts#L4)
- [S4：偏好读取与保存服务](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/app/src/create-agent-preferences/service.ts#L13)
- [S5：草稿动态功能查询](https://github.com/getpaseo/paseo/blob/ab6cdb7c896f6e79aaae1ce68b59ca44b1a9c19c/packages/app/src/hooks/use-draft-agent-features.ts#L18)
