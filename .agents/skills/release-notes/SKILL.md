---
name: release-notes
description: Draft concise, emoji-free release notes and CHANGELOG entries. Use when preparing a new release, summarizing version changes, or drafting docs/releases/*.md.
---

# Release notes

Draft release notes focused on user value. Keep prose concise, factual, and free of emojis.

## Principles

1. **User perspective**: Describe visible features, bug fixes, and behavior changes. Exclude internal chores, test updates, refactors, and pipeline mechanics.
2. **No emoji**: Omit all emoji indicators (such as rocket, bug, warning, sparkles icons). Rely on clear headings and structured lists.
3. **No CI or audit logs**: Do not explain release workflows, provenance validation, or package verification in release notes; automated tools append those details during release.
4. **Sentence case & bold subjects**: Begin each bullet with a bolded subject followed by a concise description of the benefit or fix.

## Template

```markdown
# <Project Name> <Version>

### Features

- **<Feature name>**: <What it allows the user to do>.

### Fixes & Improvements

- **<Component or area>**: <What was fixed or improved>.

### Requirements & Breaking Changes

- Requires <Host/Runtime> `<version>`.
- <Migration steps, or specify "(no migration required)">.
```

If the project requires bilingual notes, append a brief Chinese summary at the end without duplicating full sections:

```markdown
### 变更摘要

- <简明概括主要功能与修复，控制在 3-5 行内>。
```

## Checklist

- [ ] All emojis removed.
- [ ] Internal refactors and test maintenance omitted.
- [ ] CI validation narratives omitted.
- [ ] Requirements and compatibility ranges stated clearly.
