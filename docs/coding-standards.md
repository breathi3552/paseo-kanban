# 编码规范

## 1. 组件复用与样式规范

### 1.1 UI 阶梯复用原则（严禁业务层手搓）

插件内所有 UI 界面与弹窗严格遵守两层复用机制，彻底杜绝在业务代码中手搓底层裸控件：

1. **宿主能力优先（Paseo SDK）**：
   - 优先复用 Paseo 宿主官方 SDK 提供的标准组件与 Hooks（如 `@getpaseo/plugin/client/ui` 导出的 `<ExternalLink>`、`Icon`，以及 `useToast`、`useTheme` 等）；
   - 充分继承上游经安全审计的能力，杜绝在插件内重复造轮子。
2. **源码级原子组件收敛（`client/components/ui/`）**：
   - 宿主未直接提供或需适配看板规范的基础控件，必须统一收敛在 `client/components/ui/` 目录下（包括：`Button`、`Input`、`Dialog`、`ConfirmDialog`、`Badge`、`Checkbox`、`Select`）；
   - 任何新增的通用控件必须在原子层沉淀为纯净受控组件，供全站统一聚合导出消费。
3. **严禁在业务代码中裸写原生控件**：
   - 严禁在看板视图、泳道、卡片或 5 个业务弹窗中直接使用裸 `<Pressable>` 充当操作按钮，必须统一使用 `<Button>`；
   - 严禁直接使用裸 `<TextInput>`，表单输入必须统一使用 `<Input>`，以保证内置的 Escape 防穿透与 IME 输入法保护生效；
   - 严禁就地使用 `View + Text + borderRadius` 手写拼凑临时标签（统一使用 `<Badge>`）；
   - 严禁使用自定义图标切换模拟复选框（统一使用 `<Checkbox>`）；
   - 严禁手写私有下拉浮层或直接拼装菜单（统一使用 `<Select>`）。

### 1.2 动态主题驱动

- 严禁硬编码静态颜色（如写死 `#3b82f6`、`#ffffff`、`rgba(...)` 等魔数），所有前景色、背景色、边框色与高亮色必须纯粹由宿主动态注入的 `theme.colors`（如 `colors.surface1`、`colors.surface2`、`colors.border`、`colors.accent`、`colors.foreground` 等）驱动，以无缝兼容日间、夜间及第三方自定义主题。

### 1.3 桌面端交互反馈矩阵

- 交互型控件（尤其是 `Button` 和 `Select` Trigger）统一支持桌面端微交互反馈：
  - `hovered`：鼠标悬停平滑提亮或着色反馈；
  - `pressed`：按压时提供触感微缩放（`transform: [{ scale: 0.98 }]`）。
- 明确全看板不支持 Tab 键切换焦点，原子组件内部不维护 `focused` 状态，严禁引入外层 Focus Ring 轮廓。

### 1.4 样式组织

组件样式统一定义在文件底部的 `StyleSheet.create` 或 `create*Styles(theme)` 中，严禁在 JSX 中书写内联样式对象；浏览器专属 DOM 与 Portal 容器能力统一封装在 `client/platform/web.ts`。

## 2. 国际化 (i18n)

所有用户可见文本（界面文案、占位符、校验错误、Toast 通知与 `accessibilityLabel`）统一在 `client/platform/i18n.tsx` 的中英字典（`zh` / `en`）中定义，打开页面时按宿主与系统语言解析（见 [ADR-0003](./adr/0003-internationalization-and-locale-adaptation.md)）。

## 3. 操作反馈与并发保护

- 操作结果统一通过宿主 `useToast` 在结果确认后通知：操作成功触发成功 Toast，持久化、剪贴板或外部调用失败触发错误 Toast。
- 表单输入校验错误就地显示在弹窗内；看板与泳道保存携带 `expectedRevision`（CAS），发生冲突或保存失败时保留用户草稿、展示持续错误并提供恢复入口。
