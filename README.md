# Paseo Kanban

[简体中文](./README.zh-CN.md)

A Kanban board plugin for [Paseo](https://paseo.sh) workspaces.

![Paseo Kanban Board](./assets/marketplace/board-0.1.3.png)

---

## Highlights

- **Swimlane management**: Add, rename, and delete lanes in a horizontal dialog. Reorder lanes using the left and right buttons or drag handles, then save the order. Deleting a lane with unfinished tasks requires confirmation and deletes those tasks across all projects. Completed tasks are kept.
- **Task context menu**: Right-click a card to edit, move, complete, copy the prompt, open the source issue, or delete. Drag a card from anywhere on its surface except the checkbox and the Send to Agent button.
- **Drag and drop**: Reorder cards within a lane or move cards across lanes. Displays animated slot displacement and scrolls automatically near viewport edges.
- **Send to Agent**: Send a card's title, description, steps, and source to a new Agent session using a host preset. Select an existing workspace, a new regular workspace, or a new worktree. Agent execution does not update card status.
- **GitHub issue import**: Import open issues from the project repository's GitHub origin into a selected lane. Includes pagination, repository-wide creation-time sorting, deduplication, and source links.

---

## Other features

- **Task details and subtasks**:
  - Edit task titles and multi-line descriptions with a resizable text box.
  - Track checklist progress with live subtask counters.
  - Link tasks to Paseo projects with compact select menus.
- **Task completion and restoration**: Check a card or drag it into the completion lane to finish. Uncheck or drag out of the completion lane to restore the card to its original ordinary swimlane.
- **Workspace tabs and splits**: Open the board beside an agent or terminal with Paseo's split controls, initially filtered to the workspace project, or open it from the sidebar.
- **Project filtering**: Filter cards by Paseo project or view unassigned tasks. Includes searchable dropdown lists. Filters are independent per window while sharing the underlying board data.
- **Native UI components**: Uses local React components (`Button`, `Input`, `Dialog`, `ConfirmDialog`, `Badge`, `Checkbox`, `Select`) styled with Paseo theme CSS variables, with no third-party UI dependencies.
- **Host storage and concurrency protection**: Stores board data in host-scoped plugin settings. Uses optimistic revision checks (CAS) to prevent silent overwrites and preserve form drafts.

---

## Screenshots

### Board overview

![Board Overview](./assets/marketplace/board-0.1.3.png)

### Task details and subtasks checklist

![Task Editor](./assets/marketplace/task-editor-0.1.3.png)

### Workspace tabs and split controls

![Workspace Split](./assets/marketplace/workspace-split-0.1.3.png)

---

## Requirements

- **Paseo host**: `>= 0.11.4` (declared in `paseo-plugin.json`). The host runs the plugin.
- **GitHub import (optional)**: Install Git and GitHub CLI (`gh`) on the daemon machine, sign in with `gh auth login`, and configure the project repository’s `origin` on GitHub.com. Both public and authorized private repositories are supported.
- **Development and CI**: Node.js 24 (pinned in `.nvmrc` and `.node-version`) for checks, TypeScript stripping, and native tests.

---

## Installation

### Quick install (recommended)

Install using the Paseo CLI:

**From npm:**

```bash
paseo plugin install npm:paseo-kanban
```

**From GitHub:**

```bash
paseo plugin add breathi3552/paseo-kanban
```

To explicitly track the latest updates on the `main` branch:

```bash
paseo plugin add breathi3552/paseo-kanban --ref main
```

Verify that the plugin is running:

```bash
paseo plugin ls
```

Open the board from either entry:

- **Sidebar → Kanban**: shows all tasks by default.
- **Workspace → `+` → Kanban**: initially filters to the workspace's project, with other filters available; use Paseo's native split controls to place it beside an agent or terminal.

### Local development

To contribute or debug locally:

```bash
# 1. Clone repository and install dependencies
git clone https://github.com/breathi3552/paseo-kanban.git
cd paseo-kanban
npm ci

# 2. Link this directory into your local Paseo daemon
paseo plugin link .
```

---

## Development and testing

Install dependencies and run the full quality check:

```bash
npm ci
npm run check
```

Individual commands (`npm test`, `npm run check:portal`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:package`) are defined in [`package.json`](./package.json). For tag-based publishing, release sources of truth, recovery, and host acceptance, see the [development guide](./docs/development.md#3-发布流程).

---

## Releases

See the [CHANGELOG](./CHANGELOG.md). Each release's npm package and GitHub Release share the same version tag; GitHub includes the verified npm tarball. `main` may contain changes beyond the latest release.

---

## Architecture and design

Core terminology and design decisions are documented in [`GLOSSARY.md`](./GLOSSARY.md) and [`docs/adr/`](./docs/adr/).

---

## License

MIT
