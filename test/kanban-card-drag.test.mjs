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
  mockReactNative,
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
    viewportWidth = lanes.length * 320,
  } = {},
) {
  let drag;
  let currentIds = ids;
  function Board({ ids }) {
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
  // Enter each edge from the center; observe the host scroll request, not velocity.
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
  // React Native Web may expose emulated touches for a mouse contact.
  const mouse = { nativeEvent: { ...event.nativeEvent, touches: [{}] } };
  for (const jitter of [0, 3]) {
    act(() => {
      board
        .handlers("task")
        .onPointerDown({ nativeEvent: { pointerType: "mouse" } });
      assert.equal(
        board.handlers("task").onStartShouldSetPanResponderCapture(mouse),
        false,
      );
      assert.equal(
        board.handlers("task").onStartShouldSetPanResponder(mouse),
        true,
      );
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
      assert.equal(handlers().onStartShouldSetPanResponder(touch), false);
      handlers().onStartShouldSetPanResponderCapture(touch);
      handlers().onTouchStart(touch);
    });
    await act(async () => handlers().onTouchEnd(touch));
    assert.deepEqual(selections, ["task"]);
    act(() => {
      handlers().onStartShouldSetPanResponderCapture(touch);
      handlers().onTouchStart(touch);
      handlers().onTouchMove({ nativeEvent: { ...nativeEvent, pageY: 40 } });
      t.mock.timers.tick(300);
    });
    assert.equal(board.card("task").props.style?.opacity ?? 1, 1);
    assert.equal(handlers().onMoveShouldSetPanResponder(touch), false);
    await act(async () => handlers().onTouchEnd(touch));
    assert.deepEqual(selections, ["task"]);
    assert.deepEqual(requests, []);

    act(() => {
      handlers().onStartShouldSetPanResponderCapture(touch);
      handlers().onTouchStart(touch);
      t.mock.timers.tick(219);
    });
    assert.equal(board.card("task").props.style?.opacity ?? 1, 1);
    act(() => t.mock.timers.tick(1));
    assert.equal(board.card("task").props.style.opacity, 0);
    act(() => {
      assert.equal(handlers().onMoveShouldSetPanResponder(touch), true);
      handlers().onPanResponderGrant(
        { nativeEvent: { ...nativeEvent, pageY: 35 } },
        { x0: 120, y0: 35 },
      );
      handlers().onPanResponderMove(touch, { moveX: 120, moveY: 50 });
    });
    assert.deepEqual(
      [board.drag.feedback.pointerY, board.drag.feedback.grabOffsetY],
      [50, 20],
      "responder handoff preserves the original grab offset",
    );
    await release(board, "task");
    await commit(board);
    assert.deepEqual(requests, [["task", "lane", 0]]);
    assert.deepEqual(selections, ["task"]);
    board.unmount();
  }
});

test("stationary touch hold drops; cancelled touches restore the card and allow a subsequent drag", async (t) => {
  mockTimers(t);
  for (const phase of ["hold", "pending", "lifted", "claimed"]) {
    const selections = [];
    const requests = [];
    const board = mountCards(t, {
      ids: ["task"],
      onPress: (id) => selections.push(id),
      onReorderTask: (...args) => requests.push(args),
    });
    const touch = { nativeEvent: { pageX: 120, pageY: 20, touches: [{}] } };
    act(() => {
      board.handlers("task").onTouchStart(touch);
      if (["hold", "lifted", "claimed"].includes(phase))
        t.mock.timers.tick(220);
      if (phase === "claimed")
        board.handlers("task").onPanResponderGrant(touch, press);
    });
    await act(async () => {
      if (phase === "hold") {
        await board.handlers("task").onTouchEnd(touch);
        await board.drag.commitDrop();
      } else if (phase === "claimed")
        board.handlers("task").onPanResponderTerminate();
      else board.handlers("task").onTouchCancel(touch);
      t.mock.timers.tick(300);
    });
    assert.equal(board.card("task").props.style?.opacity ?? 1, 1, phase);
    assert.equal(board.drag.isDragLocked(), false, phase);
    assert.deepEqual(
      requests,
      phase === "hold" ? [["task", "lane", 0]] : [],
      phase,
    );
    assert.deepEqual(selections, [], phase);
    if (phase !== "hold") {
      act(() =>
        board.handlers("task", "handle").onPanResponderGrant(event, press),
      );
      await release(board, "task", press, "handle");
      await commit(board);
      assert.deepEqual(requests, [["task", "lane", 0]], phase);
      assert.equal(board.card("task").props.style?.opacity ?? 1, 1, phase);
    }
    board.unmount();
  }
});

for (const finished of [true, false]) {
  test(`drop animation ${finished ? "arrives at the slot, keeps the pending preview, and requests reorder once" : "is interrupted and restores the card without requesting reorder"}`, async (t) => {
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
    assert.deepEqual(
      reorders,
      [],
      "no reorder request before animation completes",
    );

    await act(async () => {
      finishAnimation();
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
        "source stays hidden while the reorder request is pending",
      );
    }
    await act(async () => {
      finishSave();
      await saving;
    });
    assert.equal(root.toJSON(), null);
    assert.equal(board.card("task").props.style?.opacity ?? 1, 1);
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
      board.handlers(id).onPanResponderGrant(event, {
        ...press,
        y0: id === "1" ? 20 : 100,
      });
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
    assert.equal(board.card(id).props.style?.opacity ?? 1, 1);
    assert.equal(board.drag.isDragLocked(), false);
    board.unmount();
  }
  assert.deepEqual(reorders, [
    ["1", "lane", 0],
    ["2", "lane", 1],
  ]);
});
test("card gestures preview one matching-height slot, animate displacement, and request the displayed position", async (t) => {
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
