# 编码规范

## 1. 组件与样式规范

### 1.1 源码级原子组件

- 基础 UI 控件统一收敛并维护在 `client/components/ui/`（`Button`、`Input`、`Dialog`、`ConfirmDialog`、`Badge`、`Checkbox`、`Select`），禁止在业务页面与弹窗中随意手写裸 `Pressable`、裸 `TextInput` 或手写拼凑徽标与复选框。
- 优先复用 Paseo 宿主官方 SDK 提供的优质高内聚能力（如 `@getpaseo/plugin/client/ui` 中的 `<ExternalLink>`），杜绝在插件内重复造轮子。

### 1.2 动态主题驱动

- 严禁硬编码静态颜色（如写死 `#3b82f6`、`#ffffff`、`rgba(...)` 等魔数），所有前景色、背景色、边框色与高亮色必须纯粹由宿主动态注入的 `theme.colors`（如 `colors.surface1`、`colors.surface2`、`colors.border`、`colors.accent`、`colors.foreground` 等）驱动，以无缝兼容日间、夜间及第三方自定义主题。

### 1.3 桌面端全状态矩阵

- 交互型控件（尤其是 `Button` 和 `Select` Trigger）必须完整支持桌面端交互矩阵：
  - `hovered`：鼠标悬停平滑提亮或着色反馈；
  - `focused`：键盘 Tab 导航时呈现清晰的 Focus Ring 聚焦环高亮（`colors.accent`）；
  - `pressed`：按压时提供触感微缩放（`transform: [{ scale: 0.98 }]`）。

### 1.4 样式组织

组件样式统一定义在文件底部的 `StyleSheet.create` 或 `create*Styles(theme)` 中，严禁在 JSX 中书写内联样式对象；浏览器专属 DOM 与 Portal 容器能力统一封装在 `client/platform/web.ts`。

## 2. 国际化 (i18n)

所有用户可见文本（界面文案、占位符、校验错误、Toast 通知与 `accessibilityLabel`）统一在 `client/platform/i18n.tsx` 的中英字典（`zh` / `en`）中定义，打开页面时按宿主与系统语言解析（见 [ADR-0003](./adr/0003-internationalization-and-locale-adaptation.md)）。

## 3. 操作反馈与并发保护

- 操作结果统一通过宿主 `useToast` 在结果确认后通知：操作成功触发成功 Toast，持久化、剪贴板或外部调用失败触发错误 Toast。
- 表单输入校验错误就地显示在弹窗内；看板与泳道保存携带 `expectedRevision`（CAS），发生冲突或保存失败时保留用户草稿、展示持续错误并提供恢复入口。
