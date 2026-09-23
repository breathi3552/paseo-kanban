# Paseo Kanban

[简体中文](./README.zh-CN.md)

A lightweight, responsive Kanban board plugin for [Paseo](https://paseo.sh) workspaces. Organize tasks across customizable swimlanes, break them down into subtasks, associate cards with native Paseo projects, and manage workflow status with intuitive drag-and-drop.

---

## Features

- **Flexible Swimlanes**: Default lanes (`To Plan`, `In Progress`, `Done`) with full support for adding, renaming, and deleting custom lanes.
- **Rich Task Cards**:
  - Task title and multi-line markdown description.
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

### Install Dependencies

```bash
npm install
# or clean install:
npm ci
```

### Unified Quality Guardrails (Check)

Runs typecheck, automated test suites, linting, format verification, and release package checks in sequence:

```bash
npm run check
```

### Individual Quality Tasks

- **Package Verification**: Validates release package contents, entrypoints, and TypeScript AST relative imports:
  ```bash
  npm run check:package
  ```
- **Run Tests**: Cross-platform auto-discovery of all `test/*.test.mjs` suites:
  ```bash
  npm test
  ```
- **Type Checking**: Validates TypeScript types across client and server entry points:
  ```bash
  npm run typecheck
  ```
- **Linting**: Static code analysis with ESLint:
  ```bash
  npm run lint
  ```
- **Formatting**: Check or format code style with Prettier:
  ```bash
  npm run format:check
  npm run format
  ```

Maintainers publish through the **Release to GitHub and npm** GitHub Action by selecting `patch`, `minor`, or `major`. See the [Development & Acceptance Guide](./docs/development.md#24-一键发布github-actions) for setup, recovery, and host acceptance.

---

## Architecture & Design

The complete architectural breakdown and interactive visual diagram are archived in the repository:

- **Interactive Architecture Viewer**: Open [`docs/architecture/paseo-kanban.architecture.html`](./docs/architecture/paseo-kanban.architecture.html) in your browser.
- **Architecture Schema & Model**: [`docs/architecture/paseo-kanban.architecture.json`](./docs/architecture/paseo-kanban.architecture.json).

---

## License

MIT
