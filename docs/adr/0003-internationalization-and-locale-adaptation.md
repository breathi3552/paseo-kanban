# 插件国际化（i18n）与 Paseo 系统语言动态适配

为看板插件建立跨端、轻量且无原生绑定的国际化架构，支持随 Paseo 系统语言动态调整，统一归一化为中文（简繁全覆盖）与英文（其他语言兜底）。

## 背景

看板插件初期采用硬编码中文界面与错误信息。随着 Paseo 客户端走向多语言化（支持阿拉伯语、中文、英语、法语、俄语、西班牙语、日语、韩语等），插件需要完整支持国际化适配：
1. **轻量与跨端兼容**：Paseo 客户端运行于 React Native 环境（iOS、Android 及 React Native Web / Electron），`tsconfig.json` 不包含 DOM 库，且插件环境不可擅自引入需要原生编译链接或重型外部运行时。
2. **两级语言归一化规范**：需求暂定支持两种目标语言：
   - **中文 (`zh`)**：涵盖简体中文（`zh-CN`、`zh-Hans`、`zh-SG` 等）与繁体中文（`zh-TW`、`zh-HK`、`zh-Hant`、`zh-MO` 等）。
   - **English (`en`)**：涵盖 English 并作为所有其他非中文语言（日语、韩语、西班牙语、法语、俄语等）的默认回退语言。
3. **随系统语言动态调整**：Paseo 在设置中支持用户显式选择语言或设为 `system`（随系统），插件需具备多层渐进嗅探与动态订阅能力，避免重启或刷新即可响应语言变更。

## 决策

1. **分层语言感知与兜底策略（Tiered Language Resolution）**：
   - 语言探测按以下优先级依次探测，遇有效语言即执行归一化：
     1. **显式覆盖/Props 传递**：宿主或组件显式传入的 `props.locale`、`props.language` 或 `props.host.locale`。
     2. **Paseo 应用持久化配置**：读取 Web/Electron 本地存储 `@paseo:app-settings` 中的 `language` 字段。非 `system` 值直接生效。
     3. **宿主 DOM 环境标头**：读取 `document.documentElement.lang`。
     4. **宿主全局 i18n 实例**：读取 `globalThis.i18n?.language`。
     5. **系统/运行期 Locale**：读取 `Intl.DateTimeFormat().resolvedOptions().locale` 或 `navigator.language`。
   - 归一化规则（`normalizeLanguage`）：大小写不敏感，凡以 `zh` 开头者映射为 `zh`，其余所有情况一律映射为 `en`。

2. **跨端安全的全局监听与热更新（Dynamic Reactive Subscription）**：
   - 通过 `globalThis` 安全嗅探浏览器全局对象（`window`、`localStorage`、`document`、`MutationObserver`），不破坏 React Native 跨端编译约束。
   - 注册 `storage` 事件（捕获跨窗口配置变更）、`focus` 事件（切回激活即时检查）与 `MutationObserver`（监听 `lang` 属性变动），配合轻量轮询兜底，通过 `subscribeLanguage` 驱动全局视图热更新。
   - 侧边栏项（`client.addSidebarItem`）在 `index.client.tsx` 中订阅语言切换，语言变动时执行安全重注，实现宿主外壳与内容区同步更新。

3. **词条字典完整性与参数插值协议**：
   - 维护统一词典（`client/i18n.tsx`），`zh` 与 `en` 严格保持键集合 1:1 对齐。
   - 严格遵循 `CONTEXT.md` 术语（看板 / Kanban、泳道 / Lane、任务 / Task、卡片 / Card、子步骤 / Subtasks、占位槽 / Slot、落位 / Drop）。
   - 参数插值统一采用 `{key}` 占位符语法，安全处理数字、字符串及空值。

4. **领域会话（Session）与 UI 解耦的国际化适配**：
   - 会话控制器（`kanban-session.ts`）增加可选 `language?: "zh" | "en"` 参数，内置多语言错误消息映射。
   - 缺省时回退至原有中文提示，保障底层纯逻辑单元测试 100% 向后兼容；在 UI 挂载层（`kanban-board.tsx`）将当前活跃语言注入会话，保障端到端使用中的语言一致性。
