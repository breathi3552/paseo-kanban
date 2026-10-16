# Paseo Kanban

[简体中文](./README.zh-CN.md)

A lightweight, responsive Kanban board plugin for [Paseo](https://paseo.sh) workspaces.

---

## Features

- **Flexible Swimlanes**: Add, delete, and rename lanes.
- **Rich Task Cards**:
  - Task title and multi-line description editing.
  - Subtasks checklist.
  - Support linking tasks to projects created in Paseo.
- **Workspace Tabs and Splits**: Open the board beside an agent or terminal, initially filtered to the workspace's project, or use the sidebar entry.
- **Smooth Drag-and-Drop**: Support intra-lane reordering and cross-lane movement.

---

## Requirements

- **Paseo host**: `>= 0.8.0` (declared in `paseo-plugin.json`). The host runs the plugin.
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

Individual commands (`npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:package`) are defined in [`package.json`](./package.json). For tag-based publishing, release sources of truth, recovery, and host acceptance, see the [development guide](./docs/development.md#21-标签发布github-actions).

---

## Releases

See the [0.1.4 release notes](./docs/releases/0.1.4.md). Each release's npm package and GitHub Release share the same version tag; GitHub includes the verified npm tarball. `main` may contain changes beyond the latest release.

---

## Architecture & Design

Core terminology and design decisions are documented in [`GLOSSARY.md`](./GLOSSARY.md) and [`docs/adr/`](./docs/adr/).

---

## License

MIT
