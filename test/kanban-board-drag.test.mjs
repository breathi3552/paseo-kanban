import test from "node:test";
import assert from "node:assert/strict";
import { act, mockReactNative } from "./helpers/react-host-env.mjs";
import {
  createHost,
  mount,
  text,
  chooseProject,
} from "./helpers/kanban-host.mjs";
import { KanbanBoardSchema } from "../shared/kanban.ts";

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

test("真实看板拖拽经落位动画持久化目标次序，保存完成后展示新泳道", async (t) => {
  const { host, renderer } = await setup(t);
  const saved = Promise.withResolvers();
  host.holdSave(saved.promise);
  await moveTaskA(renderer);
  assert.equal(host.board.tasks.find((task) => task.id === "a").laneId, "todo");
  await act(async () => saved.resolve());
  assert.deepEqual(
    host.board.tasks
      .filter((task) => task.laneId === "doing")
      .map((task) => task.id),
    ["b", "a"],
  );
  assert.deepEqual(laneTitles(renderer, "Todo"), []);
  assert.deepEqual(laneTitles(renderer, "Doing"), [
    "Mark Task B complete",
    "Mark Task A complete",
  ]);
  assert.deepEqual(host.notifications, []);
});

test("旧落位动画的重复回调不能提前提交下一次拖拽", async (t) => {
  const completions = [];
  t.mock.method(mockReactNative.Animated, "parallel", () => ({
    start: (callback) => completions.push(callback),
    stop() {},
  }));
  const { host, renderer } = await setup(t);
  await moveTaskA(renderer);
  await act(async () => t.mock.timers.tick(10_000));
  assert.equal(host.board.tasks.find((task) => task.id === "a").laneId, "todo");
  assert.deepEqual(laneTitles(renderer, "Todo"), ["Mark Task A complete"]);
  assert.equal(renderer.root.findAllByType("Select")[0].props.disabled, true);
  await act(async () => completions[0]({ finished: true }));
  assert.equal(
    host.board.tasks.find((task) => task.id === "a").laneId,
    "doing",
  );
  await act(async () => t.mock.timers.tick(60));

  await moveTaskA(renderer, { fromX: 340, toX: 20 });
  await act(async () => completions[0]({ finished: true }));
  assert.equal(
    host.board.tasks.find((task) => task.id === "a").laneId,
    "doing",
  );
  await act(async () => completions[1]({ finished: true }));
  assert.deepEqual(laneTitles(renderer, "Todo"), ["Mark Task A complete"]);
  assert.deepEqual(laneTitles(renderer, "Doing"), ["Mark Task B complete"]);
  assert.deepEqual(host.notifications, []);
});

test("落位中断或无效释放不写入，解锁后可以再次拖拽", async (t) => {
  for (const scenario of ["interrupted", "outside"]) {
    await t.test(scenario, async (t) => {
      const completions = [];
      t.mock.method(mockReactNative.Animated, "parallel", () => ({
        start: (callback) => completions.push(callback),
        stop() {},
      }));
      const { host, renderer } = await setup(t);
      const initial = structuredClone(host.board);
      await moveTaskA(renderer, scenario === "outside" ? { toX: 1100 } : {});
      await act(async () =>
        completions[0]({ finished: scenario !== "interrupted" }),
      );
      await act(async () => t.mock.timers.tick(60));
      assert.deepEqual(host.board, initial);
      assert.equal(
        renderer.root.findAllByType("Select")[0].props.disabled,
        false,
      );
      await moveTaskA(renderer);
      await act(async () => completions[1]({ finished: true }));
      assert.deepEqual(laneTitles(renderer, "Doing"), [
        "Mark Task B complete",
        "Mark Task A complete",
      ]);
      assert.deepEqual(host.notifications, []);
    });
  }
});

test("释放固定槽位，落位提交使用宿主最新看板与版本而保留外部编辑", async (t) => {
  let finish;
  t.mock.method(mockReactNative.Animated, "parallel", () => ({
    start: (callback) => {
      finish = callback;
    },
    stop() {},
  }));
  const { host, renderer } = await setup(t);
  await moveTaskA(renderer);
  await act(async () =>
    host.replaceBoard(
      KanbanBoardSchema.parse({
        ...host.board,
        tasks: [
          { ...host.board.tasks[0], description: "External edit" },
          { id: "c", title: "Task C", laneId: "doing" },
          host.board.tasks[1],
        ],
      }),
    ),
  );
  await act(async () => finish({ finished: true }));
  assert.deepEqual(laneTitles(renderer, "Doing"), [
    "Mark Task C complete",
    "Mark Task A complete",
    "Mark Task B complete",
  ]);
  assert.equal(
    host.board.tasks.find((task) => task.id === "a").description,
    "External edit",
  );
  assert.deepEqual(host.notifications, []);
});

test("取消或卸载隔离迟到的动画回调，重新打开看板后仍可保存", async (t) => {
  for (const scenario of ["cancel", "unmount"]) {
    await t.test(scenario, async (t) => {
      const completions = [];
      t.mock.method(mockReactNative.Animated, "parallel", () => ({
        start: (callback) => completions.push(callback),
        stop() {},
      }));
      const { host, renderer } = await setup(t);
      const initial = structuredClone(host.board);
      await moveTaskA(renderer);
      if (scenario === "unmount") {
        await act(async () => renderer.unmount());
      } else {
        await act(async () =>
          card(renderer, "Task A")
            .findAllByType("View")
            .find((node) => node.props.onPanResponderTerminate)
            .props.onPanResponderTerminate(),
        );
      }
      await act(async () => {
        completions[0]({ finished: true });
        t.mock.timers.tick(60);
      });
      assert.deepEqual(host.board, initial);
      const reopened = scenario === "unmount" ? await mount(t, host) : renderer;
      if (scenario === "unmount") await measureBoard(reopened);
      await moveTaskA(reopened);
      await act(async () => completions[1]({ finished: true }));
      assert.deepEqual(laneTitles(reopened, "Doing"), [
        "Mark Task B complete",
        "Mark Task A complete",
      ]);
      assert.deepEqual(host.notifications, []);
    });
  }
});

test("项目筛选中的可见落点保留隐藏任务的相对次序", async (t) => {
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
  assert.deepEqual(laneTitles(renderer, "Doing"), [
    "Mark Task B complete",
    "Mark Task A complete",
  ]);
  assert.deepEqual(
    host.board.tasks.map((task) => task.id),
    ["h1", "b", "a", "h2"],
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

test("拖入完成保留普通归属，完成泳道不重排，拖出按可见槽位恢复", async (t) => {
  const { host, renderer } = await setup(t);
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
  assert.equal(
    host.board.tasks.find((task) => task.id === "a").laneId,
    "doing",
  );
  assert.deepEqual(host.notifications, []);
});

test("真实看板保存失败不移动任务，显示错误，下一次拖拽可成功保存", async (t) => {
  for (const failure of ["conflict", "exception"]) {
    await t.test(failure, async (t) => {
      const { host, renderer } = await setup(t);
      const initial = structuredClone(host.board);
      host.failNextSave(
        failure === "exception" ? new Error("Disk full") : undefined,
      );
      await moveTaskA(renderer);
      assert.deepEqual(host.board, initial);
      assert.deepEqual(laneTitles(renderer, "Todo"), ["Mark Task A complete"]);
      assert.deepEqual(laneTitles(renderer, "Doing"), ["Mark Task B complete"]);
      assert.equal(host.notifications.length, 1);
      assert.match(host.notifications[0], /move.*failed|failed.*move/i);
      assert.match(
        renderer.root.findAllByType("Text").map(text).join("\n"),
        /Save failed:/,
      );
      await act(async () => t.mock.timers.tick(60));
      await moveTaskA(renderer);
      assert.equal(
        host.board.tasks.find((task) => task.id === "a").laneId,
        "doing",
      );
      assert.deepEqual(laneTitles(renderer, "Doing"), [
        "Mark Task B complete",
        "Mark Task A complete",
      ]);
      assert.doesNotMatch(
        renderer.root.findAllByType("Text").map(text).join("\n"),
        /Save failed:/,
      );
      assert.equal(host.notifications.length, 1);
    });
  }
});
