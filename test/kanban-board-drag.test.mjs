import test from "node:test";
import assert from "node:assert/strict";
import { act } from "./helpers/react-host-env.mjs";
import { createHost, mount, text } from "./helpers/kanban-host.mjs";
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
  let node = renderer.root.findByProps({
    accessibilityLabel: `Mark ${title} complete`,
  });
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

async function setup(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  const host = createHost({
    board: KanbanBoardSchema.parse({
      lanes: [
        { id: "todo", title: "Todo", isCompletionLane: false },
        { id: "doing", title: "Doing", isCompletionLane: false },
        { id: "done", title: "Finished", isCompletionLane: true },
      ],
      tasks: [
        { id: "a", title: "Task A", laneId: "todo" },
        { id: "b", title: "Task B", laneId: "doing" },
      ],
    }),
  });
  const renderer = await mount(t, host);
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
  return { host, renderer };
}

async function moveTaskA(renderer) {
  const body = card(renderer, "Task A")
    .findAllByType("View")
    .find((node) => node.props.onPanResponderGrant);
  const event = { nativeEvent: { pointerType: "mouse", pageX: 20, pageY: 70 } };
  await act(async () => {
    body.props.onPanResponderGrant(event, {
      x0: 20,
      y0: 70,
      dx: 0,
      dy: 0,
    });
    body.props.onPanResponderMove(
      { nativeEvent: { pointerType: "mouse", pageX: 340, pageY: 180 } },
      { moveX: 340, moveY: 180, dx: 320, dy: 110 },
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
