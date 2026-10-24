import test from "node:test";
import assert from "node:assert/strict";
import {
  act,
  loadClientModule,
  mockReactNative,
} from "./helpers/react-host-env.mjs";
import {
  createHost,
  mount,
  text,
  chooseProject,
} from "./helpers/kanban-host.mjs";
import { KanbanBoardSchema } from "../shared/kanban.ts";

const { KanbanDragController } = loadClientModule("board/drag");

globalThis.localStorage = {
  getItem: () => JSON.stringify({ language: "en" }),
};
test.after(() => delete globalThis.localStorage);

function lane(renderer, title) {
  let node = renderer.root
    .findAllByType("Text")
    .find((candidate) => text(candidate) === title);
  assert.ok(node, `visible lane: ${title}`);
  while (node && !(node.type === "View" && node.props.onLayout))
    node = node.parent;
  assert.ok(node, `measurable lane: ${title}`);
  return node;
}

function card(renderer, title) {
  let node = renderer.root
    .findAllByProps({ accessibilityRole: "checkbox" })
    .find((candidate) =>
      [`Mark ${title} complete`, `Mark ${title} incomplete`].includes(
        candidate.props.accessibilityLabel,
      ),
    );
  while (node && !(node.type === "View" && node.props.onLayout))
    node = node.parent;
  assert.ok(node, `measurable card: ${title}`);
  return node;
}

function laneTitles(renderer, title) {
  return lane(renderer, title)
    .findAllByProps({ accessibilityRole: "checkbox" })
    .map((node) => node.props.accessibilityLabel);
}

async function setup(t, { tasks, project } = {}) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  const host = createHost({
    board: KanbanBoardSchema.parse({
      lanes: [
        { id: "todo", title: "Todo", isCompletionLane: false },
        { id: "doing", title: "Doing", isCompletionLane: false },
        { id: "done", title: "Finished", isCompletionLane: true },
      ],
      tasks: tasks ?? [
        { id: "a", title: "Task A", laneId: "todo" },
        { id: "b", title: "Task B", laneId: "doing" },
      ],
    }),
  });
  const renderer = await mount(t, host);
  if (project) await chooseProject(renderer.root, project);
  await measureBoard(renderer);
  return { host, renderer };
}

async function measureBoard(renderer) {
  await act(async () => {
    renderer.root
      .findAllByType("ScrollView")
      .find((node) => node.props.horizontal && node.props.onLayout)
      .props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 1000, height: 600 } },
      });
    for (const [index, title] of ["Todo", "Doing", "Finished"].entries()) {
      const column = lane(renderer, title);
      column.props.onLayout({
        nativeEvent: {
          layout: { x: index * 320, y: 0, width: 300, height: 550 },
        },
      });
      column.findByType("ScrollView").props.onLayout({
        nativeEvent: { layout: { x: 0, y: 50, width: 280, height: 500 } },
      });
    }
    for (const title of ["Task A", "Task B"])
      card(renderer, title).props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 280, height: 64 } },
      });
  });
}

async function moveTaskA(renderer, { fromX = 20, toX = 340, toY = 180 } = {}) {
  const body = card(renderer, "Task A")
    .findAllByType("View")
    .find((node) => node.props.onPanResponderGrant);
  const event = {
    nativeEvent: { pointerType: "mouse", pageX: fromX, pageY: 70 },
  };
  await act(async () => {
    body.props.onPanResponderGrant(event, {
      x0: fromX,
      y0: 70,
      dx: 0,
      dy: 0,
    });
    body.props.onPanResponderMove(
      { nativeEvent: { pointerType: "mouse", pageX: toX, pageY: toY } },
      { moveX: toX, moveY: toY, dx: toX - fromX, dy: toY - 70 },
    );
  });
  await act(async () => body.props.onPanResponderRelease());
}

test("真实看板拖拽：跨泳道落位持久化、项目筛选保留隐藏任务、落位合并最新外部编辑", async (t) => {
  let finish;
  t.mock.method(mockReactNative.Animated, "parallel", () => ({
    start: (callback) => {
      finish = callback;
    },
    stop() {},
  }));
  const { host, renderer } = await setup(t, {
    project: "Project A",
    tasks: [
      { id: "a", title: "Task A", laneId: "todo", projectId: "project-a" },
      { id: "h1", title: "Hidden 1", laneId: "doing", projectId: "project-b" },
      { id: "b", title: "Task B", laneId: "doing", projectId: "project-a" },
      { id: "h2", title: "Hidden 2", laneId: "doing", projectId: "project-b" },
    ],
  });
  await moveTaskA(renderer);
  await act(async () =>
    host.replaceBoard(
      KanbanBoardSchema.parse({
        ...host.board,
        tasks: [
          { ...host.board.tasks[0], description: "External edit" },
          ...host.board.tasks.slice(1),
        ],
      }),
    ),
  );
  await act(async () => finish({ finished: true }));
  assert.deepEqual(
    host.board.tasks.map((task) => task.id),
    ["h1", "b", "a", "h2"],
  );
  assert.equal(
    host.board.tasks.find((task) => task.id === "a").description,
    "External edit",
  );
  await act(async () => t.mock.timers.tick(60));
  await chooseProject(renderer.root, "All Projects");
  assert.deepEqual(laneTitles(renderer, "Doing"), [
    "Mark Hidden 1 complete",
    "Mark Task B complete",
    "Mark Task A complete",
    "Mark Hidden 2 complete",
  ]);
});

test("拖入完成泳道保留原归属且不可内部重排，拖出按可见槽位恢复；保存失败回滚并可重试", async (t) => {
  const { host, renderer } = await setup(t);
  host.failNextSave(new Error("Disk full"));
  await moveTaskA(renderer);
  assert.equal(host.board.tasks.find((task) => task.id === "a").laneId, "todo");
  assert.equal(host.notifications.length, 1);
  await act(async () => t.mock.timers.tick(60));

  await moveTaskA(renderer, { toX: 660 });
  assert.deepEqual(laneTitles(renderer, "Finished"), [
    "Mark Task A incomplete",
  ]);
  assert.equal(host.board.tasks.find((task) => task.id === "a").laneId, "todo");
  const completed = host.board;
  await act(async () => {
    t.mock.timers.tick(60);
    card(renderer, "Task A").props.onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width: 280, height: 64 } },
    });
  });
  await moveTaskA(renderer, { fromX: 660, toX: 680 });
  assert.equal(host.board, completed);
  await act(async () => t.mock.timers.tick(60));
  await moveTaskA(renderer, { fromX: 660, toX: 340, toY: 60 });
  assert.deepEqual(laneTitles(renderer, "Finished"), []);
  assert.deepEqual(laneTitles(renderer, "Doing"), [
    "Mark Task A complete",
    "Mark Task B complete",
  ]);
});

test("落位动画中断、界外释放、手势取消或卸载均不产生写入，且隔离迟到回调", async (t) => {
  for (const scenario of ["interrupted", "outside", "cancel", "unmount"]) {
    await t.test(scenario, async (t) => {
      const completions = [];
      t.mock.method(mockReactNative.Animated, "parallel", () => ({
        start: (callback) => completions.push(callback),
        stop() {},
      }));
      const { host, renderer } = await setup(t);
      const initial = structuredClone(host.board);
      await moveTaskA(renderer, scenario === "outside" ? { toX: 1100 } : {});
      if (scenario === "unmount") {
        await act(async () => renderer.unmount());
      } else if (scenario === "cancel") {
        await act(async () =>
          card(renderer, "Task A")
            .findAllByType("View")
            .find((node) => node.props.onPanResponderTerminate)
            .props.onPanResponderTerminate(),
        );
      }
      await act(async () => {
        completions[0]({ finished: scenario !== "interrupted" });
        t.mock.timers.tick(60);
      });
      assert.deepEqual(host.board, initial);
      const activeRenderer =
        scenario === "unmount" ? await mount(t, host) : renderer;
      if (scenario === "unmount") await measureBoard(activeRenderer);
      await moveTaskA(activeRenderer);
      await act(async () => completions[1]({ finished: true }));
      assert.deepEqual(laneTitles(activeRenderer, "Doing"), [
        "Mark Task B complete",
        "Mark Task A complete",
      ]);
    });
  }
});

test("卡片边界迟滞区防抖、横纵滚动动态更新命中槽位并在非法区域释放时取消提交", async () => {
  const requests = [];
  const controller = new KanbanDragController({
    lanes: ["to-plan", "in-progress"],
    onReorderTask: (...args) => requests.push(args),
  });
  controller.registerContainerBounds({ x: 20, y: 80, width: 800, height: 600 });
  controller.registerLaneLayout("to-plan", {
    x: 10,
    y: 10,
    width: 280,
    height: 550,
  });
  controller.registerLaneLayout("in-progress", {
    x: 304,
    y: 10,
    width: 280,
    height: 550,
  });
  controller.setLaneCardOrder("to-plan", ["task-1"]);
  controller.registerCardLayout("to-plan", "task-1", {
    x: 10,
    y: 20,
    width: 260,
    height: 60,
  });
  controller.setLaneCardOrder("in-progress", ["card-a", "card-b"]);
  controller.registerCardLayout("in-progress", "card-a", {
    x: 10,
    y: 20,
    width: 260,
    height: 60,
  });
  controller.registerCardLayout("in-progress", "card-b", {
    x: 10,
    y: 90,
    width: 260,
    height: 60,
  });

  controller.handlePointerDown(
    { taskId: "task-1", laneId: "to-plan" },
    { x: 70, y: 130 },
    "handle",
  );
  for (const [y, index] of [
    [110, 0],
    [200, 1],
    [240, 1],
    [260, 2],
    [240, 2],
    [210, 1],
  ]) {
    controller.handlePointerMove({ x: 340, y });
    assert.equal(controller.getFeedback().targetIndex, index, `y=${y}`);
  }
  await controller.handlePointerUp();
  assert.deepEqual(requests, [["task-1", "in-progress", 1]]);

  // Releasing in inter-lane gap does not submit
  const gapController = new KanbanDragController({
    lanes: ["to-plan", "in-progress"],
    onReorderTask: (...args) => requests.push(args),
  });
  gapController.registerContainerBounds({
    x: 20,
    y: 80,
    width: 800,
    height: 600,
  });
  gapController.registerLaneLayout("to-plan", {
    x: 10,
    y: 10,
    width: 280,
    height: 550,
  });
  gapController.registerLaneLayout("in-progress", {
    x: 304,
    y: 10,
    width: 280,
    height: 550,
  });
  gapController.setLaneCardOrder("to-plan", ["task-1"]);
  gapController.registerCardLayout("to-plan", "task-1", {
    x: 10,
    y: 0,
    width: 260,
    height: 64,
  });
  requests.length = 0;
  gapController.handlePointerDown(
    { taskId: "task-1", laneId: "to-plan" },
    { x: 70, y: 130 },
    "handle",
  );
  gapController.handlePointerMove({ x: 318, y: 130 });
  const drop = await gapController.beginDropAnimation({ x: 318, y: 130 });
  assert.equal(drop.isDrop, false);
  await gapController.reportDropComplete(drop.operationId);
  assert.deepEqual(requests, []);
});
