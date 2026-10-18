import test from "node:test";
import assert from "node:assert/strict";
import { act } from "./helpers/react-host-env.mjs";
import { createHost, mount, press, text } from "./helpers/kanban-host.mjs";
import { KanbanBoardSchema } from "../shared/kanban.ts";

let language = "en";
globalThis.localStorage = { getItem: () => JSON.stringify({ language }) };
test.after(() => delete globalThis.localStorage);
const lanes = [
  { id: "todo", title: "Todo", isCompletionLane: false },
  { id: "doing", title: "Doing", isCompletionLane: false },
  { id: "done", title: "Finished", isCompletionLane: true },
];
const dialog = (renderer) => renderer.root.findAllByType("Modal")[0];
const confirmation = (renderer) => renderer.root.findAllByType("Modal")[1];
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
function dragBody(renderer, title) {
  const node = dialog(renderer)
    .findAllByType("View")
    .find((n) => n.props.accessibilityLabel === `Reorder ${title}`);
  assert.ok(node, `reachable drag area: ${title}`);
  return node;
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

test("管理入口就地添加：确认才保存，新泳道插在完成泳道之前且弹窗继续打开", async (t) => {
  const { host, renderer } = await setup(t);
  await press(dialog(renderer), "+ Add lane");
  await enter(renderer, "  Review  ");
  assert.deepEqual(host.board.lanes, lanes);
  await press(dialog(renderer), "Confirm");
  assert.deepEqual(
    host.board.lanes.map((l) => l.title),
    ["Todo", "Doing", "Review", "Finished"],
  );
  assert.equal(dialog(renderer).props.title, "Manage lanes");
  assert.deepEqual(host.notifications, ["Lane created"]);
});

test("就地改名保留非法输入：空白和完成泳道同名被拒绝，修正后立即保存", async (t) => {
  const { host, renderer } = await setup(t);
  await click(dialog(renderer), "Rename Todo");
  for (const [value, error] of [
    ["   ", "Lane name cannot be empty"],
    [" Finished ", "Lane names must be unique"],
  ]) {
    await enter(renderer, value);
    await press(dialog(renderer), "Confirm");
    assert.match(texts(dialog(renderer)), new RegExp(error));
    assert.equal(dialog(renderer).findByType("TextInput").props.value, value);
    assert.deepEqual(host.board.lanes, lanes);
    assert.deepEqual(host.notifications, []);
  }
  await enter(renderer, " Ready ");
  await press(dialog(renderer), "Confirm");
  await click(dialog(renderer), "Rename Finished");
  await enter(renderer, "Ready");
  await press(dialog(renderer), "Confirm");
  assert.match(texts(dialog(renderer)), /Lane names must be unique/);
  await enter(renderer, "Shipped");
  await press(dialog(renderer), "Confirm");
  assert.deepEqual(
    host.board.lanes.map((l) => l.title),
    ["Ready", "Doing", "Shipped"],
  );
  assert.deepEqual(host.notifications, ["Lane renamed", "Lane renamed"]);
});

test("左右排序仅预览，先保存或还原才能增删改，完成泳道固定且任务保持不变", async (t) => {
  const { host, renderer } = await setup(t, {
    board: { lanes, tasks: [{ id: "t1", title: "Keep", laneId: "todo" }] },
  });
  const tasks = structuredClone(host.board.tasks);
  assert.equal(button(dialog(renderer), "Move Todo left").props.disabled, true);
  assert.equal(
    button(dialog(renderer), "Move Doing right").props.disabled,
    true,
  );
  assert.equal(
    dialog(renderer)
      .findAllByType("Pressable")
      .some((n) => n.props.accessibilityLabel === "Move Finished left"),
    false,
  );
  await click(dialog(renderer), "Move Doing left");
  assert.deepEqual(displayedLanes(renderer), [
    "Rename Doing",
    "Rename Todo",
    "Rename Finished",
  ]);
  assert.deepEqual(host.board.lanes, lanes);
  for (const label of ["Rename Todo", "+ Add lane", "Delete Todo"])
    assert.equal(button(dialog(renderer), label).props.disabled, true);
  assert.match(
    texts(dialog(renderer)),
    /Save or restore the order before adding, renaming or deleting/,
  );
  await press(dialog(renderer), "Restore order");
  assert.deepEqual(displayedLanes(renderer), [
    "Rename Todo",
    "Rename Doing",
    "Rename Finished",
  ]);
  await click(dialog(renderer), "Move Todo right");
  await press(dialog(renderer), "Save order");
  assert.deepEqual(
    host.board.lanes.map((l) => l.id),
    ["doing", "todo", "done"],
  );
  assert.deepEqual(host.board.tasks, tasks);
  assert.equal(button(dialog(renderer), "Rename Todo").props.disabled, false);
  assert.deepEqual(host.notifications, ["Lane order saved"]);
});

test("触屏滑动让渡滚动且不改名，长按抓起后可落位，取消手势不改变排序", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { host, renderer } = await setup(t);
  const event = { nativeEvent: { pointerType: "touch" } };
  const gesture = { x0: 50, y0: 50, moveX: 50, moveY: 50, dx: 0, dy: 0 };
  let source = dragBody(renderer, "Todo").props;
  await act(async () => source.onPanResponderGrant(event, gesture));
  await act(async () =>
    source.onPanResponderMove(event, { ...gesture, moveX: 70, dx: 20 }),
  );
  assert.equal(source.onPanResponderTerminationRequest(), true);
  await act(async () => source.onPanResponderRelease(event, gesture));
  assert.equal(dialog(renderer).findAllByType("TextInput").length, 0);
  assert.deepEqual(displayedLanes(renderer), [
    "Rename Todo",
    "Rename Doing",
    "Rename Finished",
  ]);
  source = dragBody(renderer, "Todo").props;
  await act(async () => source.onPanResponderGrant(event, gesture));
  await act(async () => t.mock.timers.tick(220));
  assert.equal(source.onPanResponderTerminationRequest(), false);
  await act(async () =>
    source.onPanResponderMove(event, { ...gesture, moveX: 290, dx: 240 }),
  );
  await act(async () => source.onPanResponderTerminate());
  assert.deepEqual(displayedLanes(renderer), [
    "Rename Todo",
    "Rename Doing",
    "Rename Finished",
  ]);
  await act(async () => source.onPanResponderGrant(event, gesture));
  await act(async () => t.mock.timers.tick(220));
  await act(async () =>
    source.onPanResponderMove(event, { ...gesture, moveX: 290, dx: 240 }),
  );
  await act(async () => source.onPanResponderRelease(event, gesture));
  assert.deepEqual(displayedLanes(renderer), [
    "Rename Doing",
    "Rename Todo",
    "Rename Finished",
  ]);
  assert.deepEqual(host.board.lanes, lanes);
});

test("删除按未完成状态跨项目清理，确认无数量，保留完成任务及其恢复能力", async (t) => {
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
  assert.ok(confirmation(renderer));
  assert.match(texts(confirmation(renderer)), /all projects/);
  assert.doesNotMatch(texts(confirmation(renderer)), /\d/);
  await press(confirmation(renderer), "Cancel");
  assert.equal(host.board.tasks.length, 4);
  await click(dialog(renderer), "Delete Todo");
  await press(confirmation(renderer), "Delete lane");
  assert.deepEqual(
    host.board.lanes.map((l) => l.id),
    ["doing", "done"],
  );
  assert.deepEqual(host.board.tasks, preserved);
  assert.equal(button(dialog(renderer), "Delete Doing").props.disabled, true);
  assert.equal(
    dialog(renderer)
      .findAllByType("Pressable")
      .some((n) => n.props.accessibilityLabel === "Delete Finished"),
    false,
  );
  await press(dialog(renderer), "Close");
  await click(renderer.root, "Mark Archive incomplete");
  assert.equal(
    host.board.tasks.find((task) => task.id === "c").laneId,
    "doing",
  );
  assert.equal(
    host.board.tasks.find((task) => task.id === "c").completed,
    false,
  );
  assert.deepEqual(host.notifications, ["Lane deleted"]);
});

test("空泳道删除途中出现任务则补确认，授权后按最新范围删除而不再次询问", async (t) => {
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
  const latest = KanbanBoardSchema.parse({
    lanes,
    tasks: [
      {
        id: "new",
        title: "Now completed",
        laneId: "todo",
        completed: true,
        completedAt: 10,
      },
      {
        id: "later",
        title: "Delete latest",
        laneId: "todo",
        projectId: "project-b",
      },
      { id: "elsewhere", title: "Keep elsewhere", laneId: "doing" },
    ],
  });
  await act(async () => host.replaceBoard(latest));
  await press(confirmation(renderer), "Delete lane");
  assert.equal(confirmation(renderer), undefined);
  assert.deepEqual(host.board.tasks, [latest.tasks[0], latest.tasks[2]]);
  assert.deepEqual(
    host.board.lanes.map((l) => l.id),
    ["doing", "done"],
  );
  assert.deepEqual(host.notifications, ["Lane deleted"]);
});

test("改名保存途中仅任务更新时自动续存，不覆盖新任务且只通知一次", async (t) => {
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
});

test("外部泳道变化拒绝自动合并并保留名称或排序草稿，加载最新后恢复", async (t) => {
  for (const mode of ["rename", "order"]) {
    const { host, renderer } = await setup(t);
    if (mode === "rename") {
      await click(dialog(renderer), "Rename Todo");
      await enter(renderer, "Draft");
    } else await click(dialog(renderer), "Move Doing left");
    const external = KanbanBoardSchema.parse({
      lanes: [lanes[0], { ...lanes[1], title: "External" }, lanes[2]],
      tasks: [],
    });
    await act(async () => host.replaceBoard(external));
    await press(dialog(renderer), mode === "rename" ? "Confirm" : "Save order");
    assert.deepEqual(host.board, external);
    assert.match(texts(dialog(renderer)), /Lanes changed in another window/);
    if (mode === "rename")
      assert.equal(
        dialog(renderer).findByType("TextInput").props.value,
        "Draft",
      );
    else
      assert.deepEqual(displayedLanes(renderer), [
        "Rename Doing",
        "Rename Todo",
        "Rename Finished",
      ]);
    assert.equal(host.notifications.length, 1);
    await click(dialog(renderer), "Discard changes and load latest");
    assert.equal(dialog(renderer).findAllByType("TextInput").length, 0);
    assert.deepEqual(displayedLanes(renderer), [
      "Rename Todo",
      "Rename External",
      "Rename Finished",
    ]);
    await click(dialog(renderer), "Rename Todo");
    await enter(renderer, "Ready");
    await press(dialog(renderer), "Confirm");
    assert.equal(host.board.lanes[0].title, "Ready");
    assert.equal(host.notifications.length, 2);
  }
});

test("删除保存与刷新失败时在确认窗口内保留错误和恢复入口，重试不产生部分删除", async (t) => {
  const { host, renderer } = await setup(t, {
    board: {
      lanes,
      tasks: [{ id: "keep", title: "Keep until saved", laneId: "todo" }],
    },
  });
  const original = structuredClone(host.board);
  await click(dialog(renderer), "Delete Todo");
  host.failNextSave();
  host.failNextReload();
  await press(confirmation(renderer), "Delete lane");
  assert.deepEqual(host.board, original);
  assert.match(texts(confirmation(renderer)), /Lane save failed/);
  assert.ok(button(confirmation(renderer), "Discard changes and load latest"));
  assert.deepEqual(host.notifications, [
    "Lane deletion failed. Check the latest data.",
  ]);
  await click(confirmation(renderer), "Discard changes and load latest");
  assert.equal(confirmation(renderer), undefined);
  await click(dialog(renderer), "Delete Todo");
  await press(confirmation(renderer), "Delete lane");
  assert.deepEqual(host.board.tasks, []);
  assert.deepEqual(
    host.board.lanes.map((l) => l.id),
    ["doing", "done"],
  );
  assert.equal(host.notifications.length, 2);
});

test("快捷入口聚焦目标，关闭直接丢弃排序和未确认名称，但不撤销已保存修改", async (t) => {
  const { host, renderer } = await setup(t);
  await click(dialog(renderer), "Rename Todo");
  await enter(renderer, "Ready");
  await press(dialog(renderer), "Confirm");
  await click(dialog(renderer), "Move Doing left");
  await press(dialog(renderer), "Close");
  assert.equal(renderer.root.findAllByType("Modal").length, 0);
  await click(renderer.root, "Manage lane Ready");
  assert.equal(
    button(dialog(renderer), "Rename Ready").props.accessibilityState.selected,
    true,
  );
  assert.deepEqual(displayedLanes(renderer), [
    "Rename Ready",
    "Rename Doing",
    "Rename Finished",
  ]);
  await click(dialog(renderer), "Rename Ready");
  await enter(renderer, "Unconfirmed");
  await press(dialog(renderer), "Close");
  assert.equal(renderer.root.findAllByType("Modal").length, 0);
  assert.equal(host.board.lanes[0].title, "Ready");
  assert.deepEqual(host.notifications, ["Lane renamed"]);
});

test("中文窄屏就地添加同样判重，完成泳道原名确认不产生保存通知", async (t) => {
  language = "zh";
  const host = createHost({
    compact: true,
    board: KanbanBoardSchema.parse({}),
  });
  const renderer = await mount(t, host);
  await press(renderer.root, "管理泳道");
  await press(dialog(renderer), "＋ 添加泳道");
  await enter(renderer, " 已完成 ");
  await press(dialog(renderer), "确认");
  assert.match(texts(dialog(renderer)), /泳道名称不可重复/);
  assert.equal(host.board.lanes.length, 3);
  await press(dialog(renderer), "取消");
  await click(dialog(renderer), "重命名 已完成");
  await press(dialog(renderer), "确认");
  assert.deepEqual(host.notifications, []);
  await act(async () => dialog(renderer).props.onOpenChange(false));
  assert.equal(renderer.root.findAllByType("Modal").length, 0);
});

test("鼠标从名称区域拖动生成排序草稿，落位不改名且点击保存才持久化", async (t) => {
  const { host, renderer } = await setup(t);
  const event = { nativeEvent: { pointerType: "mouse" } };
  const gesture = { x0: 50, y0: 50, moveX: 50, moveY: 50, dx: 0, dy: 0 };
  const source = dragBody(renderer, "Todo").props;
  await act(async () => source.onPanResponderGrant(event, gesture));
  await act(async () =>
    source.onPanResponderMove(event, { ...gesture, moveX: 290, dx: 240 }),
  );
  await act(async () =>
    source.onPanResponderRelease(event, { ...gesture, moveX: 290, dx: 240 }),
  );
  assert.deepEqual(displayedLanes(renderer), [
    "Rename Doing",
    "Rename Todo",
    "Rename Finished",
  ]);
  assert.equal(dialog(renderer).findAllByType("TextInput").length, 0);
  assert.deepEqual(host.board.lanes, lanes);
  assert.deepEqual(host.notifications, []);
  await press(dialog(renderer), "Save order");
  assert.deepEqual(
    host.board.lanes.map((l) => l.id),
    ["doing", "todo", "done"],
  );
  assert.deepEqual(host.notifications, ["Lane order saved"]);
});
