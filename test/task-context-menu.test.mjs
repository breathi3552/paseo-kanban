import test from "node:test";
import assert from "node:assert/strict";
import { act } from "./helpers/react-host-env.mjs";
import {
  createHost,
  mount,
  press,
  text,
  chooseProject,
} from "./helpers/kanban-host.mjs";
import { KanbanBoardSchema } from "../shared/kanban.ts";

let language = "en";
globalThis.localStorage = { getItem: () => JSON.stringify({ language }) };
test.beforeEach(() => {
  language = "en";
});
test.after(() => {
  delete globalThis.localStorage;
});
const url = "https://github.com/example/repo/issues/25";
const task = {
  id: "a",
  title: "Task A",
  laneId: "todo",
  projectId: "project-a",
  description: "Keep **Markdown**.",
  source: "github_issue",
  issueNumber: 25,
  externalUrl: url,
  subtasks: [
    { id: "s1", title: "Inspect", completed: false },
    { id: "s2", title: "Verify", completed: true },
  ],
};
function board(changes = {}) {
  return KanbanBoardSchema.parse({
    lanes: [
      { id: "todo", title: "Todo" },
      { id: "doing", title: "Doing" },
      { id: "done", title: "Finished", isCompletionLane: true },
    ],
    tasks: [
      task,
      { id: "b", title: "Task B", laneId: "doing", projectId: "project-b" },
    ],
    ...changes,
  });
}
async function setup(t, options = {}) {
  const host = createHost({
    board: board(),
    navigation: { openAgent() {} },
    ...options,
  });
  return { host, renderer: await mount(t, host) };
}
function card(renderer, title = "Task A") {
  return renderer.root.findByProps({
    accessibilityLabel: `Task actions: ${title}`,
  });
}
function event(nativeEvent = {}, target) {
  return {
    nativeEvent: {
      pointerType: "mouse",
      button: 2,
      clientX: 20,
      clientY: 30,
      ...nativeEvent,
    },
    target,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {},
  };
}
async function open(renderer, title = "Task A") {
  const e = event();
  await act(async () => card(renderer, title).props.onContextMenu(e));
  assert.equal(e.prevented, true, "card suppresses browser context menu");
  return renderer.root.findByProps({ accessibilityRole: "menu" });
}
function menuItems(renderer) {
  return renderer.root
    .findAllByProps({ accessibilityRole: "menuitem" })
    .map((node) => node.props.accessibilityLabel);
}
function texts(renderer) {
  return renderer.root.findAllByType("Text").map(text).join("\n");
}
async function move(renderer, lane) {
  await press(renderer.root, "Move to lane");
  await press(renderer.root, lane);
}

test("right click opens one task menu, switches cards, and hides removed icons", async (t) => {
  const { renderer } = await setup(t);
  assert.equal(
    renderer.root.findAllByProps({ name: "GripVertical" }).length,
    0,
  );
  assert.equal(
    renderer.root.findAllByProps({ name: "ExternalLink" }).length,
    0,
  );
  assert.equal(
    renderer.root.findAllByProps({ accessibilityRole: "checkbox" }).length,
    2,
  );
  await open(renderer);
  assert.deepEqual(menuItems(renderer), [
    "Edit details",
    "Mark as complete",
    "Move to lane",
    "Copy prompt",
    "Open Issue in browser",
    "Delete task",
  ]);
  await open(renderer, "Task B");
  assert.equal(
    renderer.root.findAllByProps({ accessibilityRole: "menu" }).length,
    1,
  );
  assert.equal(menuItems(renderer).includes("Open Issue in browser"), false);
  assert.equal(renderer.root.findAllByType("Modal").length, 0);
});

test("menu edit persists task changes; card mouse click and non-primary buttons do not open details", async (t) => {
  const { host, renderer } = await setup(t);
  const c = card(renderer);
  const initial = structuredClone(host.board);
  for (const button of [0, 1, 2]) {
    const e = event({ button });
    if (button === 0) {
      await act(async () => c.props.onPanResponderGrant(e, { x0: 0, y0: 0 }));
      await act(async () => c.props.onPanResponderRelease());
    } else {
      assert.equal(c.props.onStartShouldSetPanResponder(e), false);
      assert.equal(c.props.onMoveShouldSetPanResponder(e), false);
    }
  }
  assert.equal(renderer.root.findAllByType("Modal").length, 0);
  assert.deepEqual(host.board, initial);
  await open(renderer);
  await press(renderer.root, "Edit details");
  const modal = renderer.root.findByType("Modal");
  await act(async () =>
    modal.findByProps({ value: "Task A" }).props.onChangeText("Edited task"),
  );
  await press(modal, "Save Changes");
  assert.equal(host.board.tasks[0].title, "Edited task");
  assert.deepEqual(host.notifications, ["Task updated"]);
});

test("card controls are excluded from capture, movement and context menu; their own actions remain available", async (t) => {
  const { host, renderer } = await setup(t);
  for (const label of ["Mark Task A complete", "Send to Agent"]) {
    const c = card(renderer);
    const control = renderer.root
      .findAllByType("Pressable")
      .find((n) => n.props.accessibilityLabel === label);
    assert.ok(control, label);
    const target = { closest: () => ({}) };
    for (const button of [0, 2]) {
      const e = event({ button }, target);
      await act(async () => {
        assert.equal(c.props.onStartShouldSetPanResponderCapture(e), false);
        assert.equal(c.props.onStartShouldSetPanResponder(e), false);
        assert.equal(c.props.onMoveShouldSetPanResponder(e), false);
        c.props.onContextMenu(e);
      });
      assert.equal(e.prevented, false);
      assert.equal(
        renderer.root.findAllByProps({ accessibilityRole: "menu" }).length,
        0,
      );
    }
  }
  await press(renderer.root, "Mark Task A complete");
  assert.equal(host.board.tasks[0].completed, true);
  assert.deepEqual(host.notifications, []);
});

test("menu moves append under filtering without disturbing hidden tasks, and completion transitions preserve ordinary ownership", async (t) => {
  const { host, renderer } = await setup(t, {
    board: board({
      tasks: [
        task,
        {
          id: "hidden",
          title: "Hidden",
          laneId: "doing",
          projectId: "project-b",
        },
        {
          id: "visible",
          title: "Visible",
          laneId: "doing",
          projectId: "project-a",
        },
        {
          id: "after",
          title: "After",
          laneId: "doing",
          projectId: "project-b",
        },
      ],
    }),
  });
  await chooseProject(renderer.root, "Project A");
  await open(renderer);
  await press(renderer.root, "Move to lane");
  assert.equal(menuItems(renderer).includes("Todo"), false);
  await press(renderer.root, "Doing");
  assert.deepEqual(
    host.board.tasks.map((t) => t.id),
    ["hidden", "visible", "a", "after"],
  );
  await open(renderer);
  await move(renderer, "Finished");
  assert.equal(host.board.tasks.find((t) => t.id === "a").completed, true);
  assert.equal(host.board.tasks.find((t) => t.id === "a").laneId, "doing");
  await open(renderer);
  assert.ok(menuItems(renderer).includes("Mark as incomplete"));
  await move(renderer, "Todo");
  assert.equal(host.board.tasks.find((t) => t.id === "a").completed, false);
  assert.equal(host.board.tasks.find((t) => t.id === "a").laneId, "todo");
  assert.deepEqual(host.notifications, []);
});

test("menu complete and reopen share checkbox restoration including a deleted original lane", async (t) => {
  const { host, renderer } = await setup(t);
  await open(renderer);
  await press(renderer.root, "Mark as complete");
  assert.equal(host.board.tasks[0].completed, true);
  await act(async () =>
    host.replaceBoard(
      board({
        lanes: host.board.lanes.filter((lane) => lane.id !== "todo"),
        tasks: host.board.tasks,
      }),
    ),
  );
  await open(renderer);
  await press(renderer.root, "Mark as incomplete");
  const restored = host.board.tasks.find((t) => t.id === "a");
  assert.equal(restored.completed, false);
  assert.equal(restored.laneId, "doing");
  assert.deepEqual(host.notifications, []);
});

test("deletion requires confirmation, cancellation is inert, and successful deletion notifies once", async (t) => {
  const { host, renderer } = await setup(t);
  const initial = structuredClone(host.board);
  await open(renderer);
  await press(renderer.root, "Delete task");
  assert.match(texts(renderer), /Task A/);
  assert.equal(
    renderer.root.findAllByProps({ accessibilityRole: "menu" }).length,
    0,
  );
  await press(renderer.root, "Cancel");
  assert.deepEqual(host.board, initial);
  await open(renderer);
  await press(renderer.root, "Delete task");
  await press(renderer.root, "Confirm Delete");
  assert.deepEqual(
    host.board.tasks.map((t) => t.id),
    ["b"],
  );
  assert.deepEqual(host.notifications, ["Task deleted"]);
});

test("deletion confirmation keeps its revision baseline, rejects concurrent edits, and can refresh then retry", async (t) => {
  const { host, renderer } = await setup(t);
  await open(renderer);
  await press(renderer.root, "Delete task");
  const latest = board({
    tasks: [{ ...task, description: "Changed elsewhere" }],
  });
  await act(async () => host.replaceBoard(latest));
  await press(renderer.root, "Confirm Delete");
  assert.deepEqual(host.board, latest);
  assert.match(texts(renderer), /fail|conflict/i);
  assert.equal(host.notifications.length, 1);
  await press(renderer.root, "Refresh latest data");
  await press(renderer.root, "Confirm Delete");
  assert.equal(host.board.tasks.length, 0);
  assert.equal(
    host.notifications.filter((n) => n === "Task deleted").length,
    1,
  );
});

test("move or completion failures keep saved data, show one error and recover for a later action", async (t) => {
  for (const action of ["move", "complete"]) {
    const { host, renderer } = await setup(t);
    const initial = structuredClone(host.board);
    host.failNextSave(new Error("Disk full"));
    await open(renderer);
    if (action === "move") await move(renderer, "Doing");
    else await press(renderer.root, "Mark as complete");
    assert.deepEqual(host.board, initial);
    assert.equal(host.notifications.length, 1);
    assert.match(texts(renderer), /Save failed:/);
    await open(renderer);
    await press(renderer.root, "Mark as complete");
    assert.equal(host.board.tasks[0].completed, true);
    assert.equal(host.notifications.length, 1);
  }
});

test("pending menu writes block duplicate card operations until persistence completes", async (t) => {
  const { host, renderer } = await setup(t);
  const gate = Promise.withResolvers();
  host.holdSave(gate.promise);
  await open(renderer);
  await move(renderer, "Doing");
  await act(async () => card(renderer).props.onContextMenu(event()));
  assert.equal(
    renderer.root.findAllByProps({ accessibilityRole: "menu" }).length,
    0,
  );
  const checkbox = renderer.root
    .findAllByType("Pressable")
    .find((n) => n.props.accessibilityLabel === "Mark Task A complete");
  assert.equal(checkbox.props.disabled, true);
  await act(async () => gate.resolve());
  assert.equal(host.board.tasks[0].laneId, "doing");
  assert.equal(host.board.tasks[0].completed, false);
});

test("copy uses full task text and saved/default/blank prompt without saving or starting an Agent", async (t) => {
  for (const [
    lang,
    prompt,
    heading,
    description,
    steps,
    source,
    instruction,
  ] of [
    [
      "en",
      null,
      "Task A",
      "Description",
      "Steps",
      "Source",
      "Please work on the following task.",
    ],
    [
      "en",
      "Review carefully.",
      "Task A",
      "Description",
      "Steps",
      "Source",
      "Review carefully.",
    ],
    ["en", "", "Task A", "Description", "Steps", "Source", ""],
    ["zh", "  ", "Task A", "描述", "子步骤", "来源", ""],
  ]) {
    language = lang;
    const { host, renderer } = await setup(t, {
      settingsValues: { "agent-dispatch": { prompt } },
    });
    const initial = structuredClone(host.board);
    const label = lang === "zh" ? "任务操作：Task A" : "Task actions: Task A";
    await act(async () =>
      renderer.root
        .findByProps({ accessibilityLabel: label })
        .props.onContextMenu(event()),
    );
    await press(renderer.root, lang === "zh" ? "复制提示词" : "Copy prompt");
    const expected = `${instruction ? instruction + "\n\n" : ""}# ${heading}\n\n## ${description}\n\nKeep **Markdown**.\n\n## ${steps}\n\n- [ ] Inspect\n- [x] Verify\n\n## ${source}\n\n${url}`;
    assert.deepEqual(host.clipboard, [expected]);
    assert.deepEqual(host.board, initial);
    assert.equal(host.settingsValues["agent-dispatch"].prompt, prompt);
    assert.equal(renderer.root.findAllByType("Modal").length, 0);
    assert.equal(host.notifications.length, 1);
  }
});

test("copy skips empty sections, reports clipboard failure honestly and stays disabled while preferences load", async (t) => {
  const minimal = board({
    tasks: [{ id: "a", title: "Task A", laneId: "todo" }],
  });
  const { host, renderer } = await setup(t, {
    board: minimal,
    settingsValues: { "agent-dispatch": { prompt: "" } },
  });
  await open(renderer);
  await press(renderer.root, "Copy prompt");
  assert.deepEqual(host.clipboard, ["# Task A"]);
  const failure = await setup(t, {
    copyText: async () => {
      throw new Error("Denied");
    },
  });
  await open(failure.renderer);
  await press(failure.renderer.root, "Copy prompt");
  assert.deepEqual(failure.host.clipboard, []);
  assert.match(failure.host.notifications.join("\n"), /could not copy/i);
  const loading = await setup(t, { promptReady: false });
  await open(loading.renderer);
  assert.equal(
    loading.renderer.root
      .findAllByType("Pressable")
      .find((n) => n.props.accessibilityLabel === "Copy prompt").props.disabled,
    true,
  );
});

test("Issue action opens the saved source in browser; menu dismisses on scroll, filter and task removal", async (t) => {
  const { host, renderer } = await setup(t);
  await open(renderer);
  await press(renderer.root, "Open Issue in browser");
  assert.deepEqual(host.externalUrls, [url]);
  assert.equal(
    renderer.root.findAllByProps({ accessibilityRole: "menu" }).length,
    0,
  );
  for (const horizontal of [true, false]) {
    await open(renderer);
    const scroll = renderer.root
      .findAllByType("ScrollView")
      .find(
        (n) => Boolean(n.props.horizontal) === horizontal && n.props.onScroll,
      );
    await act(async () =>
      scroll.props.onScroll({ nativeEvent: { contentOffset: { x: 5, y: 5 } } }),
    );
    assert.equal(
      renderer.root.findAllByProps({ accessibilityRole: "menu" }).length,
      0,
    );
  }
  await open(renderer);
  await chooseProject(renderer.root, "Project B");
  assert.equal(
    renderer.root.findAllByProps({ accessibilityRole: "menu" }).length,
    0,
  );
  await chooseProject(renderer.root, "All Projects");
  await open(renderer);
  await act(async () => host.replaceBoard(board({ tasks: [] })));
  assert.equal(
    renderer.root.findAllByProps({ accessibilityRole: "menu" }).length,
    0,
  );
});

test("keyboard can open card menu and dismiss it with Escape or Tab without changing data", async (t) => {
  const { host, renderer } = await setup(t);
  const initial = structuredClone(host.board);
  for (const key of ["Escape", "Tab"]) {
    await act(async () =>
      card(renderer).props.onKeyDown({
        key: "F10",
        shiftKey: true,
        preventDefault() {},
        stopPropagation() {},
      }),
    );
    const menu = renderer.root.findByProps({ accessibilityRole: "menu" });
    await act(async () =>
      menu.props.onKeyDown({ key, preventDefault() {}, stopPropagation() {} }),
    );
    assert.equal(
      renderer.root.findAllByProps({ accessibilityRole: "menu" }).length,
      0,
    );
  }
  assert.deepEqual(host.board, initial);
});
