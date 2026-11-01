# 源码级统一组件体系、全看板弹窗收敛与交互安全规范

## 状态

已接受。

## 背景

原有看板在交互与界面层存在容器分裂与交互缺陷：

1. 弹窗体系割裂为自研 `BusinessDialog`（基于自定义 Web Portal）与宿主原生 `<Modal>` 两套体系；宿主原生 Modal 在桌面固定 520px 宽度，严重挤压“泳道管理”（需 1120px）、“GitHub Issue 导入”（需 840px / 90vw）及“Agent 派发”表单。
2. 删除确认缺乏统一规范，右键删除走宿主 Modal、任务详情走底栏内联展开、泳道删除走嵌套弹窗，呈现“一板三式”。
3. 键盘焦点交互存在高危陷阱：泳道管理等内联输入按 Escape 穿透导致外层大弹窗误关丢草稿；弹窗首焦点默认落于右上角关闭 (X) 按钮导致误按关闭。

为解决上述问题并建立长期一致的交互基底，系统确立了“吸收社区成熟解法、杜绝引入黑盒依赖、完全掌控源码”的技术演进路线。

## 决策

### 1. 源码级持有 UI 组件体系（shadcn/ui 模式）

- 借鉴 React Native Reusables (RNR) 与 @rn-primitives 设计哲学，核心基础组件（Button、Dialog、Input、ConfirmDialog、Badge、Checkbox、Select）源码直接落入 `client/components/ui/` 目录统一维护，不引入外部庞大 npm 全家桶依赖。
- 色彩与样式纯粹由 Paseo 宿主动态注入的 `theme.colors` 驱动，剥离任何静态 CSS/Tailwind 强绑定，动态适配日间、夜间及第三方宿主主题。

### 2. 弹窗体系收敛与桌面 Web 单模渲染

- 彻底废弃旧有 `BusinessDialog` 及各页面直接调用宿主 `<Modal>` 的做法，全板 5 个弹窗（任务详情、泳道管理、GitHub 导入、Agent 派发、删除确认）全量收敛至统一的标准 `Dialog` 体系。
- 明确当前阶段专注于桌面端体验，不支持移动端窄屏，不考虑窄屏抽屉适配，不再为移动端维护回退宿主原生 Modal 的冗余分支代码。
- 基于经过验证的独立 Portal 挂载至 `document.body`，保持自主突破 520px 宽度能力，严格维持 `z=0` 位于宿主 overlay plane（`z=1`）之下，不遮挡系统级 Toast 与 ⌘K 面板。

### 3. 删除二次确认统一收敛为 ConfirmDialog

- 废弃任务详情底栏内联展开与泳道管理内嵌业务弹窗的做法，所有危险破坏性操作（任务删除、普通泳道级联删除）统一收敛至标准轻量 `ConfirmDialog` 顶层覆盖模式。
- 在任务详情弹窗中触发删除确认时，ConfirmDialog 浮于详情窗之上；确认删除后双窗同步关闭，取消或关闭确认窗时完整保留未保存的任务编辑草稿。

### 4. 首焦点（Initial Focus）卡片优先与排除关闭按钮

- 弹窗挂载后优先将初始焦点置于 Dialog 容器卡片本身（`role="dialog"` 配合 `tabindex="-1"`），读屏器完整播报弹窗标题，避免直接强行抢占正文输入框干扰查阅详情、误唤起软键盘或敲击改动标题；同时通过 `dataSet={{ dialogClose: "" }}` 与中英文标签比对严禁关闭按钮抢占首焦。
- 明确全看板不支持 Tab 键切换焦点，拦截 Tab 默认跳焦行为；表单输入与按钮完全依赖用户主动鼠标点击或触碰激活，原子组件不维护 `focused` 状态，彻底消灭外层嵌套 Focus Ring 轮廓，仅在输入激活时展示原本边框高亮。

### 5. Escape 按键分层消费与 IME 防护

- 建立明确的事件消费分层契约：内联可编辑控件（如泳道内联改名、新增输入框）在接收到 Escape 时，优先执行“取消内联编辑”操作，并通过 `e.stopPropagation()` 与 `e.preventDefault()` 阻止事件向外传播。
- 外层 Dialog 容器在全局捕获/冒泡链路中检测到 `defaultPrevented`、中文输入法合成态（`isComposing` 或 `keyCode === 229`）时坚决不关闭弹窗，仅在未被消费的裸 Escape 按键时触发关窗。

### 6. 测试契约对齐

- 维持 `role="dialog"`、`aria-modal` 与 `accessibilityLabel` 无障碍契约；测试套件统一通过 `findDialog(renderer.root)` 进行弹窗断言，对齐 `test/agent-dispatch.test.mjs` 中的私有查询 helper，消除对特定底层类型命名的脆弱依赖。

### 7. 自研 Select 原子组件、浮层 Portal 与防闪退遮罩

- 彻底替换宿主原生 `SettingsSelect`，自研源码级 `Select` 原子组件，采用符合 Paseo 规范的紧凑胶囊 Trigger（32px 高度、圆角 6、细边框与 `surface2` 实心底色），支持向左对齐与撑满两种布局。
- 突破滚动容器裁剪与层叠上下文遮挡：浮层通过 `WebSelectPortal` 挂载至 `document.body`（`zIndex: 100`），彻底摆脱外层 `ScrollView` 的 `overflow: hidden` 与兄弟表单字段的层叠上下文遮挡。
- 视口坐标测量与智能翻转：通过多级兼容的 `findDOMNode` 获取 Trigger 视口矩形（`getBoundingClientRect`），当视口下方剩余可用空间小于 220px 时自动向上翻转展开。
- 透明 Backdrop 遮罩与防闪退机制：摒弃脆弱的全局 `document` 捕获阶段 `pointerdown` / `scroll` 监听，改为在 Portal 容器内渲染全屏透明遮罩层（`zIndex: 100`），浮层置于其上（`zIndex: 101`）；外部点击直接命中透明遮罩触发平稳收起，彻底杜绝输入聚焦或微小滚动触发的瞬退缺陷；保留键盘 `Escape` 事件消费关闭。
- 引入按需搜索过滤：短列表（< 10 项）保持极简清爽无搜索栏；长列表（≥ 10 项）自动在下拉框顶部提供实时输入过滤框。
- 全站（看板顶部项目筛选、任务详情、Agent 派发、GitHub 导入）全量收敛至 `Select` 原子组件，彻底删除遗留的 `useProjectFilterLayout` 全局 CSS 注入 Hack。

### 8. 桌面端交互反馈与微原子规范 (Button / Badge / Checkbox)

- **按钮悬停与微触感反馈**：统一 `<Button>` 支持桌面端 `hovered`（次要按钮高亮至 `surface2`，主要按钮轻度提亮）与 `pressed`（触感微缩放 `transform: [{ scale: 0.98 }]`）；彻底移除 `focused` 判定与外层 Focus Ring 轮廓，全量替换看板顶栏、泳道操作、卡片派发与弹窗内散落的裸写 `Pressable`。
- **微型徽标 `<Badge>`**：沉淀统一的 40 行轻量纯函数徽标，支持 `default`、`secondary`、`outline`，全量收敛全局统计徽标、泳道卡片计数、卡片项目归属与子步骤进度标签，杜绝手写内边距与圆角。
- **复选框 `<Checkbox>`**：沉淀轻量受控勾选框，支持 `boolean` 与 `"mixed"` 状态，内置标准 `accessibilityRole="checkbox"`，统一看板卡片完成指示器（淘汰私有 `CompletionIndicator`）、任务子步骤勾选与 GitHub Issue 列表选择。
- **上游标准能力复用**：废弃手写 URL 跳转与私有 Hover 监听，全面改用 Paseo SDK 官方 `@getpaseo/plugin/client/ui` 的 `<ExternalLink>`。

## 备选方案

1. **引入完整 React Native 第三方组件库（如 Paper / NativeBase）**：因体积庞大、依赖特定 Babel/PostCSS 构建管道且容易破坏宿主 z-index 夹层协议而被否决。
2. **任务详情保留底栏内联展开确认**：虽然避免了双层弹窗，但造成系统内删除确认交互规则割裂，心智模型不一致，故否决。
3. **通过容器全局状态守卫（isInlineEditing）拦截 Esc**：强行将子页面临时内部状态耦合至顶层容器，增加了容器抽象泄漏，劣于标准的 DOM/React 事件分层阻止冒泡机制。
4. **维护移动/窄屏双模回退（退回宿主 Modal）**：当前阶段明确不支持移动端窄屏，强行维护双模分支增加了不必要的平台判断与宿主 Modal 历史包袱，故否决。
5. **Select 下拉浮层使用局部绝对定位或 document 全局捕获监听**：局部定位容易被父级 `ScrollView` 裁剪及兄弟组件层叠上下文遮挡；全局捕获 `pointerdown` / `scroll` 监听则极易因微时序与输入法/焦点转移误判导致浮层闪退。故确立基于 `document.body` 的 `WebSelectPortal` 配合全屏透明 `Backdrop` 遮罩的稳健架构。

## 影响

- 彻底消除键盘误关弹窗与首焦点倒挂等高危体验缺陷。
- 全看板从按钮微反馈到弹窗骨架拥有单一、自洽且无外层套框干扰的视觉与交互语言。
- 为后续“新建任务主按钮”与“Agent 派发卡片状态感知”等新特性提供健壮的 UI 资产。
