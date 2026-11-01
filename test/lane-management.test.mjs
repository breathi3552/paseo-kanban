import test from "node:test";
import assert from "node:assert/strict";
import { act } from "./helpers/react-host-env.mjs";
import { createHost, mount, press, text } from "./helpers/kanban-host.mjs";
import { KanbanBoardSchema } from "../shared/kanban.ts";

let language = "en";
let windowEvents;
globalThis.localStorage = { getItem: () => JSON.stringify({ language }) };
test.beforeEach(() => {
  windowEvents = new EventTarget();
  globalThis.window = windowEvents;
});
test.after(() => {
  delete globalThis.window;
  delete globalThis.localStorage;
});
const lanes = [
  { id: "todo", title: "Todo", isCompletionLane: false },
  { id: "doing", title: "Doing", isCompletionLane: false },
  { id: "done", title: "Finished", isCompletionLane: true },
];
const dialogs = (renderer) =>
  renderer.root.findAll(
    (node) =>
      node.type === "Modal" ||
      (node.type === "View" && node.props.role === "dialog"),
  );
const dialog = (renderer) => dialogs(renderer)[0];
const confirmation = (renderer) => dialogs(renderer)[1];
const displayedLanes = (renderer) =>
  dialog(renderer)
    .findAllByType("Pressable")
    .map((n) => n.props.accessibilityLabel)
    .filter((label) => label?.startsWith("Rename "));
const texts = (root) => root.findAllByType("Text").map(text).join("\n");
function button(root, label) {
  const node = root
    .findAllByType("Pressable")
    .find((n) => n.props.accessibilityLabel === label);
  assert.ok(node, `reachable control: ${label}`);
  return node;
}
async function click(root, label) {
  const node = button(root, label);
  assert.ok(!node.props.disabled, `${label} is enabled`);
  await act(async () => node.props.onPress({ stopPropagation() {} }));
}
async function enter(renderer, value) {
  await act(async () =>
    dialog(renderer).findByType("TextInput").props.onChangeText(value),
  );
}
async function setup(t, options = {}) {
  language = "en";
  const host = createHost({
    ...options,
    board: KanbanBoardSchema.parse(options.board ?? { lanes, tasks: [] }),
  });
  const renderer = await mount(t, host);
  await press(renderer.root, "Manage lanes");
  return { host, renderer };
}

test("就地添加新泳道插在完成泳道前，改名拦截空白与重名，关闭丢弃未确认草稿", async (t) => {
  const { host, renderer } = await setup(t);
  await press(dialog(renderer), "+ Add lane");
  await enter(renderer, "  Review  ");
  await press(dialog(renderer), "Confirm");
  assert.deepEqual(
    host.board.lanes.map((l) => l.title),
    ["Todo", "Doing", "Review", "Finished"],
  );

  await click(dialog(renderer), "Rename Todo");
  for (const [value, error] of [
    ["   ", "Lane name cannot be empty"],
    [" Finished ", "Lane names must be unique"],
  ]) {
    await enter(renderer, value);
    await press(dialog(renderer), "Confirm");
    assert.match(texts(dialog(renderer)), new RegExp(error));
    assert.equal(host.board.lanes[0].title, "Todo");
  }
  await enter(renderer, " Ready ");
  await press(dialog(renderer), "Confirm");
  assert.equal(host.board.lanes[0].title, "Ready");

  await click(dialog(renderer), "Rename Ready");
  await enter(renderer, "Unconfirmed");
  await click(dialog(renderer), "Close");
  assert.equal(dialog(renderer), undefined);
  assert.equal(host.board.lanes[0].title, "Ready");
});

test("拖拽与左右按钮共用顺序预览草稿，未保存前锁定增删改，支持还原或显式保存", async (t) => {
  const { host, renderer } = await setup(t, {
    board: { lanes, tasks: [{ id: "t1", title: "Keep", laneId: "todo" }] },
  });
  await click(dialog(renderer), "Move Doing left");
  assert.deepEqual(displayedLanes(renderer), [
    "Rename Doing",
    "Rename Todo",
    "Rename Finished",
  ]);
  for (const label of ["Rename Todo", "+ Add lane", "Delete Todo"])
    assert.equal(button(dialog(renderer), label).props.disabled, true);
  await press(dialog(renderer), "Restore order");
  assert.deepEqual(displayedLanes(renderer), [
    "Rename Todo",
    "Rename Doing",
    "Rename Finished",
  ]);

  const grip = dialog(renderer)
    .findAllByType("View")
    .find(
      (node) =>
        node.props.accessibilityLabel === "Reorder Todo" &&
        node.props.onPanResponderGrant,
    );
  const event = {
    nativeEvent: { pointerType: "mouse", pageX: 200, pageY: 100 },
  };
  await act(async () => grip.props.onPanResponderGrant(event));
  await act(async () =>
    grip.props.onPanResponderMove(event, { dx: 172, dy: 0 }),
  );
  await act(async () => grip.props.onPanResponderRelease());
  assert.deepEqual(displayedLanes(renderer), [
    "Rename Doing",
    "Rename Todo",
    "Rename Finished",
  ]);
  await press(dialog(renderer), "Save order");
  assert.deepEqual(
    host.board.lanes.map((l) => l.id),
    ["doing", "todo", "done"],
  );
});

test("删除泳道跨项目清理未完成任务并保留已完成任务恢复能力，仅剩一普通泳道时禁止删除", async (t) => {
  const { host, renderer } = await setup(t, {
    board: {
      lanes,
      tasks: [
        { id: "a", title: "Project A", laneId: "todo", projectId: "project-a" },
        { id: "b", title: "Project B", laneId: "todo", projectId: "project-b" },
        {
          id: "c",
          title: "Archive",
          laneId: "todo",
          completed: true,
          completedAt: 5,
        },
        { id: "d", title: "Other", laneId: "doing" },
      ],
    },
  });
  const preserved = structuredClone(host.board.tasks.slice(2));
  await click(dialog(renderer), "Delete Todo");
  await press(confirmation(renderer), "Delete lane");
  assert.deepEqual(
    host.board.lanes.map((l) => l.id),
    ["doing", "done"],
  );
  assert.deepEqual(host.board.tasks, preserved);
  assert.equal(button(dialog(renderer), "Delete Doing").props.disabled, true);
  await click(dialog(renderer), "Close");
  await click(renderer.root, "Mark Archive incomplete");
  assert.equal(
    host.board.tasks.find((task) => task.id === "c").laneId,
    "doing",
  );
  assert.equal(
    host.board.tasks.find((task) => task.id === "c").completed,
    false,
  );
});

test("空泳道删除途中并发出现任务则补充确认，确认后按最新范围删除", async (t) => {
  const { host, renderer } = await setup(t);
  let release;
  host.holdSave(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  await click(dialog(renderer), "Delete Todo");
  await act(async () =>
    host.replaceBoard(
      KanbanBoardSchema.parse({
        lanes,
        tasks: [{ id: "new", title: "Arrived", laneId: "todo" }],
      }),
    ),
  );
  await act(async () => {
    release();
  });
  assert.ok(confirmation(renderer));
  assert.equal(host.board.tasks.length, 1);
  await press(confirmation(renderer), "Delete lane");
  assert.equal(confirmation(renderer), undefined);
  assert.deepEqual(host.board.tasks, []);
  assert.deepEqual(
    host.board.lanes.map((l) => l.id),
    ["doing", "done"],
  );
});

test("改名保存途中若仅任务并发更新则自动续存（含关窗后），超出重试上限时停止并保留草稿", async (t) => {
  // 1. Auto-continues on concurrent task update even after closing dialog
  const { host, renderer } = await setup(t);
  await click(dialog(renderer), "Rename Todo");
  await enter(renderer, "Ready");
  let release;
  host.holdSave(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  await press(dialog(renderer), "Confirm");
  await click(dialog(renderer), "Close");
  await act(async () =>
    host.replaceBoard(
      KanbanBoardSchema.parse({
        lanes,
        tasks: [{ id: "new", title: "Concurrent", laneId: "todo" }],
      }),
    ),
  );
  await act(async () => {
    release();
  });
  assert.equal(host.board.lanes[0].title, "Ready");
  assert.equal(host.board.tasks[0].title, "Concurrent");
  assert.deepEqual(host.notifications, ["Lane renamed"]);

  // 2. Bounded retry limit stops after 3 consecutive task conflicts and preserves draft
  const bounded = await setup(t);
  await click(dialog(bounded.renderer), "Rename Todo");
  await enter(bounded.renderer, "BoundedName");
  let pending = Promise.withResolvers();
  bounded.host.holdSave(pending.promise);
  await press(dialog(bounded.renderer), "Confirm");
  for (const id of ["first", "second", "third"]) {
    const previous = pending;
    pending = Promise.withResolvers();
    bounded.host.holdSave(pending.promise);
    await act(async () => {
      bounded.host.replaceBoard(
        KanbanBoardSchema.parse({
          lanes,
          tasks: [
            ...bounded.host.board.tasks,
            { id, title: id, laneId: "todo" },
          ],
        }),
      );
      previous.resolve();
    });
  }
  assert.equal(
    dialog(bounded.renderer).findByType("TextInput").props.value,
    "BoundedName",
  );
  assert.match(texts(dialog(bounded.renderer)), /Lane save failed/);
  pending.resolve();
  await press(dialog(bounded.renderer), "Confirm");
  assert.equal(bounded.host.board.lanes[0].title, "BoundedName");
});

test("外部泳道结构冲突或删除失败时拒绝自动合并，加载最新数据后恢复操作", async (t) => {
  const { host, renderer } = await setup(t);
  await click(dialog(renderer), "Rename Todo");
  await enter(renderer, "Draft");
  const external = KanbanBoardSchema.parse({
    lanes: [lanes[0], { ...lanes[1], title: "External" }, lanes[2]],
    tasks: [],
  });
  await act(async () => host.replaceBoard(external));
  await press(dialog(renderer), "Confirm");
  assert.deepEqual(host.board, external);
  assert.match(texts(dialog(renderer)), /Lanes changed in another window/);
  await click(dialog(renderer), "Discard changes and load latest");
  assert.deepEqual(displayedLanes(renderer), [
    "Rename Todo",
    "Rename External",
    "Rename Finished",
  ]);
});
