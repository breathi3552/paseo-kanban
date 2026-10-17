---
name: release-notes
description: 撰写简洁、无 emoji 的双语版本发布说明，维护根目录 CHANGELOG.md。
---

# 发布说明 (Release Notes)

为版本发布生成简洁、事实清晰、聚焦用户价值的中英双语发布说明，统一维护于根目录 `CHANGELOG.md`。禁止使用 Emoji。

## 工作流

1. **收集变更**：查看上一版本 tag 到当前的提交与已合并 PR：
   ```bash
   PREV_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
   git log ${PREV_TAG:+$PREV_TAG..}HEAD --oneline
   gh pr list --state merged --limit 15
   ```
2. **提炼与对齐**：
   - 仅保留用户可见的新特性、缺陷修复、交互优化与兼容性变更。
   - 剔除内部重构、测试补充、构建脚本与 CI 流程。
   - 采用 `GLOSSARY.md` 中的统一术语。
3. **追加到 CHANGELOG**：按照模板将英文与中文两份严格对应的发布说明追加到 `CHANGELOG.md` 顶部。

## 模板

```markdown
## [<Version>] - <YYYY-MM-DD>

### Features

- **<Feature name>**: <What users can do and the benefit>.

### Fixes & Improvements

- **<Component or area>**: <What was fixed or improved>.

### Compatibility & Migration

- Requires <Host/Runtime> `<version>`.
- <Migration steps, or "No migration required (fully backward compatible)">.

---

### 新增特性

- **<功能名称>**: <用户可进行的操作与核心价值>。

### 修复与优化

- **<组件或模块>**: <修复的问题或优化效果>。

### 兼容性与迁移

- 依赖 <宿主/运行时> `<版本要求>`。
- <迁移说明，若无则注明“无需手动迁移（完全向后兼容）”>。
```

## 编写准则

- **以用户价值为核心**：描述用户可观察到的行为变化，而非代码实现过程（例：写“卡片支持双向拖拽完成与恢复”，不写“重构了 kanban-lane.tsx 的点击事件”）。
- **中英严格镜像对应**：英文与中文各一份，标题层级、条目顺序及语义完全一一对应。
- **无 Emoji**：严禁在标题、列表或强调文本中使用任何表情符号。
- **加粗主语起首**：列表每项以加粗的模块或功能名开头。
- **空章节直接省略**：纯修复版本（Patch）若无新特性，直接省略 Features / 新增特性章节，不留空占位。
