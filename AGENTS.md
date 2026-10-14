# Agent Guidelines

## Agent skills

### Issue tracker

本仓库的任务与规范使用 GitHub Issues 管理，通过 `gh` CLI 操作。详见 `docs/agents/issue-tracker.md`。

### Triage labels

采用标准五角色分诊标签体系（`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`）。详见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文（Single-context）结构，根目录下维护 `GLOSSARY.md` 与 `docs/adr/`。详见 `docs/agents/domain.md`。

### Coding standards

新增或修改操作反馈时，阅读并遵循 `docs/coding-standards.md`。

### Development & verification

本地开发环境要求、`npm run check` 统一质量护栏及宿主验收流程详见 `docs/development.md`。
