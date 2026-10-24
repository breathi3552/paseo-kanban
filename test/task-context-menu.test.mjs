import { findDialog, findDialogs } from "./helpers/kanban-host.mjs";
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
  assert.equal(e.prevented, true);
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

test("右键或快捷键打开单实例菜单并区分普通任务与 Issue，滚动/筛选/快捷键关闭菜单，编辑保存期间防误关", async (t) => {
  const { host, renderer } = await setup(t);
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

  // Dismiss on Escape
  const menu = renderer.root.findByProps({ accessibilityRole: "menu" });
  await act(async () =>
    menu.props.onKeyDown({
      key: "Escape",
      preventDefault() {},
      stopPropagation() {},
    }),
  );
  assert.equal(
    renderer.root.findAllByProps({ accessibilityRole: "menu" }).length,
    0,
  );

  // Open Issue in browser
  await open(renderer, "Task A");
  await press(renderer.root, "Open Issue in browser");
  assert.deepEqual(host.externalUrls, [url]);

  // Edit details and protect in-flight save from backdrop dismissal
  await open(renderer, "Task A");
  await press(renderer.root, "Edit details");
  const modal = findDialog(renderer.root);
  await act(async () =>
    modal.findByProps({ value: "Task A" }).props.onChangeText("Saved draft"),
  );
  const gate = Promise.withResolvers();
  t.after(() => gate.resolve());
  host.holdSave(gate.promise);
  await press(renderer.root, "Save Changes");
  await act(async () =>
    renderer.root.findByType("WebDialogPortal").props.onDismiss(),
  );
  assert.equal(findDialogs(renderer.root).length, 1);
  await act(async () => gate.resolve());
  assert.equal(findDialogs(renderer.root).length, 0);
  assert.equal(host.board.tasks[0].title, "Saved draft");
});

test("菜单跨泳道移动在项目筛选下保留隐藏任务次序，完成与重新打开在原泳道被删时回退至首个普通泳道", async (t) => {
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
  await move(renderer, "Doing");
  assert.deepEqual(
    host.board.tasks.map((t) => t.id),
    ["hidden", "visible", "a", "after"],
  );

  await chooseProject(renderer.root, "All Projects");
  await open(renderer);
  await press(renderer.root, "Mark as complete");
  assert.equal(host.board.tasks.find((t) => t.id === "a").completed, true);
  await act(async () =>
    host.replaceBoard(
      board({
        lanes: host.board.lanes.filter((lane) => lane.id !== "doing"),
        tasks: host.board.tasks.filter(
          (item) => item.completed || item.laneId !== "doing",
        ),
      }),
    ),
  );
  await open(renderer);
  await press(renderer.root, "Mark as incomplete");
  const restored = host.board.tasks.find((t) => t.id === "a");
  assert.equal(restored.completed, false);
  assert.equal(restored.laneId, "todo");
  assert.deepEqual(host.notifications, [
    "Task moved",
    "Task completed",
    "Task reopened",
  ]);
});

test("删除确认：拦截并发修改并支持刷新后重试，在详情窗内取消或刷新删除确认不丢失未保存草稿", async (t) => {
  // 1. Menu delete confirmation with concurrent conflict & refresh retry
  const { host, renderer } = await setup(t);
  await open(renderer);
  await press(renderer.root, "Delete task");
  const latest = board({
    tasks: [
      { ...task, title: "Task A (updated)" },
      { id: "b", title: "Task B", laneId: "doing", projectId: "project-b" },
    ],
  });
  await act(async () => host.replaceBoard(latest));
  await press(renderer.root, "Confirm Delete");
  assert.deepEqual(host.board, latest);
  assert.match(texts(renderer), /fail|conflict/i);

  await press(renderer.root, "Refresh latest data");
  assert.match(texts(renderer), /Delete task “Task A \(updated\)”\?/);
  await press(renderer.root, "Confirm Delete");
  assert.deepEqual(
    host.board.tasks.map((item) => item.id),
    ["b"],
  );

  // 2. Details modal delete confirmation preserves unsaved draft when cancelled
  const detailsEnv = await setup(t);
  await open(detailsEnv.renderer);
  await press(detailsEnv.renderer.root, "Edit details");
  const modal = findDialog(detailsEnv.renderer.root);
  await act(async () =>
    modal
      .findByProps({ value: "Task A" })
      .props.onChangeText("Unsaved draft title"),
  );
  await press(detailsEnv.renderer.root, "Delete Task");
  await press(detailsEnv.renderer.root, "Cancel");
  assert.ok(
    detailsEnv.renderer.root.findByProps({ value: "Unsaved draft title" }),
  );
});

test("复制提示词：组合已存/默认/空白指令与非空章节写入剪贴板，偏好未就绪时禁用，剪贴板失败报错", async (t) => {
  for (const [lang, prompt, expectedPrefix] of [
    ["en", null, "Please work on the following task.\n\n# Task A"],
    ["en", "Review carefully.", "Review carefully.\n\n# Task A"],
    ["zh", "  ", "# Task A\n\n## 描述"],
  ]) {
    language = lang;
    const { host, renderer } = await setup(t, {
      settingsValues: { "agent-dispatch": { prompt } },
    });
    const label = lang === "zh" ? "任务操作：Task A" : "Task actions: Task A";
    await act(async () =>
      renderer.root
        .findByProps({ accessibilityLabel: label })
        .props.onContextMenu(event()),
    );
    await press(renderer.root, lang === "zh" ? "复制提示词" : "Copy prompt");
    assert.ok(host.clipboard[0].startsWith(expectedPrefix));
  }

  language = "en";
  const failure = await setup(t, {
    copyText: async () => {
      throw new Error("Denied");
    },
  });
  await open(failure.renderer);
  await press(failure.renderer.root, "Copy prompt");
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
