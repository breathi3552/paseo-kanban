/**
 * Real React hook/card lifecycles with simulated native responders and layout.
 * Paseo acceptance still verifies native scrolling and animation timing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { useKanbanDrag } from "../client/kanban-drag.ts";
import {
  React,
  TestRenderer,
  act,
  loadClientComponent,
  instrumentControllerSubscriptions,
  mockReactNative,
} from "./helpers/react-host-env.mjs";

const KanbanCard = loadClientComponent("kanban-card", "KanbanCard");
const theme = { colors: {} };
const nativePanResponder = {
  create: (handlers) => ({ panHandlers: handlers }),
};
const event = { nativeEvent: { pageX: 120, pageY: 240, button: 0 } };
const press = { x0: 120, y0: 240, moveX: 0, moveY: 0, dx: 0, dy: 0 };

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
  // React act uses setImmediate to flush work; leave that scheduler real.
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
}

function mountCards(
  t,
  {
    ids = ["1", "2", "3"],
    onReorderTask,
    onPress,
    getTaskPreview,
    strict = false,
    lanes = ["lane"],
  } = {},
) {
  let drag;
  let renders = 0;
  let currentIds = ids;
  function Board({ ids }) {
    renders++;
    drag = useKanbanDrag({ lanes, onReorderTask, getTaskPreview });
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
  const element = () => {
    const board = React.createElement(Board, { ids: currentIds });
    return strict ? React.createElement(React.StrictMode, null, board) : board;
  };
  let root;
  act(() => {
    root = TestRenderer.create(element());
  });
  t.after(() => act(() => root.unmount()));
  const controller = drag.controller;
  controller.registerContainerBounds({
    x: 0,
    y: 0,
    width: lanes.length * 320,
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
  // Layout enters through the real mounted card, not controller internals.
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
    get renders() {
      return renders;
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

test("rerendered cards keep geometry; mouse dragging hides only the source through drop and submits the previewed slot", async (t) => {
  mockTimers(t);
  const reorders = [];
  const board = mountCards(t, {
    onReorderTask: (...args) => reorders.push(args),
  });
  board.update(); // New bindings must not unregister the still-mounted cards.
  const start = { x0: 100, y0: 20 };
  act(() => board.handlers("1").onPanResponderGrant(event, start));
  for (const [y, expectedIndex] of [
    [20, 0],
    [150, 1],
    [300, 2],
  ]) {
    act(() =>
      board.handlers("1").onPanResponderMove(event, { moveX: 100, moveY: y }),
    );
    // The first move is stationary: long press lifts before selecting the first slot.
    if (y === 20) act(() => t.mock.timers.tick(260));
    assert.equal(
      board.drag.bindLane("lane").targetIndex,
      expectedIndex,
      `pointer y=${y}`,
    );
  }
  assert.deepEqual(board.card("1").props.style, {
    position: "absolute",
    left: 0,
    right: 0,
    opacity: 0,
  });
  assert.equal(board.card("2").props.style, undefined);
  const rendersAtSlot2 = board.renders;
  act(() => {
    board.handlers("1").onPanResponderMove(event, { moveX: 105, moveY: 310 });
    board.handlers("1").onPanResponderMove(event, { moveX: 115, moveY: 320 });
  });
  assert.equal(
    board.renders,
    rendersAtSlot2,
    "pointer moves within the same slot must not rerender the board",
  );
  act(() =>
    board.handlers("1").onPanResponderMove(event, { moveX: 100, moveY: 20 }),
  );
  await release(board, "1", { moveX: 0, moveY: 0 });
  assert.equal(
    board.card("1").props.style.opacity,
    0,
    "source remains hidden during drop",
  );
  assert.equal(board.drag.bindLane("lane").targetIndex, 0);
  await commit(board);
  assert.deepEqual(reorders, [["1", "lane", 0]]);
  assert.equal(
    board.card("1").props.style,
    undefined,
    "completed drop restores the card automatically",
  );
  act(() => t.mock.timers.tick(60));
  assert.equal(board.drag.isDragLocked(), false);
});

test("moving a mouse-held card into another lane auto-scrolls at the viewport edge, submits that lane, and restores the source", async (t) => {
  mockTimers(t);
  const reorders = [];
  const scrolledOffsets = [];
  const board = mountCards(t, {
    ids: ["task"],
    lanes: ["lane", "other"],
    onReorderTask: (...args) => reorders.push(args),
  });
  board.drag.bindContainerRef({
    scrollTo: ({ x }) => scrolledOffsets.push(x),
  });
  act(() => {
    board.handlers("task").onPanResponderGrant(event, { x0: 120, y0: 20 });
  });
  // Enter each edge from the center; observe the host scroll request, not velocity.
  for (const [x, direction] of [
    [605, 1],
    [320, 0],
    [30, -1],
    [320, 0],
    [605, 1],
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
  assert.equal(board.card("task").props.style, undefined);
});

test("stationary click and slight mouse jitter open details exactly once without reordering", async (t) => {
  const clicks = [];
  const reorders = [];
  const board = mountCards(t, {
    ids: ["task"],
    onPress: (id) => clicks.push(id),
    onReorderTask: (...args) => reorders.push(args),
  });
  for (const jitter of [0, 3]) {
    act(() => {
      board.handlers("task").onPanResponderGrant(event, press);
      if (jitter)
        board.handlers("task").onPanResponderMove(event, {
          ...press,
          moveX: 120 + jitter,
          moveY: 240,
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

for (const source of ["body", "handle"]) {
  test(`${source} release with zero responder coordinates drops at the recorded pointer and never opens details`, async (t) => {
    mockTimers(t);
    const reorders = [];
    const clicks = [];
    const board = mountCards(t, {
      ids: ["task"],
      onPress: (id) => clicks.push(id),
      onReorderTask: (...args) => reorders.push(args),
    });
    act(() => {
      board.handlers("task", source).onPanResponderGrant(event, press);
      if (source === "body") {
        board
          .handlers("task")
          .onPanResponderMove(event, { moveX: 140, moveY: 260 });
        board
          .handlers("task")
          .onPanResponderMove(event, { moveX: 120, moveY: 240 });
      }
    });
    await release(board, "task", press, source);
    assert.deepEqual(
      [board.drag.droppingState.releaseX, board.drag.droppingState.releaseY],
      [120, 240],
    );
    await commit(board);
    assert.deepEqual(reorders, [["task", "lane", 0]]);
    assert.deepEqual(clicks, []);
  });
}

test("long press lifts immediately, subsequent movement continues dragging, and responder cancellation restores the card", async (t) => {
  mockTimers(t);
  const reorders = [];
  const clicks = [];
  const board = mountCards(t, {
    ids: ["task"],
    onPress: (id) => clicks.push(id),
    onReorderTask: (...args) => reorders.push(args),
  });
  act(() => {
    board.handlers("task").onPanResponderGrant(event, press);
    t.mock.timers.tick(260);
  });
  assert.equal(
    board.card("task").props.style.opacity,
    0,
    "long press lifts without movement",
  );
  act(() =>
    board
      .handlers("task")
      .onPanResponderMove(event, { moveX: 130, moveY: 260 }),
  );
  assert.deepEqual(
    [board.drag.feedback.pointerX, board.drag.feedback.pointerY],
    [130, 260],
  );
  act(() => {
    board.handlers("task").onPanResponderTerminate();
    t.mock.timers.tick(60);
  });
  assert.equal(board.card("task").props.style, undefined);
  assert.equal(board.drag.isDragLocked(), false);
  assert.deepEqual(reorders, []);
  assert.deepEqual(clicks, []);
});

for (const finished of [true, false]) {
  test(`drop animation ${finished ? "arrives at the slot, keeps the preview while saving, and saves once" : "is interrupted and restores the card without saving"}`, async (t) => {
    mockTimers(t);
    const reorders = [];
    let finishSave;
    const saving = new Promise((resolve) => {
      finishSave = resolve;
    });
    const board = mountCards(t, {
      ids: ["task"],
      getTaskPreview: () => ({
        task: { id: "task", title: "Dynamic Drop Preview", subtasks: [] },
        projectDisplayName: "Test Project",
      }),
      onReorderTask: (...args) => {
        reorders.push(args);
        return saving;
      },
    });
    board.drag.registerCardsViewportLayout("lane", {
      x: 12,
      y: 0,
      width: 280,
      height: 600,
    });
    act(() => {
      board
        .handlers("task", "handle")
        .onPanResponderGrant(event, { x0: 120, y0: 20 });
      board
        .handlers("task", "handle")
        .onPanResponderMove(event, { moveX: 120, moveY: 240 });
    });
    await release(board, "task", press, "handle");
    // Replace only the native clock: finishing still applies the real animation targets.
    let finishAnimation;
    const Overlay = loadClientComponent("kanban-overlay", "KanbanDragOverlay", {
      "react-native": {
        ...mockReactNative,
        Animated: {
          ...mockReactNative.Animated,
          parallel: (animations) => ({
            start: (callback) => {
              finishAnimation = () => {
                if (finished)
                  animations.forEach((animation) => animation.start());
                callback({ finished });
              };
            },
          }),
        },
      },
    });
    let root;
    act(() => {
      root = TestRenderer.create(
        React.createElement(Overlay, {
          drag: board.drag,
          theme,
          layout: { compact: false },
        }),
      );
    });
    t.after(() => act(() => root.unmount()));
    const position = () => {
      const transform = root.toJSON().props.style[1].transform;
      return [transform[0].translateX._value, transform[1].translateY._value];
    };
    assert.deepEqual(
      position(),
      [12, 220],
      "preview starts at the release point with the original grab offset",
    );
    const texts = root.root
      .findAllByType("Text")
      .flatMap((node) => node.children);
    assert.ok(texts.includes("Dynamic Drop Preview"));
    assert.ok(texts.includes("Test Project"));
    assert.equal(board.card("task").props.style.opacity, 0);
    assert.deepEqual(reorders, [], "no save before animation completes");

    await act(async () => {
      finishAnimation();
      finishAnimation(); // A repeated native completion must not save twice.
    });
    assert.deepEqual(reorders, finished ? [["task", "lane", 0]] : []);
    if (finished) {
      assert.deepEqual(
        position(),
        [12, 0],
        "preview arrives at the card slot with its 12px content inset",
      );
      assert.equal(
        board.card("task").props.style.opacity,
        0,
        "source stays hidden while saving",
      );
    }
    await act(async () => {
      finishSave();
      await saving;
    });
    assert.equal(root.toJSON(), null);
    assert.equal(board.card("task").props.style, undefined);
    act(() => t.mock.timers.tick(60));
    assert.equal(board.drag.isDragLocked(), false);
  });
}

test("unmounting a pending card prevents a late long press; removing another card leaves the active drag usable", async (t) => {
  mockTimers(t);
  const reorders = [];
  const clicks = [];
  const board = mountCards(t, {
    ids: ["1", "2"],
    onPress: (id) => clicks.push(id),
    onReorderTask: (...args) => reorders.push(args),
  });
  act(() => {
    board.handlers("1").onPanResponderGrant(event, press);
    t.mock.timers.tick(100);
  });
  board.update(["2"]);
  act(() => t.mock.timers.tick(200));
  assert.equal(board.drag.feedback.isDragging, false);
  assert.equal(board.drag.isDragLocked(), false);
  assert.deepEqual(clicks, []);
  assert.deepEqual(reorders, []);

  board.update(["1", "2"]);
  act(() => {
    board.handlers("1").onPanResponderGrant(event, press);
    t.mock.timers.tick(260);
  });
  board.update(["1"]);
  assert.equal(
    board.card("1").props.style.opacity,
    0,
    "other card's unmount must not cancel this drag",
  );
  act(() =>
    board.handlers("1").onPanResponderMove(event, { moveX: 120, moveY: 150 }),
  );
  await release(board, "1");
  await commit(board);
  assert.deepEqual(reorders, [["1", "lane", 0]]);
});

test("board unmount cancels pending gestures and unfinished drops, including late repeated completion", async (t) => {
  mockTimers(t);
  const reorders = [];
  for (const phase of ["pending", "dropping"]) {
    const board = mountCards(t, {
      ids: ["task"],
      onReorderTask: (...args) => reorders.push(args),
    });
    const tracker = instrumentControllerSubscriptions(board.controller);
    board.update(); // React resubscribes through the observed public methods.
    act(() => board.handlers("task").onPanResponderGrant(event, press));
    let operationId;
    if (phase === "dropping") {
      act(() => t.mock.timers.tick(260));
      await release(board, "task");
      operationId = board.drag.droppingState.operationId;
    }
    tracker.markUnmounted();
    board.unmount();
    const renders = board.renders;
    await act(async () => {
      t.mock.timers.tick(350);
      if (operationId) {
        await board.controller.reportDropComplete(operationId);
        await board.controller.reportDropComplete(operationId);
      }
      board.controller.startGesture("task", "lane", 120, 240, true);
      board.controller.cancelGesture();
      t.mock.timers.tick(60);
    });
    assert.deepEqual(
      tracker.cleanupsCalled,
      { subscribe: 1, subscribeSlot: 1, subscribeDrop: 1 },
      phase,
    );
    assert.equal(tracker.leakedDispatchesAfterUnmount, 0, phase);
    assert.equal(board.renders, renders, phase);
    assert.equal(board.controller.isDragLocked(), false, phase);
  }
  assert.deepEqual(reorders, []);
});

test("saving after board unmount does not revive its state or notify abandoned subscriptions", async (t) => {
  mockTimers(t);
  let resolveSave;
  const saved = new Promise((resolve) => {
    resolveSave = resolve;
  });
  const reorders = [];
  const board = mountCards(t, {
    ids: ["task"],
    onReorderTask: (...args) => {
      reorders.push(args);
      return saved;
    },
  });
  act(() => board.handlers("task", "handle").onPanResponderGrant(event, press));
  await release(board, "task", press, "handle");
  let completion;
  act(() => {
    completion = board.drag.commitDrop();
  });
  assert.deepEqual(reorders, [["task", "lane", 0]]);
  board.unmount();
  let notifications = 0;
  board.controller.subscribe(() => notifications++);
  board.controller.subscribeDrop(() => notifications++);
  await act(async () => {
    resolveSave();
    await completion;
    t.mock.timers.tick(100);
  });
  assert.equal(notifications, 0);
  assert.equal(board.controller.isDragLocked(), false);
  assert.equal(board.controller.getFeedback().isDragging, false);
  assert.equal(board.controller.getDroppingState(), null);
});

test("StrictMode lifecycle replay and a fresh remount both allow long press and drop", async (t) => {
  mockTimers(t);
  const reorders = [];
  for (const id of ["1", "2"]) {
    const board = mountCards(t, {
      ids: ["1", "2"],
      strict: true,
      onReorderTask: (...args) => reorders.push(args),
    });
    act(() => {
      board.handlers(id).onPanResponderGrant(event, press);
      t.mock.timers.tick(260);
    });
    assert.equal(
      board.card(id).props.style.opacity,
      0,
      `StrictMode mount: ${id}`,
    );
    await release(board, id);
    await commit(board);
    act(() => t.mock.timers.tick(60));
    assert.equal(board.card(id).props.style, undefined);
    assert.equal(board.drag.isDragLocked(), false);
    board.unmount();
  }
  assert.deepEqual(reorders, [
    ["1", "lane", 1],
    ["2", "lane", 1],
  ]);
});
test("card gestures preview one matching-height slot, animate displacement, and save the displayed position", async (t) => {
  mockTimers(t);
  const animations = [];
  const Lane = loadClientComponent("kanban-lane", "KanbanLaneView", {
    "react-native": {
      ...mockReactNative,
      Animated: {
        ...mockReactNative.Animated,
        timing: (value, config) => ({
          start: (callback) =>
            animations.push(() => {
              value.setValue(config.toValue);
              callback?.({ finished: true });
            }),
        }),
      },
    },
    "./use-projects": { getProjectDisplayName: () => null },
  });
  const equalCards = [
    ["1", 0, 64],
    ["2", 72, 64],
    ["3", 144, 64],
  ];
  for (const {
    name,
    cards = equalCards,
    id,
    compact = false,
    steps,
    dropY,
    followUp,
  } of [
    {
      name: "first card moves through middle and last slots",
      id: "1",
      steps: [
        [20, ["slot", "2", "3"]],
        [100, ["2", "slot", "3"]],
        [220, ["2", "3", "slot"]],
      ],
      dropY: 144,
    },
    {
      name: "middle card in compact layout",
      id: "2",
      compact: true,
      steps: [[90, ["1", "slot", "3"]]],
      dropY: 72,
    },
    {
      name: "last card moves upward and second drag uses reflowed card positions without re-layout",
      id: "3",
      steps: [
        [170, ["1", "2", "slot"]],
        [20, ["slot", "1", "2"]],
      ],
      dropY: 0,
      followUp: {
        id: "2",
        steps: [
          [180, ["3", "1", "slot"]],
          [90, ["3", "slot", "1"]],
        ],
        fromY: 54,
        dropY: 72,
      },
    },
    {
      name: "short card waits until it crosses the taller replacement",
      cards: [
        ["1", 0, 50],
        ["2", 58, 116],
        ["3", 182, 76],
      ],
      id: "1",
      compact: true,
      steps: [
        [25, ["slot", "2", "3"]],
        [70, ["slot", "2", "3"]],
        [135, ["2", "slot", "3"]],
      ],
      dropY: 124,
      followUp: {
        id: "1",
        steps: [
          [150, ["2", "slot", "3"]],
          [215, ["2", "3", "slot"]],
        ],
        fromY: 189,
        dropY: 208,
      },
    },
    {
      name: "tall card lands immediately after the shorter replacement",
      cards: [
        ["1", 0, 116],
        ["2", 124, 50],
        ["3", 182, 50],
      ],
      id: "1",
      steps: [
        [15, ["slot", "2", "3"]],
        [65, ["2", "slot", "3"]],
      ],
      dropY: 58,
    },
  ]) {
    await t.test(name, async () => {
      const requests = [];
      const tasks = cards.map(([id]) => ({
        id,
        laneId: "lane",
        title: id,
        subtasks: [],
        projectId: null,
      }));
      let drag;
      function Board() {
        const [boardTasks, setBoardTasks] = React.useState(tasks);
        drag = useKanbanDrag({
          lanes: ["lane"],
          onReorderTask: (taskId, targetLaneId, targetIndex) => {
            requests.push([taskId, targetLaneId, targetIndex]);
            setBoardTasks((prev) => {
              const moving = prev.find((item) => item.id === taskId);
              const rest = prev.filter((item) => item.id !== taskId);
              rest.splice(targetIndex, 0, moving);
              return rest;
            });
          },
        });
        return React.createElement(Lane, {
          lane: { id: "lane", title: "Lane" },
          tasks: boardTasks,
          projects: [],
          theme,
          layout: { compact, platform: "web" },
          dragBinding: drag.bindLane("lane"),
          onAddTask: () => {},
          onManageLane: () => {},
          onSelectTask: () => {},
        });
      }
      let root;
      act(() => {
        root = TestRenderer.create(React.createElement(Board));
      });
      try {
        drag.controller.registerContainerBounds({
          x: 0,
          y: 0,
          width: 300,
          height: 600,
        });
        const lane = root.root
          .findAllByType("View")
          .find(
            (node) => node.props.onLayout && Array.isArray(node.props.style),
          );
        const scroll = root.root.findByType("ScrollView");
        const cardNodes = () =>
          scroll.findAll((node) => node.props.task && node.props.binding);
        const handle = (taskId = id) =>
          cardNodes()
            .find((node) => node.props.task.id === taskId)
            .findByProps({ accessibilityRole: "button" }).props;
        const runGesture = async ({
          taskId,
          gestureSteps,
          expectedFromY,
          expectedDropY,
        }) => {
          const priorRequests = requests.length;
          act(() => {
            handle(taskId).onPanResponderGrant(event, {
              x0: 100,
              y0: gestureSteps[0][0],
            });
          });

          for (const [index, [y, expected]] of gestureSteps.entries()) {
            if (index > 0)
              act(() =>
                handle(taskId).onPanResponderMove(event, {
                  moveX: 100,
                  moveY: y,
                }),
              );
            const mountedCards = cardNodes();
            const visible = [];
            for (const node of scroll.findAll(
              (node) =>
                (node.type === "AnimatedView" && node.props.onLayout) ||
                mountedCards.includes(node),
            )) {
              if (node.type === "AnimatedView") {
                assert.equal(
                  node.props.style[1].height._value,
                  cards.find(([cardId]) => cardId === taskId)[2],
                  "slot starts at the full lifted card height",
                );
                visible.push("slot");
              } else if (
                node.findAllByType("View")[0].props.style?.opacity !== 0
              ) {
                visible.push(
                  node
                    .findAllByType("Text")
                    .flatMap((text) => text.children)
                    .find((text) => ["1", "2", "3"].includes(text)),
                );
              }
            }
            assert.deepEqual(visible, expected, `pointer y=${y}`);
            if (cards === equalCards && taskId === "1" && index === 1) {
              const translations = scroll
                .findAllByType("AnimatedView")
                .map((node) => node.props.style[1].transform?.[0].translateY)
                .filter(Boolean);
              assert.deepEqual(
                translations.map((value) => value._value).sort((a, b) => a - b),
                [-72, 72],
              );
              act(() => animations.splice(0).forEach((finish) => finish()));
              assert.deepEqual(
                translations.map((value) => value._value),
                [0, 0],
                "slot and displaced card settle into place",
              );
            } else {
              act(() => animations.splice(0).forEach((finish) => finish()));
            }
          }
          await act(async () =>
            handle(taskId).onPanResponderRelease(event, {
              ...press,
              moveX: 100,
              moveY: gestureSteps.at(-1)[0],
            }),
          );
          assert.equal(
            requests.length,
            priorRequests,
            "release waits for drop animation",
          );
          if (expectedFromY !== undefined) {
            assert.equal(
              drag.droppingState.fromY,
              expectedFromY,
              "drop animation starts from grab-anchored card position",
            );
          }
          assert.deepEqual(
            [drag.droppingState.toX, drag.droppingState.toY],
            [0, expectedDropY],
            "drop animation targets the displayed slot, excluding the lifted card's old height",
          );
          await act(async () => drag.commitDrop());
          assert.deepEqual(requests.at(-1), [
            taskId,
            "lane",
            gestureSteps.at(-1)[1].indexOf("slot"),
          ]);
        };

        act(() => {
          lane.props.onLayout({
            nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 600 } },
          });
          scroll.props.onLayout({
            nativeEvent: { layout: { x: 0, y: 0, width: 280, height: 500 } },
          });
          cardNodes().forEach((card, index) =>
            card.findAllByType("View")[0].props.onLayout({
              nativeEvent: {
                layout: {
                  x: 0,
                  y: cards[index][1],
                  width: 280,
                  height: cards[index][2],
                },
              },
            }),
          );
        });

        await runGesture({
          taskId: id,
          gestureSteps: steps,
          expectedDropY: dropY,
        });

        if (followUp) {
          act(() => t.mock.timers.tick(60));
          await runGesture({
            taskId: followUp.id,
            gestureSteps: followUp.steps,
            expectedFromY: followUp.fromY,
            expectedDropY: followUp.dropY,
          });
        }
      } finally {
        act(() => root.unmount());
      }
    });
  }
});
