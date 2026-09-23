# Paseo Kanban

[简体中文](./README.zh-CN.md)

A lightweight, responsive Kanban board plugin for [Paseo](https://paseo.sh) workspaces. Organize tasks across customizable swimlanes, break them down into subtasks, associate cards with native Paseo projects, and manage workflow status with intuitive drag-and-drop.

---

## Features

- **Flexible Swimlanes**: Three initial lanes that you can rename, with support for adding and deleting custom lanes.
- **Rich Task Cards**:
  - Task title and multi-line description.
  - Subtasks checklist with completion toggles and live progress tracking.
  - Native Paseo project association.
- **Project Filtering**: Instantly filter board cards by linked Paseo project to keep context focused.
- **Smooth Drag-and-Drop**: Real-time hit-testing for reordering cards within lanes and moving cards across lanes.
- **Versioned State Persistence**: Persists board data through Paseo's settings API with optimistic concurrency control (CAS) to prevent race conditions and accidental overwrites.

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

Once active, open Paseo. The **Kanban** icon (`PanelsTopLeft`) will appear in the sidebar. Click it to launch the board.

### Local Development

To contribute or debug locally:

```bash
# 1. Clone repository and install dependencies
git clone https://github.com/breathi3552/paseo-kanban.git
cd paseo-kanban
npm install

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

Individual commands (`npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:package`) are defined in [`package.json`](./package.json). For publishing, recovery, and host acceptance, see the [development guide](./docs/development.md#21-一键发布github-actions).

---

## Architecture & Design

Core terminology and design decisions are documented in [`CONTEXT.md`](./CONTEXT.md) and [`docs/adr/`](./docs/adr/).

---

## License

MIT
