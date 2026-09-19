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

- **Paseo**: `>= 0.8.0`
- **Node.js**: `>= 20.0.0` (recommended for development)

---

## Installation & Usage

### Quick Install (Recommended)

No manual build or git cloning needed. You can install directly via npm or GitHub:

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
```

### Run Tests

Runs unit tests for board domain logic, subtask mutations, and drag hit-testing:

```bash
npm test
```

### Type Checking

Validates TypeScript types across client and server entry points:

```bash
npm run typecheck
```

---

## Architecture & Design

The complete architectural breakdown and interactive visual diagram are archived in the repository:

- **Interactive Architecture Viewer**: Open [`docs/architecture/paseo-kanban.architecture.html`](./docs/architecture/paseo-kanban.architecture.html) in your browser.
- **Architecture Schema & Model**: [`docs/architecture/paseo-kanban.architecture.json`](./docs/architecture/paseo-kanban.architecture.json).

---

## License

MIT
