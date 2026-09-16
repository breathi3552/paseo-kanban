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

## Quick Start / Installation

### Load as a Local Plugin in Paseo

You can link this repository directly into your local Paseo instance:

```bash
# Link this directory as a local plugin
paseo plugin link .

# Or specify by absolute path
paseo plugin link /path/to/paseo-kanban
```

Once linked, open Paseo. You will see the **Kanban** item in the sidebar (icon: `PanelsTopLeft`). Click it to open the board surface.

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
