import test from "node:test";
import assert from "node:assert/strict";
import {
  React,
  TestRenderer,
  act,
  loadClientModule,
  mockReactNative,
} from "./helpers/react-host-env.mjs";
import { board, task } from "./helpers/completion-fixtures.mjs";

const props = {
  host: { id: "host", label: "Test" },
  layout: { compact: false, platform: "web" },
  theme: {
    colors: {
      foreground: "#eee",
      foregroundMuted: "#aaa",
      surface0: "#111",
      surface1: "#222",
      surface2: "#333",
      border: "#444",
      accent: "#08f",
      accentForeground: "#fff",
      statusDanger: "#f00",
      statusWarning: "#ff0",
    },
  },
};
const text = (node) =>
  node.children.filter((c) => typeof c === "string").join("");

function createHost(initialTasks, { language = "en" } = {}) {
  let values = board(initialTasks);
  let revision = 1;
  let snapshot = { status: "ready", values, revision: "1" };
  let mode = "ok";
  let resolvePending;
  const listeners = new Set();
  const writes = [];
  const paseo = {
    projects: {
      list: async () => ({
        projects: [{ projectId: "p", projectDisplayName: "Project P" }],
      }),
      subscribe: () => () => {},
    },
  };
  function Modal(p) {
    return p.open ? React.createElement("Modal", p, p.children) : null;
  }
  Modal.Content = "ModalContent";
  const { KanbanBoardView } = loadClientModule("kanban-board", {
    "@getpaseo/plugin/client": {
      usePaseo: () => paseo,
      useSettings: (contract) => {
        const current = React.useSyncExternalStore(
          (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          () => snapshot,
        );
        return {
          ...current,
          save: async (next, expectedRevision) => {
            writes.push({ next, expectedRevision });
            if (mode === "throw") throw new Error("offline");
            if (mode === "conflict") return false;
            if (mode === "pending")
              await new Promise((resolve) => {
                resolvePending = resolve;
              });
            if (expectedRevision !== String(revision)) return false;
            values = contract.schema.parse(next);
            snapshot = {
              status: "ready",
              values,
              revision: String(++revision),
            };
            listeners.forEach((listener) => listener());
            return true;
          },
        };
      },
    },
    "@getpaseo/plugin/client/react-native": {
      Modal,
      TextInput: "TextInput",
      Icon: "Icon",
      ScrollView: mockReactNative.ScrollView,
    },
  });
  return {
    get values() {
      return values;
    },
    get mode() {
      return mode;
    },
    set mode(next) {
      mode = next;
    },
    writes,
    resolve: () => resolvePending?.(),
    open: (initialProjectId) =>
      React.createElement(KanbanBoardView, {
        ...props,
        language,
        initialProjectId,
      }),
  };
}

async function mount(t, host, initialProjectId) {
  let panel;
  await act(async () => {
    panel = TestRenderer.create(host.open(initialProjectId));
  });
  t.after(async () => {
    host.resolve();
    await act(async () => panel.unmount());
  });
  return panel;
}

function lane(root, id) {
  return root.findAll(
    (node) => node.props.lane?.id === id && Array.isArray(node.props.tasks),
  )[0];
}
function titles(root, id) {
  return lane(root, id)
    .findAllByType("Text")
    .map(text)
    .filter((value) => value.startsWith("Task "));
}
function card(root, id) {
  return root.findAll(
    (node) => node.props.task?.id === id && node.props.binding,
  )[0];
}
function checkbox(root, id) {
  const control = card(root, id)
    ?.findAllByType("Pressable")
    .find((node) => node.props.accessibilityRole === "checkbox");
  assert.ok(control, `task ${id} has a completion checkbox`);
  return control;
}
async function press(root, label) {
  const button = root
    .findAllByType("Pressable")
    .find((node) =>
      node.findAllByType("Text").some((child) => text(child) === label),
    );
  assert.ok(button, `button ${label} exists`);
  await act(async () => {
    await button.props.onPress();
  });
}
async function toggle(root, id) {
  await act(async () => {
    checkbox(root, id).props.onPress({ stopPropagation() {} });
  });
}
function layOut(root) {
  root
    .findAllByType("ScrollView")
    .find(
      (node) =>
        node.props.horizontal && typeof node.props.onLayout === "function",
    )
    .props.onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width: 940, height: 600 } },
    });
  for (const [index, id] of ["todo", "review", "done"].entries()) {
    const column = lane(root, id);
    column.findAllByType("View")[0].props.onLayout({
      nativeEvent: {
        layout: { x: index * 320, y: 0, width: 300, height: 600 },
      },
    });
    column.findAllByType("ScrollView")[0].props.onLayout({
      nativeEvent: { layout: { x: 0, y: 40, width: 280, height: 550 } },
    });
    column
      .findAll((node) => node.props.task && node.props.binding)
      .forEach((node, i) => {
        node
          .findAllByType("View")
          .find((view) => view.props.onLayout)
          .props.onLayout({
            nativeEvent: {
              layout: { x: 0, y: i * 100, width: 280, height: 60 },
            },
          });
      });
  }
}
function handle(root, id) {
  return card(root, id)
    .findAllByType("View")
    .find((node) => node.props.accessibilityRole === "button");
}

test("completion UI: left checkbox has independent responder ancestry and does not open details", async (t) => {
  const host = createHost([task("a")]);
  const panel = await mount(t, host);
  const control = checkbox(panel.root, "a");
  assert.equal(control.props.accessibilityState.checked, false);
  assert.ok(control.props.accessibilityLabel);
  let ancestor = control.parent;
  while (ancestor && ancestor !== card(panel.root, "a")) {
    assert.equal(
      ancestor.props.onPanResponderGrant,
      undefined,
      "checkbox must not be inside card drag responder",
    );
    ancestor = ancestor.parent;
  }
  const row = control.parent;
  assert.equal(
    row.children
      .find((child) => typeof child === "object")
      .findAllByType("Pressable")[0],
    control,
    "checkbox is the leftmost card control",
  );
  let stopped = false;
  await act(async () => {
    control.props.onPress({
      stopPropagation() {
        stopped = true;
      },
    });
  });
  assert.equal(stopped, true);
  assert.equal(panel.root.findAllByType("Modal").length, 0);
  assert.equal(host.values.tasks[0].completed, true);
  assert.equal(host.values.tasks[0].laneId, "todo");
});

test("completion UI: completion sorting, shared entry updates and checkbox reopen survive remount", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 2000 });
  const host = createHost([
    task("a"),
    task("b"),
    task("old", "review", { completed: true, completedAt: 1000 }),
  ]);
  const panel = await mount(t, host);
  const other = await mount(t, host);
  await toggle(panel.root, "a");
  assert.deepEqual(titles(panel.root, "todo"), ["Task b"]);
  assert.deepEqual(titles(other.root, "done"), ["Task a", "Task old"]);
  assert.equal(
    checkbox(other.root, "a").props.accessibilityState.checked,
    true,
  );
  await toggle(other.root, "a");
  assert.deepEqual(titles(panel.root, "todo"), ["Task b", "Task a"]);
  t.mock.timers.setTime(3000);
  await toggle(panel.root, "a");
  assert.equal(
    host.values.tasks.find((item) => item.id === "a").completedAt,
    3000,
  );
  const reopened = await mount(t, host);
  assert.deepEqual(titles(reopened.root, "done"), ["Task a", "Task old"]);
});

test("completion UI: project filtering applies to both completion view and ordinary lanes", async (t) => {
  const host = createHost([
    task("a", "todo", { projectId: "p" }),
    task("hidden", "todo", {
      projectId: "other",
      completed: true,
      completedAt: 3000,
    }),
    task("old", "review", {
      projectId: "p",
      completed: true,
      completedAt: 1000,
    }),
  ]);
  const panel = await mount(t, host, "p");
  assert.deepEqual(titles(panel.root, "done"), ["Task old"]);
  await toggle(panel.root, "a");
  assert.deepEqual(titles(panel.root, "todo"), []);
  assert.deepEqual(titles(panel.root, "done"), ["Task a", "Task old"]);
  assert.equal(
    host.values.tasks.find((item) => item.id === "hidden").completedAt,
    3000,
  );
});

test("completion UI: completion lane has no add control, cannot delete and can rename", async (t) => {
  const host = createHost([]);
  const panel = await mount(t, host);
  assert.equal(
    lane(panel.root, "done")
      .findAllByType("Pressable")
      .some((node) =>
        node.findAllByType("Text").some((child) => text(child) === "+ Add"),
      ),
    false,
  );
  await press(lane(panel.root, "done"), "Manage");
  const modal = panel.root.findByType("Modal");
  assert.equal(
    modal
      .findAllByType("Pressable")
      .some((node) =>
        node
          .findAllByType("Text")
          .some((child) => /Delete Lane/.test(text(child))),
      ),
    false,
  );
  assert.ok(
    modal
      .findAllByType("Text")
      .some((node) => /completion lane/i.test(text(node))),
    "explains why this lane cannot be deleted",
  );
  await act(async () =>
    modal.findByType("TextInput").props.onChangeText("Shipped"),
  );
  await press(modal, "Save Changes");
  assert.equal(host.values.lanes.at(-1).title, "Shipped");
  assert.equal(host.values.lanes.at(-1).isCompletionLane, true);
});

test("completion UI: create and edit options exclude completion; completed detail ownership edits retain time", async (t) => {
  const host = createHost([
    task("a", "todo", { completed: true, completedAt: 1000 }),
  ]);
  const panel = await mount(t, host);
  await press(panel.root, "+ New Task");
  let modal = panel.root.findByType("Modal");
  assert.equal(
    modal
      .findAllByType("Pressable")
      .some((node) =>
        node.findAllByType("Text").some((child) => text(child) === "Finished"),
      ),
    false,
  );
  await press(modal, "Cancel");
  const body = card(panel.root, "a")
    .findAllByType("View")
    .find((node) => node.props.onPanResponderGrant);
  await act(async () => {
    body.props.onPanResponderGrant({ nativeEvent: {} }, { x0: 700, y0: 60 });
    await body.props.onPanResponderRelease();
  });
  modal = panel.root.findByType("Modal");
  assert.equal(
    modal
      .findAllByType("Pressable")
      .some((node) =>
        node.findAllByType("Text").some((child) => text(child) === "Finished"),
      ),
    false,
  );
  await press(modal, "Review");
  await press(modal, "Save Changes");
  const updated = host.values.tasks[0];
  assert.equal(updated.laneId, "review");
  assert.equal(updated.completed, true);
  assert.equal(updated.completedAt, 1000);
  assert.deepEqual(titles(panel.root, "done"), ["Task a"]);
  await toggle(panel.root, "a");
  assert.deepEqual(titles(panel.root, "review"), ["Task a"]);
});

test("completion UI: pending save disables repeated toggles including a stale callback", async (t) => {
  const host = createHost([task("a")]);
  host.mode = "pending";
  const panel = await mount(t, host);
  const control = checkbox(panel.root, "a");
  await act(async () => {
    control.props.onPress({ stopPropagation() {} });
  });
  assert.equal(checkbox(panel.root, "a").props.disabled, true);
  await act(async () => {
    control.props.onPress({ stopPropagation() {} });
  });
  assert.equal(host.writes.length, 1);
  await act(async () => host.resolve());
  assert.equal(host.values.tasks[0].completed, true);
  assert.equal(checkbox(panel.root, "a").props.disabled, false);
});

test("completion UI: failed/conflicting writes retain unchecked state and allow retry with visible errors", async (t) => {
  for (const mode of ["conflict", "throw"]) {
    const host = createHost([task("a")]);
    host.mode = mode;
    const panel = await mount(t, host);
    await toggle(panel.root, "a");
    assert.equal(host.values.tasks[0].completed, false);
    assert.equal(
      checkbox(panel.root, "a").props.accessibilityState.checked,
      false,
    );
    assert.ok(
      panel.root
        .findAllByType("Text")
        .some((node) => /Save failed/i.test(text(node))),
    );
    host.mode = "ok";
    await toggle(panel.root, "a");
    assert.equal(host.values.tasks[0].completed, true);
  }
});

test("completion UI: Chinese checkbox labels and protected lane message are translated", async (t) => {
  const host = createHost([task("a")], { language: "zh" });
  const panel = await mount(t, host);
  assert.match(checkbox(panel.root, "a").props.accessibilityLabel, /完成/);
  await press(lane(panel.root, "done"), "管理");
  assert.ok(
    panel.root
      .findByType("Modal")
      .findAllByType("Text")
      .some((node) => /完成泳道/.test(text(node))),
  );
});

test("completion UI: active drag locks checkbox and cannot cause a concurrent completion write", async (t) => {
  const host = createHost([task("a")]);
  const panel = await mount(t, host);
  const stale = checkbox(panel.root, "a");
  await act(async () => {
    layOut(panel.root);
    handle(panel.root, "a").props.onPanResponderGrant(
      { nativeEvent: {} },
      { x0: 50, y0: 60 },
    );
  });
  assert.equal(checkbox(panel.root, "a").props.disabled, true);
  await act(async () => {
    stale.props.onPress({ stopPropagation() {} });
  });
  assert.equal(host.writes.length, 0);
  await act(async () =>
    handle(panel.root, "a").props.onPanResponderTerminate(),
  );
});

test("completion UI: real board drag in preserves owner and drag out reopens at actual target slot", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 2000 });
  const host = createHost([
    task("a"),
    task("b", "review"),
    task("c", "review"),
    task("old", "review", { completed: true, completedAt: 1000 }),
  ]);
  const panel = await mount(t, host);
  assert.deepEqual(titles(panel.root, "done"), ["Task old"]);
  await act(async () => {
    layOut(panel.root);
    handle(panel.root, "a").props.onPanResponderGrant(
      { nativeEvent: {} },
      { x0: 50, y0: 60 },
    );
  });
  await act(async () => {
    handle(panel.root, "a").props.onPanResponderMove(
      { nativeEvent: {} },
      { moveX: 700, moveY: 350 },
    );
  });
  await act(async () => {
    await handle(panel.root, "a").props.onPanResponderRelease();
  });
  assert.deepEqual(titles(panel.root, "done"), ["Task a", "Task old"]);
  assert.equal(
    host.values.tasks.find((item) => item.id === "a").laneId,
    "todo",
  );
  await act(async () => {
    t.mock.timers.tick(60);
    layOut(panel.root);
  });
  await act(async () => {
    handle(panel.root, "a").props.onPanResponderGrant(
      { nativeEvent: {} },
      { x0: 700, y0: 60 },
    );
  });
  await act(async () => {
    handle(panel.root, "a").props.onPanResponderMove(
      { nativeEvent: {} },
      { moveX: 400, moveY: 170 },
    );
  });
  await act(async () => {
    await handle(panel.root, "a").props.onPanResponderRelease();
  });
  assert.deepEqual(titles(panel.root, "review"), [
    "Task b",
    "Task a",
    "Task c",
  ]);
  assert.equal(
    host.values.tasks.find((item) => item.id === "a").completed,
    false,
  );
  assert.equal(
    host.values.tasks.find((item) => item.id === "a").completedAt,
    null,
  );
});
