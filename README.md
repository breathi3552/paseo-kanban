# Paseo Kanban

[简体中文](./README.zh-CN.md)

A lightweight, responsive Kanban board plugin for [Paseo](https://paseo.sh) workspaces.

![Paseo Kanban Board](./assets/marketplace/board-0.1.3.png)

---

## Highlights

- **Swimlane Management**: Manage lanes in one horizontal dialog. Add, rename, and delete immediately; preview ordering with left/right controls or dragging, then save the order. Deleting a lane with unfinished tasks requires confirmation and removes those tasks across all projects; completed tasks are kept.
- **Task Context Menu**: Right-click a card to edit, move, complete, copy its full prompt, open its source Issue, or delete with confirmation. Left-click no longer opens details; drag anywhere except the checkbox and Send to Agent button.
- **Drag-and-Drop Interaction**: Fluid intra-lane reordering and cross-lane movement with animated drop-slot displacement, viewport edge auto-scrolling, and smooth drop-in feedback.
- **Send to Agent**: Send a card's title, description, steps, and source to a new Agent using a host preset. Choose an existing workspace, a new regular workspace, or a new worktree; execution stays independent of board status.
- **GitHub Issue Import**: One-way import of open issues from the project repository's GitHub origin into a chosen lane, featuring pagination, repository-wide creation-time sorting, automatic deduplication, and source links.

---

## Other Features

- **Rich Task Cards**:
  - Task title and multi-line description editing (with resizable description area).
  - Subtask checklists with live completion progress tracking.
  - Link tasks to projects created in Paseo using native dropdown selection.
- **Task Completion & Restoration**: Check a card or drag it into the completion lane to finish; uncheck or drag out to restore cards to their original ordinary swimlane.
- **Workspace Tabs and Splits**: Open the board beside an agent or terminal with Paseo's native split controls, initially filtered to the workspace's project, or use the sidebar entry.
- **Independent Project Filtering**: Filter cards by specific Paseo projects using native select dropdowns or view unassigned tasks without isolating the shared underlying board data.
- **Host Storage & Concurrency Protection**: Board data is safely stored in host-scoped plugin settings with optimistic revision checks (CAS) to prevent silent overwrites and preserve form drafts.

---

## Screenshots

### Board Overview

![Board Overview](./assets/marketplace/board-0.1.3.png)

### Task Details & Subtasks Checklist

![Task Editor](./assets/marketplace/task-editor-0.1.3.png)

### Workspace Tabs & Split Controls

![Workspace Split](./assets/marketplace/workspace-split-0.1.3.png)

---

## Requirements

- **Paseo host**: `>= 0.11.4` (declared in `paseo-plugin.json`). The host runs the plugin.
- **GitHub import (optional)**: Install Git and GitHub CLI (`gh`) on the daemon machine, sign in with `gh auth login`, and configure the project repository’s `origin` on GitHub.com. Both public and authorized private repositories are supported.
- **Development and CI**: Node.js 24 (pinned in `.nvmrc` and `.node-version`) for checks, TypeScript stripping, and native tests.

---

## Installation

### Quick Install (Recommended)

Install directly from npm or GitHub:

**Via NPM (Release package):**

```bash
paseo plugin install npm:paseo-kanban
```

**Via GitHub:**

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

### Local Development

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

## Development & Testing

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

## Architecture & Design

Core terminology and design decisions are documented in [`GLOSSARY.md`](./GLOSSARY.md) and [`docs/adr/`](./docs/adr/).

---

## License

MIT
