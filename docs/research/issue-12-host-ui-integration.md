# #12：看板与 Paseo 宿主 UI 接入对照

## 范围与结论

对应 [Issue #12](https://github.com/breathi3552/paseo-kanban/issues/12)。调研基于仓库提交 `24acbcb`，插件版本 `0.1.3`、本地开发 SDK `@getpaseo/plugin@0.8.0`，以及 Paseo 当前官方插件参考文档。本文是接入机会与建议清单，不代表已确认的实施规格。

**当前集成基础已经较完整，最值得优先改善的是操作通知。** 任务与泳道编辑已经使用宿主 Modal 和 TextInput，任务长表单使用宿主 ScrollView；工作区标签页、主题、看板数据持久化、项目数据与工作区上下文也已接入。Issue 最初的“自制 Modal 迁移”与当前实现不符。

区分三类工作：

- **已有集成的体验优化**：通知、主题细节、编辑流程。
- **增加便捷入口或能力**：命令中心、复制任务、设置页、外链。
- **SDK 接口维护**：旧页面／侧边栏接口升级，独立于通知改进。

本次只作源码、类型与官方文档核对，没有进行宿主移动端手势或键盘实测。

## 接入对照清单

表中“0.8 已有”指本地 0.8.0 SDK 类型中存在该 API；“需升级”表示当前类型没有该 API，首次提供它的确切发布版本尚未核实。官方文档描述的是当前宿主契约。

| 项目                            | 当前实现与证据                                                                                                                | 宿主公开接入点                                                                                                                  | 实际差异                                                                                                                             | 建议                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 操作通知                        | 保存／删除成功后关闭表单；失败显示表单横幅，看板显示保存错误与刷新入口。未使用 Toast。[C1][C2]                                | `useToast().show/error`，0.8 已有。[S1][T1]                                                                                     | 宿主统一短暂反馈；现有横幅承载持续错误和恢复操作，两者作用不同。                                                                     | **优先接入**，按通知场景分层，保留需要持续显示的状态。                                           |
| 弹窗／Bottom Sheet              | 两个表单都使用宿主 `Modal`。[C1]                                                                                              | `Modal` 宽屏为对话框、compact 为 Bottom Sheet。[S2][T1]                                                                         | 外壳已统一；内部按钮和布局仍由看板负责。                                                                                             | **已经接入**，无需重新迁移，也无需引入独立 Bottom Sheet 库。                                     |
| 滚动、键盘与粘贴                | 任务表单采用 `Modal.Content scrollable={false}` + 宿主 `ScrollView`；泳道表单使用默认滚动；两者输入均为宿主 `TextInput`。[C1] | 宿主列表集成 Sheet 手势；TextInput 注册焦点以配合键盘避让、支持系统粘贴。[S3][S4][T1]                                           | 当前结构符合一个垂直滚动拥有者的公开用法；实际跨端表现仍需实测。                                                                     | **保留并验收**，不把长表单使用自定义滚动容器判成集成不足。                                       |
| 泳道／项目选择                  | 任务表单使用换行的 Pressable 选项；看板项目筛选使用横向滚动选项。[C3]                                                         | `SettingsSelect`，0.8 已有；官方定位为设置行，使用自适应菜单。[S5][T2]                                                          | 可减少选项多时的空间占用，但带设置行布局，不是通用 Chip 或任意位置的下拉框。少量选项当前方式更直接。                                 | **有选项拥挤问题再评估**，验证设置行在任务表单中的适用性；不强制全量替换。                       |
| 按钮、复选框、删除确认          | 表单按钮、子步骤勾选、两步删除确认由看板绘制；卡片完成控件有 checkbox 语义。[C1][C4]                                          | 当前公开 Host UI 与本地 UI 导出没有通用表单 Button、Checkbox 或独立确认弹窗；`SettingsAction/Switch` 是设置行。[S2][S5][T1][T2] | 宿主示例也使用 RN Pressable 绘制表单按钮。自制表单控件本身不等于低集成度。                                                           | **继续自绘**，按主题、可访问性和一致性检查控件。                                                 |
| 主题与窄屏                      | 样式主要使用 `theme.colors`；看板结合宿主 compact 与实测分屏宽度调整布局。删除确认文字仍有 `#fff`。[C5]                       | `theme.colors`、`layout.compact`，已接入。[S6]                                                                                  | 差异集中在局部颜色与状态的可读性，不是缺少主题机制。                                                                                 | **小范围完善**，检查确认删除等对比度；无需为看板贡献一套新宿主主题。                             |
| 复制任务内容                    | 没有一键复制动作；卡片文字未声明 `selectable`，卡片区域参与拖拽。[C4]                                                         | `copyText(text): Promise<void>`，0.8 已有；RN `Text selectable` 可提供系统选择复制。[S4][T1]                                    | 一键复制是新增能力。直接让全部卡片文本可选，可能与长按拖拽争夺手势。                                                                 | **值得作为独立小增强**，在详情中放复制动作；确定复制格式后再接入，等待成功后提示。               |
| 外链                            | 任务描述是编辑文本，当前没有任务外链操作。[C1]                                                                                | `ExternalLink`、`openExternalUrl`；当前 0.8 类型无这两个导出。[S7][T2][T5]                                                      | 宿主按平台打开 HTTP(S) 链接并处理部分安全边界；不负责从任务描述中识别链接。                                                          | **有明确链接场景再接入**，同时升级 SDK 与宿主最低要求。不要为了“安全跳转”凭空增加 URL 解析功能。 |
| 标准设置页                      | 未注册插件设置页。现有 `useSettings(kanbanSettings)` 用于看板数据，不等于设置页面。[C6]                                       | `addSettingsScreen`、`Settings*`、`openSettings`，0.8 已有。[S5][T2][T3]                                                        | 宿主提供导航、布局、滚动和设置控件；插件仍决定偏好内容及存储语义。                                                                   | **有真实偏好再建**。host-scope 偏好会在同宿主的授权客户端间共享，不能默认为设备独立设置。        |
| 命令中心入口                    | 现有入口为侧边栏与工作区面板。[C7]                                                                                            | `addCommandCenterItem`，0.8 已有。[S8][T3]                                                                                      | 可从 Cmd/Ctrl+K 搜索并打开看板，减少找入口的成本；不改变任务语义。0.8 使用 `openSurface`，当前文档使用 `openScreen`。                | **值得接入，次于通知**：全局打开看板／当前工作区打开看板即可，暂不扩张成任务命令系统。           |
| 宿主标题栏、菜单、Composer pill | 未注册这些贡献；已有工作区标签页。[C7]                                                                                        | `addHeaderButton`、`addComposerPill` 与按钮 `menu/popover` 描述，0.8 类型已有。[S9][T3][T4]                                     | 这些菜单附着在宿主标题栏／Agent Composer，不是可直接用于任意任务卡片的通用上下文菜单。新增入口还需管理目标工作区／Agent 与生命周期。 | **按入口需求评估**，命令中心通常更轻量；不用于替换卡片拖拽或直接套入表单按钮。                   |
| 页面与侧边栏接口                | `addSurface` + `addSidebarItem`。[C7]                                                                                         | 当前文档推荐 `addScreen` + `addSidebarHeaderItem`／`SidebarRow`；本地 0.8 类型没有这些新接口。[S10][T3]                         | 新接口提供组件式侧边栏、页面标题与参数等；文档明确把旧 `addSidebarItem` 称为 deprecated，但这不等于当前入口已失效。                  | **独立维护任务**，随 SDK 升级处理；保留 `kanban` 标识与已保存链接，不与 Toast 改进绑定。         |
| 工作区面板与上下文              | `addWorkspacePanel`；`useWorkspace` 读取 projectId 作为初始筛选。[C7]                                                         | 相同公开 API；宿主拥有标签页、分屏、关闭、恢复和错误边界。[S11]                                                                 | 原生标签页和上下文已接入，筛选仍是共享看板的视图。                                                                                   | **已经接入，保持现状**。                                                                         |
| 看板存储与项目数据              | `defineSettings` + `useSettings` 存整板；`usePaseo` 读取并订阅项目。[C6][C8]                                                  | host-scope 设置、现有 SDK 连接、工作区缓存。[S5][S11][S12]                                                                      | 已委托宿主持久化、版本校验和连接。看板自己的草稿与项目请求顺序控制是业务所需。                                                       | **已经接入**；SDK 升级时核对项目订阅契约，不为 UI 对齐重做存储。                                 |
| 语言同步                        | 使用自有词条、语言探测与 storage/focus 监听，包括宿主存储键及环境回退。[C9]                                                   | 本地公开 surface 类型没有 locale/language，当前插件参考文档也未列出专用语言订阅 Hook。[T3][S6]                                  | 自有词条有必要；读取宿主存储键属于脆弱耦合，不是已公开的语言接口。                                                                   | **记录接口缺口**，后续优先采用正式语言接口；本次没有证据支持直接换成某个现成 Hook。              |
| 看板拖拽与落位                  | 看板自己的 PanResponder、Animated、占位槽与提交生命周期。[C10]                                                                | 当前插件参考文档未提供看板拖拽接口。[S2][S3]                                                                                    | Sheet 滚动手势与卡片跨泳道拖拽是不同能力。                                                                                           | **保持看板负责**，复用宿主弹窗不改变任务流转和落位规则。                                         |

## 通知：推荐分层

以下是待确认的设计建议。宿主 Toast 默认 `show` 持续 2200ms、`error` 持续 3200ms；新 Toast 替换当前 Toast。公开接口没有重试按钮、撤销动作或通知队列契约。[S1][T1]

| 场景                       | 现状                                                                                        | 推荐呈现                                                 | 理由                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| 创建／编辑保存成功         | 关闭任务或泳道表单。[C1]                                                                    | 可用简短成功 Toast                                       | 表单关闭后仍能确认写入成功。                                          |
| 删除成功                   | 两步确认后，成功关闭表单。[C1]                                                              | 简短成功 Toast                                           | 破坏性操作值得明确确认结果。                                          |
| 标题／子步骤为空等校验失败 | 表单顶部错误横幅。[C1][C11]                                                                 | 保留持久表单提示，优先靠近错误输入                       | 用户需要边修改边查看原因，不适合只弹 Toast。                          |
| 表单保存冲突／删除失败     | 保留表单与草稿；snapshot.error 显示错误，settings.saveError 也可能在看板显示。[C1][C2][C11] | 持久表单说明；可补一次错误 Toast，统一同次操作的提示来源 | 需要解释草稿是否保留与下一步；避免同时由多个状态观察者重复发 Toast。  |
| 拖拽／完成状态写入失败     | 看板横幅加刷新入口。[C2]                                                                    | 即时错误 Toast + 必要的持续恢复入口                      | 用户应立即知道操作未保存，恢复操作不能随 Toast 消失。                 |
| 高频拖拽／勾选成功         | 看板视觉状态更新。[C2][C4]                                                                  | 默认使用视觉反馈，不逐次发成功 Toast                     | 避免刷屏与覆盖更重要的错误。                                          |
| 看板读取失败／存储格式异常 | 整板错误状态与重试入口。[C2]                                                                | 保留整板状态，不以 Toast 替代                            | 用户需要持续看到不可用原因与重试方式。                                |
| 项目名称暂时读取失败       | 筛选区域提示，允许按 ID 展示与筛选。[C2][C8]                                                | 保留局部降级提示                                         | 部分功能仍可用，不应把局部问题放大全局失败。                          |
| 复制／打开链接             | 当前无动作                                                                                  | 将来接入时，由该次操作的结果发 Toast                     | 复制必须 await 成功；外链需区分宿主拒绝／系统打开失败等行为。[S4][S7] |

### 实施边界

- 通知从一次用户操作的结果触发，避免在组件每次渲染、重新挂载或其他看板入口观察到状态时重复弹出。
- 当前 `SessionResult` 的失败结果只有错误字符串，没有结构化失败类别。[C11] 若区分校验、冲突、操作失败，不宜靠匹配中英文错误文本决定通知行为。
- Toast 不改变保存基准、自动合并或重试策略。现有 ADR-0002 要求保存失败保留草稿、不静默覆盖。
- 看板 `settings.reload()` 不会重新建立已打开编辑会话的 `baseBoard/baseRevision`。[C2][C11] 因此不能把“刷新”文案写成“已更新草稿基准，可以直接再次保存”；改善冲突恢复流程是另一项需要明确设计的工作。
- 新设置偏好可以定义独立的 host-scope 设置文档；是否与看板文档共用版本应由真实的数据原子性要求决定。宿主没有要求所有偏好必须塞进整板文档。[S5]

## 建议优先级

1. **本轮主线：通知分层与去重**，保留草稿、持续错误与恢复入口。使用已有 API，无需仅为 Toast 提高最低宿主版本。
2. **低成本候选：命令中心打开看板、详情复制任务**。复制需要先确认内容格式。
3. **已有集成的局部改善：主题对比度、长表单／键盘跨端验收、项目选项拥挤时的选择控件评估**。
4. **需求驱动再做：设置页、外链、标题栏／Composer 新入口**。
5. **单独维护：SDK 与旧页面／侧边栏接口升级、正式语言接口跟进**。

通知改进不需要新增领域实体；现有草稿与版本冲突约束见 ADR-0002。本文没有确认新的术语定义或长期架构取舍，因此不修改 GLOSSARY 或新增 ADR。

## 一手证据索引

### 当前仓库

- [C1] `client/task-modal.tsx:236–291`（保存／删除结果、宿主 Modal、ScrollView、错误、标题输入），`:380–544`（子步骤与删除／保存操作）；`client/lane-modal.tsx:148–289`（保存、删除、宿主 Modal、错误与按钮）。
- [C2] `client/kanban-board.tsx:57–153`（settings、操作结果）、`:370–425`（读取与格式错误）、`:491–589`（项目筛选、项目错误、保存失败与刷新入口）。
- [C3] `client/task-modal.tsx:301–375`（普通泳道与项目选项）；`client/kanban-board.tsx:491–570`（筛选选项）。
- [C4] `client/kanban-card.tsx:158–223`（checkbox 语义、卡片拖拽、标题显示）；`client/task-modal.tsx:380–454`（子步骤控件）。
- [C5] `client/kanban-board.tsx:43–52`（分屏宽度）、`:212–367`（主题样式）；`client/task-modal.tsx:493`、`client/lane-modal.tsx:242`（确认删除文字硬编码白色）。
- [C6] `shared/kanban.ts:237` 起（kanbanSettings）、`index.server.ts:5`（注册设置）、`client/kanban-board.tsx:57`（useSettings）。
- [C7] `index.client.tsx:6–48`（页面、侧边栏、工作区面板、语言更新与清理）；`client/kanban-workspace-panel.tsx:7–13`（工作区初始项目筛选）。
- [C8] `client/use-projects.ts:81–125`（SDK 项目读取、订阅、清理与名称解析）。
- [C9] `client/i18n.tsx:168–293`（语言探测、环境回退与事件监听）；`docs/adr/0003-internationalization-and-locale-adaptation.md`（语言适配约束）。
- [C10] `client/kanban-drag.ts`、`client/kanban-overlay.tsx`；`docs/adr/0001-task-ordering-and-drag-animation.md`、`docs/adr/0002-task-reordering-and-drag-lifecycle-convergence.md`（排序与落位约束）。
- [C11] `client/kanban-session.ts:16–19`（SessionResult）、`:108–109`、`:153–154`（固定基准）、`:338–425`（任务校验、保存与失败保留）；ADR-0002、ADR-0004（版本校验与整板存储）。
- 版本基线：`package.json`、`paseo-plugin.json`；检索当前 client 与入口未发现 Toast、copyText、设置页或命令中心注册。

### 本地 SDK 类型

类型文件用于核对本地 0.8.0 可导入的契约，不作为宿主移动端实测证据。

- [T1] `node_modules/@getpaseo/plugin/dist/client/react-native.d.ts:4–42`：Modal、Modal.Content、useToast、Icon、ScrollView、FlatList、copyText、TextInput。
- [T2] `node_modules/@getpaseo/plugin/dist/client/ui.d.ts`：Settings* 命名组件；本地文件没有 ExternalLink、SidebarRow 或通用表单 Button/Checkbox 导出。
- [T3] `node_modules/@getpaseo/plugin/dist/client/contracts.d.ts:8–31`（surface props）、`:60–74`（注册方法）、`:126–168`（openSurface、openSettings、命令中心）。本地没有 addScreen、addSidebarHeaderItem；props 没有 locale/language。
- [T4] `node_modules/@getpaseo/plugin/dist/client/buttons.d.ts`：宿主按钮贡献与 menu/popover 描述。
- [T5] `node_modules/@getpaseo/plugin/dist/client/index.d.ts`：本地公开客户端导出，没有 openExternalUrl 或语言订阅 Hook。

### 官方文档

- [S1] [Toasts](https://paseo.sh/docs/plugins/reference#toasts)：Toast 方法、时长与覆盖行为。
- [S2] [Host UI / Modal](https://paseo.sh/docs/plugins/reference#host-ui)：宿主 UI 导入、Modal 与用 Pressable 绘制按钮的示例。
- [S3] [Scrolling](https://paseo.sh/docs/plugins/reference#scrolling)：单一垂直滚动拥有者、Sheet 手势与 SDK 列表。
- [S4] [Copy and paste](https://paseo.sh/docs/plugins/reference#copy-and-paste)：copyText、系统选择与粘贴、TextInput 焦点及键盘。
- [S5] [Settings screens](https://paseo.sh/docs/plugins/reference#settings-screens)：设置页、命名控件、host-scope 文档、版本校验、reload 与草稿边界。
- [S6] [Theme and layout](https://paseo.sh/docs/plugins/reference#theme-and-layout)：主题 token、compact 与 platform。
- [S7] [External links and workspace browsers](https://paseo.sh/docs/plugins/reference#external-links-and-workspace-browsers)：ExternalLink/openExternalUrl、HTTP(S) 边界、平台差异与失败模式。非法 URL 可被忽略且 Promise resolve，不能简单等同“resolve 就打开成功”。
- [S8] [Command Center items](https://paseo.sh/docs/plugins/reference#command-center-items)：上下文与打开看板入口。
- [S9] [Header buttons / Button descriptor](https://paseo.sh/docs/plugins/reference#button-descriptor)：宿主按钮位置、自适应菜单、待处理与失败提示。
- [S10] [Screens and sidebar items](https://paseo.sh/docs/plugins/reference#screens-and-sidebar-items)、[Migration](https://paseo.sh/docs/plugins/migration)：当前页面和组件式侧边栏、旧接口说明、保留链接标识。
- [S11] [Workspace panels](https://paseo.sh/docs/plugins/reference#workspace-panels)：面板与缓存上下文、宿主管理的标签页行为。
- [S12] [Use the Paseo SDK](https://paseo.sh/docs/plugins/reference#use-the-paseo-sdk)：复用宿主 SDK 连接与订阅生命周期。
- [Requirements](https://paseo.sh/docs/plugins/reference#requirements)：采用新 API 时同步调整最低版本，daemon 与 app 分别检查兼容性。

## 待核实事项

- 新页面／侧边栏接口与外链接口的首次发布版本；实施升级时应以目标版本的实际类型与 daemon/app 契约确定最低要求。
- 当前设备上 Toast 在打开 Modal 时的呈现位置、可见性与关闭衔接，以及多看板入口同时打开时的通知行为。
- iOS／Android 和窄桌面中长表单滚动、键盘避让、下拉关闭与未保存内容的真实体验。
- 若复用 SettingsSelect，选项很多时的可用性、任务表单布局，以及项目暂时不可读时的 ID 回退。
