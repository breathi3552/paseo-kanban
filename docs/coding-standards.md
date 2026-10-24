# 编码规范

## 1. 组件与样式

组件样式统一定义在文件底部的 `StyleSheet.create` 或 `create*Styles(theme)` 中；浏览器专属 DOM 与 Portal 能力统一封装在 `client/platform/web.ts`。

## 2. 国际化 (i18n)

所有用户可见文本（界面文案、占位符、校验错误、Toast 通知与 `accessibilityLabel`）统一在 `client/platform/i18n.tsx` 的中英字典（`zh` / `en`）中定义，打开页面时按宿主与系统语言解析（见 [ADR-0003](./adr/0003-internationalization-and-locale-adaptation.md)）。

## 3. 操作反馈与并发保护

- 操作结果统一通过宿主 `useToast` 在结果确认后通知：操作成功触发成功 Toast，持久化、剪贴板或外部调用失败触发错误 Toast。
- 表单输入校验错误就地显示在弹窗内；看板与泳道保存携带 `expectedRevision`（CAS），发生冲突或保存失败时保留用户草稿、展示持续错误并提供恢复入口。
