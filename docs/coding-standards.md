# 编码规范

## 1. 组件复用与样式规范

### 1.1 组件复用规则

业务视图与弹窗禁止直接使用底层的 React Native 原生输入与交互组件。统一按以下规则调用：

1. **Paseo SDK 组件**：优先复用 Paseo 宿主 SDK 导出的标准组件与 Hook（例如 `@getpaseo/plugin/client/ui` 导出的 `<ExternalLink>`、`Icon`，以及 `useToast`、`useTheme`）。
2. **插件基础组件**：SDK 未提供的通用基础控件，统一收敛在 `client/components/ui/` 目录下（包括 `Button`、`Input`、`Dialog`、`ConfirmDialog`、`Badge`、`Checkbox`、`Select`），且必须为受控组件。
3. **原生控件禁用清单**：
   - 禁止在业务视图中使用原生 `<Pressable>` 充当按钮，统一使用 `<Button>`。
   - 禁止直接使用原生 `<TextInput>`，统一使用 `<Input>`（自带 Escape 拦截与输入法保护）。
   - 禁止就地拼凑标签，统一使用 `<Badge>`。
   - 禁止使用自定义图标切换模拟复选框，统一使用 `<Checkbox>`。
   - 禁止手写下拉框浮层或菜单，统一使用 `<Select>`。

### 1.2 动态主题

禁止在样式中硬编码十六进制或 RGB 静态颜色。所有前景色、背景色、边框色与高亮色必须读取宿主注入的 `theme.colors`（例如 `colors.surface1`、`colors.border`、`colors.accent`、`colors.foreground`），以兼容日间、夜间及第三方自定义主题。

### 1.3 桌面端交互反馈

交互型控件（尤其是 `Button` 和 `Select` Trigger）统一支持桌面端交互反馈：

- **鼠标悬停 (hover)**：鼠标悬停时平滑调整背景色或边框色。
- **按压反馈 (press)**：按压时添加微缩放样式（`transform: [{ scale: 0.98 }]`）。
- **键盘焦点 (focus)**：看板不支持 Tab 键切换焦点。组件内部不维护 `focused` 状态，不添加外层 Focus Ring 轮廓。

### 1.4 样式组织

组件样式统一定义在文件底部的 `StyleSheet.create` 或 `create*Styles(theme)` 中，禁止在 JSX 中书写内联样式对象。浏览器专属 DOM 与 Portal 容器能力统一封装在 `client/platform/web.ts` 中。

## 2. 国际化 (i18n)

所有用户可见文本（界面文案、占位符、校验错误、Toast 通知与 `accessibilityLabel`）统一在 `client/platform/i18n.tsx` 的中文字典 `zh` 与英文字典 `en` 中定义。打开页面时按宿主与系统语言解析（见 [ADR-0003](./adr/0003-internationalization-and-locale-adaptation.md)）。

## 3. 操作反馈与并发保护

- 操作结果统一通过宿主 `useToast` 在确认后通知。操作成功触发成功 Toast。持久化、剪贴板或外部调用失败触发错误 Toast。
- 表单输入校验错误就地显示在弹窗内。看板与泳道保存携带 `expectedRevision`（CAS）。发生冲突或保存失败时保留用户草稿，展示持续错误并提供恢复入口。
