/**
 * Real React hook/card lifecycles with simulated native responders and layout.
 * Connected board-level persistence lives in kanban-board-drag.test.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { useKanbanDrag } from "../client/kanban-drag.ts";
import {
  React,
  TestRenderer,
  act,
  loadClientComponent,
} from "./helpers/react-host-env.mjs";

const KanbanCard = loadClientComponent("kanban-card", "KanbanCard");
const theme = { colors: {} };
const nativePanResponder = {
  create: (handlers) => ({ panHandlers: handlers }),
};
const event = { nativeEvent: { pageX: 120, pageY: 20, button: 0 } };
const press = { x0: 120, y0: 20, moveX: 0, moveY: 0, dx: 0, dy: 0 };

function cardBodyProps(node) {
  if (node?.props?.onPanResponderGrant) return node.props;
  for (const child of node?.children ?? []) {
    if (typeof child !== "object" || child === null) continue;
    const found = cardBodyProps(child);
    if (found) return found;
  }
  return null;
}

function mockTimers(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
}

function mountCards(
  t,
  {
    ids = ["1", "2", "3"],
    onReorderTask,
    onPress,
    lanes = ["lane"],
    viewportWidth = lanes.length * 320,
  } = {},
) {
  let drag;
  let currentIds = ids;
  function Board({ ids }) {
    drag = useKanbanDrag({ lanes, onReorderTask });
    const lane = drag.bindLane("lane");
    return React.createElement(
      "View",
      null,
      ids.map((id) =>
        React.createElement(KanbanCard, {
          key: id,
          task: { id, laneId: "lane", title: id, subtasks: [] },
          projectDisplayName: null,
          theme,
          layout: { compact: false },
          binding: lane.bindCard(
            id,
            onPress && (() => onPress(id)),
            nativePanResponder,
          ),
        }),
      ),
    );
  }
  const element = () => React.createElement(Board, { ids: currentIds });
  let root;
  act(() => {
    root = TestRenderer.create(element());
  });
  t.after(() => act(() => root.unmount()));
  const controller = drag.controller;
  controller.registerContainerBounds({
    x: 0,
    y: 0,
    width: viewportWidth,
    height: 600,
  });
  lanes.forEach((lane, index) =>
    controller.registerLaneLayout(lane, {
      x: index * 320,
      y: 0,
      width: 300,
      height: 600,
    }),
  );
  controller.setLaneCardOrder("lane", ids);
  root.toJSON().children.forEach((card, index) =>
    card.props.onLayout({
      nativeEvent: { layout: { x: 0, y: index * 80, width: 280, height: 64 } },
    }),
  );
  return {
    root,
    controller,
    get drag() {
      return drag;
    },
    card: (id) => root.toJSON().children[currentIds.indexOf(id)],
    handlers: (id, source = "body") =>
      source === "body"
        ? cardBodyProps(root.toJSON().children[currentIds.indexOf(id)])
        : root.root.findAllByProps({ accessibilityRole: "button" })[
            currentIds.indexOf(id)
          ].props,
    update: (ids = currentIds) => {
      currentIds = ids;
      act(() => {
        root.update(element());
        controller.setLaneCardOrder("lane", ids);
      });
    },
    unmount: () => act(() => root.unmount()),
  };
}

async function release(board, id, gesture = press, source = "body") {
  await act(async () => {
    await board.handlers(id, source).onPanResponderRelease(event, gesture);
  });
}

async function commit(board) {
  await act(async () => {
    await board.drag.commitDrop();
  });
}

test("moving a mouse-held card into another lane auto-scrolls at the viewport edge, submits that lane, and restores the source", async (t) => {
  mockTimers(t);
  const reorders = [];
  const scrolledOffsets = [];
  const board = mountCards(t, {
    ids: ["task"],
    lanes: ["lane", "other"],
    viewportWidth: 360,
    onReorderTask: (...args) => reorders.push(args),
  });
  board.drag.bindContainerRef({
    scrollTo: ({ x }) => {
      assert.ok(
        x >= 0 && x <= 640 - 360,
        "scroll stays within content overflow",
      );
      scrolledOffsets.push(x);
    },
  });
  act(() => {
    board.handlers("task").onPanResponderGrant(event, { x0: 120, y0: 20 });
  });
  for (const [x, direction] of [
    [345, 1],
    [180, 0],
    [15, -1],
    [180, 0],
    [345, 1],
  ]) {
    const previousOffset = scrolledOffsets.at(-1) ?? 0;
    const previousCount = scrolledOffsets.length;
    act(() =>
      board
        .handlers("task")
        .onPanResponderMove(event, { moveX: x, moveY: 240 }),
    );
    act(() => t.mock.timers.tick(32));
    if (direction === 0) {
      assert.equal(
        scrolledOffsets.length,
        previousCount,
        "center stops scrolling",
      );
    } else {
      assert.equal(
        Math.sign(scrolledOffsets.at(-1) - previousOffset),
        direction,
        `pointer x=${x} scrolls in the expected direction`,
      );
    }
  }
  assert.equal(board.drag.bindLane("other").isHovered, true);
  assert.equal(board.card("task").props.style.opacity, 0);
  await release(board, "task");
  await commit(board);
  assert.deepEqual(reorders, [["task", "other", 0]]);
  assert.equal(board.card("task").props.style?.opacity ?? 1, 1);
});

test("stationary click and slight mouse jitter select the task exactly once without requesting reorder", async (t) => {
  const clicks = [];
  const reorders = [];
  const board = mountCards(t, {
    ids: ["task"],
    onPress: (id) => clicks.push(id),
    onReorderTask: (...args) => reorders.push(args),
  });
  const mouse = { nativeEvent: { ...event.nativeEvent, touches: [{}] } };
  for (const jitter of [0, 3]) {
    act(() => {
      board
        .handlers("task")
        .onPointerDown({ nativeEvent: { pointerType: "mouse" } });
      board.handlers("task").onPanResponderGrant(mouse, press);
      if (jitter)
        board.handlers("task").onPanResponderMove(event, {
          ...press,
          moveX: 120 + jitter,
          moveY: 20,
          dx: jitter,
        });
    });
    await release(board, "task");
    assert.equal(clicks.length, jitter ? 2 : 1);
    assert.equal(board.drag.isDragLocked(), false);
  }
  assert.deepEqual(clicks, ["task", "task"]);
  assert.deepEqual(reorders, []);
});

test("native and web touch taps select once, quick swipes scroll, and long presses lift before claiming", async (t) => {
  mockTimers(t);
  for (const { nativeEvent, pointerType } of [
    {
      nativeEvent: {
        pageX: 120,
        pageY: 20,
        touches: [{ pageX: 120, pageY: 20 }],
      },
    },
    { nativeEvent: { pageX: 120, pageY: 20, pointerType: "touch" } },
    { nativeEvent: { pageX: 120, pageY: 20 }, pointerType: "touch" },
  ]) {
    const selections = [];
    const requests = [];
    const board = mountCards(t, {
      ids: ["task"],
      onPress: (id) => selections.push(id),
      onReorderTask: (...args) => requests.push(args),
    });
    const touch = { nativeEvent };
    const handlers = () => board.handlers("task");
    act(() => {
      if (pointerType)
        handlers().onPointerDown({ nativeEvent: { pointerType } });
      handlers().onTouchStart(touch);
    });
    await act(async () => handlers().onTouchEnd(touch));
    assert.deepEqual(selections, ["task"]);
    act(() => {
      handlers().onTouchStart(touch);
      handlers().onTouchMove({ nativeEvent: { ...nativeEvent, pageY: 40 } });
      t.mock.timers.tick(300);
    });
    assert.equal(board.card("task").props.style?.opacity ?? 1, 1);
    await act(async () => handlers().onTouchEnd(touch));
    assert.deepEqual(selections, ["task"]);
    assert.deepEqual(requests, []);

    act(() => {
      handlers().onTouchStart(touch);
      t.mock.timers.tick(220);
    });
    assert.equal(board.card("task").props.style.opacity, 0);
    act(() => {
      handlers().onPanResponderGrant(
        { nativeEvent: { ...nativeEvent, pageY: 35 } },
        { x0: 120, y0: 35 },
      );
      handlers().onPanResponderMove(touch, { moveX: 120, moveY: 50 });
    });
    await release(board, "task");
    await commit(board);
    assert.deepEqual(requests, [["task", "lane", 0]]);
    assert.deepEqual(selections, ["task"]);
    board.unmount();
  }
});
