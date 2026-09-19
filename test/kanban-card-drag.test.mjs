/**
 * Real React 19 Lifecycle, Subscription & Timers Tests for Kanban Card Drag
 *
 * Replaces the handwritten React Hooks fake renderer with the real React 19.1 reconciler
 * and scheduler via react-test-renderer@19.1.0.
 *
 * Notice on react-test-renderer deprecation & environment:
 * React 19 deprecates react-test-renderer in favor of DOM/native testing harnesses. Here,
 * it is used as the minimal pure-JS scheduling tool to mount, update, subscribe (via useSyncExternalStore),
 * and unmount components in Node native test runner without native build dependencies.
 * Host View/PanResponder/Animated primitives are test doubles; this does not replace host layout/touch E2E.
 * Deprecation notices are filtered strictly; all other console.error messages remain enabled.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { KanbanDragController, useKanbanDrag } from "../client/kanban-drag.ts";
import {
  React,
  TestRenderer,
  act,
  loadClientComponent,
  instrumentControllerSubscriptions,
} from "./helpers/react-host-env.mjs";

const KanbanCard = loadClientComponent("kanban-card", "KanbanCard");
const KanbanDragOverlay = loadClientComponent(
  "kanban-overlay",
  "KanbanDragOverlay",
);

// ---------------------------------------------------------------------------
// 1. 卡片重渲染保留几何，真实卸载恰好注销几何
// ---------------------------------------------------------------------------
test("card rerenders must retain geometry: slot follows pointer and release matches slot", async () => {
  const requests = [];
  const controller = new KanbanDragController({
    lanes: ["lane"],
    onReorderTask: (...args) => requests.push(args),
  });
  controller.registerContainerBounds({ x: 0, y: 0, width: 300, height: 600 });
  controller.registerLaneLayout("lane", {
    x: 0,
    y: 0,
    width: 300,
    height: 600,
  });
  controller.setLaneCardOrder("lane", ["1", "2", "3"]);

  let cleanups = 0;
  function createCardProps(id) {
    return {
      task: { id, laneId: "lane", title: id, subtasks: [] },
      projectDisplayName: null,
      theme: { colors: {} },
      layout: { compact: false },
      binding: {
        isDragging: controller.isTaskDragging(id),
        cardPanHandlers: {},
        handlePanHandlers: {},
        onLayout: (rect) => controller.registerCardLayout("lane", id, rect),
        onUnmount: () => {
          cleanups++;
          controller.unregisterCardLayout("lane", id);
        },
      },
    };
  }

  // 挂载真实 React 19 组件实例
  const cards = ["1", "2", "3"].map((id) => {
    let root;
    act(() => {
      root = TestRenderer.create(
        React.createElement(KanbanCard, createCardProps(id)),
      );
    });
    return { id, root };
  });

  // 模拟初次布局事件
  cards.forEach(({ root }, index) => {
    root.toJSON().props.onLayout({
      nativeEvent: { layout: { x: 0, y: index * 80, width: 280, height: 64 } },
    });
  });

  // 卡片属性更新重渲染（非卸载）
  cards.forEach(({ id, root }) => {
    act(() => {
      root.update(React.createElement(KanbanCard, createCardProps(id)));
    });
  });

  assert.equal(cleanups, 0, "a changed callback is not an unmount");

  // 激活拖拽卡片 1
  controller.startGesture("1", "lane", 100, 20);

  // 反馈重渲染卡片 1
  act(() => {
    cards[0].root.update(React.createElement(KanbanCard, createCardProps("1")));
  });

  const draggingTree = cards[0].root.toJSON();
  assert.equal(
    draggingTree.props.style.position,
    "absolute",
    "source must not consume a second slot",
  );
  assert.equal(
    draggingTree.props.style.opacity,
    0,
    "only the floating preview is visible",
  );

  controller.moveGesture(100, 20);
  assert.equal(
    controller.getFeedback().targetIndex,
    0,
    "lifting the first card must keep the first slot",
  );
  controller.moveGesture(100, 150);
  assert.equal(
    controller.getFeedback().targetIndex,
    1,
    "pointer between 2 and 3 must select the middle slot",
  );
  controller.moveGesture(100, 300);
  assert.equal(
    controller.getFeedback().targetIndex,
    2,
    "pointer below 3 must select the last slot",
  );

  controller.moveGesture(100, 20);
  await controller.releaseGesture(100, 20);
  assert.deepEqual(
    requests,
    [["1", "lane", 0]],
    "release must use the same slot as the preview",
  );

  act(() => {
    cards[0].root.update(React.createElement(KanbanCard, createCardProps("1")));
  });
  assert.equal(
    cards[0].root.toJSON().props.style,
    undefined,
    "release restores the source card",
  );

  // 真实 React 卸载
  cards.forEach(({ root }) => {
    act(() => {
      root.unmount();
    });
  });
  assert.equal(cleanups, 3, "real unmounts still unregister geometry");
});

// ---------------------------------------------------------------------------
// 2. 真实 useKanbanDrag 与 useSyncExternalStore 响应式驱动更新与卸载注销
// ---------------------------------------------------------------------------
test("真实useKanbanDrag与useSyncExternalStore触发订阅更新与卸载注销: 覆盖拖拽和落位期间源卡片隐藏、完成后恢复", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });

  let liveDrag = null;
  let renderCount = 0;

  function LaneCardsBoard({ tasks, laneId }) {
    renderCount++;
    const drag = useKanbanDrag({ lanes: [laneId] });
    liveDrag = drag;
    const laneBinding = drag.bindLane(laneId);

    return React.createElement(
      "View",
      null,
      tasks.map((task) =>
        React.createElement(KanbanCard, {
          key: task.id,
          task,
          projectDisplayName: null,
          theme: { colors: {} },
          layout: { compact: false },
          binding: laneBinding.bindCard(task.id),
        }),
      ),
    );
  }

  const tasks = [
    { id: "task-a", laneId: "lane-main", title: "Task A", subtasks: [] },
    { id: "task-b", laneId: "lane-main", title: "Task B", subtasks: [] },
  ];

  let root;
  act(() => {
    root = TestRenderer.create(
      React.createElement(LaneCardsBoard, { tasks, laneId: "lane-main" }),
    );
  });

  const controller = liveDrag.controller;
  controller.registerContainerBounds({ x: 0, y: 0, width: 400, height: 600 });
  controller.registerLaneLayout("lane-main", {
    x: 0,
    y: 0,
    width: 300,
    height: 600,
  });
  controller.setLaneCardOrder("lane-main", ["task-a", "task-b"]);

  // 观测真实控制器公开订阅接口与清理函数
  const tracker = instrumentControllerSubscriptions(controller);

  // 重新渲染以确保 useSyncExternalStore 接收被观测的公开订阅函数
  act(() => {
    root.update(
      React.createElement(LaneCardsBoard, { tasks, laneId: "lane-main" }),
    );
  });

  const getCardAJson = () => root.toJSON().children[0];
  const getCardBJson = () => root.toJSON().children[1];

  // 1. 静止状态: 卡片正常显示（无 style 覆盖）
  assert.equal(getCardAJson().props.style, undefined, "静止状态正常展示");
  assert.equal(getCardBJson().props.style, undefined);

  // 2. 激活拖拽: 通过真实 useSyncExternalStore 自动触发重渲染，无需手动 render
  const initialRenders = renderCount;
  act(() => {
    controller.handlePointerDown(
      { taskId: "task-a", laneId: "lane-main", onPress: () => {} },
      { x: 50, y: 50 },
      "handle",
    );
    controller.handlePointerMove({ x: 150, y: 150 });
  });

  assert.ok(renderCount > initialRenders, "状态变更自动触发外部存储订阅更新");
  assert.equal(
    getCardAJson().props.style?.position,
    "absolute",
    "拖拽期间源卡片必须被隐藏",
  );
  assert.equal(
    getCardAJson().props.style?.opacity,
    0,
    "拖拽期间源卡片透明度为 0",
  );
  assert.equal(getCardBJson().props.style, undefined, "非拖拽卡片保持正常可见");

  // 3. 落位动画阶段: 保持源卡片隐藏
  let droppingState;
  await act(async () => {
    droppingState = await controller.beginDropAnimation({ x: 150, y: 150 });
  });
  assert.ok(droppingState, "落位动画已生成");
  assert.equal(
    getCardAJson().props.style?.position,
    "absolute",
    "落位动画期间源卡片继续保持隐藏",
  );
  assert.equal(
    getCardAJson().props.style?.opacity,
    0,
    "落位动画期间源卡片维持透明度 0",
  );

  // 4. 落位提交完成: 状态恢复，源卡片重新显现
  await act(async () => {
    await controller.reportDropComplete(droppingState.operationId);
  });
  assert.equal(
    getCardAJson().props.style,
    undefined,
    "落位提交流程结束后卡片展示自动恢复",
  );

  // 解锁拖拽互斥（60ms 定时器推进）
  act(() => {
    t.mock.timers.tick(60);
  });
  assert.equal(controller.isDragLocked(), false);

  // 5. 真实卸载与外部存储订阅释放闭环验证
  assert.equal(tracker.cleanupsCalled.subscribe, 0, "卸载前清理函数尚未调用");
  assert.equal(tracker.cleanupsCalled.subscribeSlot, 0);
  assert.equal(tracker.cleanupsCalled.subscribeDrop, 0);

  const rendersBeforeUnmount = renderCount;
  tracker.markUnmounted();
  act(() => {
    root.unmount();
  });

  // 验证 React 卸载严格调用了控制器公开订阅接口返回的全部清理函数
  assert.equal(
    tracker.cleanupsCalled.subscribe,
    1,
    "卸载时必须准确调用 subscribe 清理函数",
  );
  assert.equal(
    tracker.cleanupsCalled.subscribeSlot,
    1,
    "卸载时必须准确调用 subscribeSlot 清理函数",
  );
  assert.equal(
    tracker.cleanupsCalled.subscribeDrop,
    1,
    "卸载时必须准确调用 subscribeDrop 清理函数",
  );

  // 卸载后再对控制器执行操作，验证没有回调泄露派发且组件不重新渲染
  act(() => {
    controller.startGesture("task-b", "lane-main", 50, 50, true);
    controller.moveGesture(120, 120);
    controller.cancelGesture();
    t.mock.timers.tick(60);
  });

  assert.equal(
    tracker.leakedDispatchesAfterUnmount,
    0,
    "卸载后控制器手势通知严禁向已注销订阅派发任何回调",
  );
  assert.equal(
    renderCount,
    rendersBeforeUnmount,
    "卸载后外部存储订阅已解除，严禁在卸载后再渲染",
  );

  // 6. 控制器公开订阅接口（subscribe/subscribeSlot/subscribeDrop）取消后零回调派发验证
  let publicFeedbackCalls = 0;
  let publicSlotCalls = 0;
  let publicDropCalls = 0;

  const unsubFeedback = controller.subscribe(() => {
    publicFeedbackCalls++;
  });
  const unsubSlot = controller.subscribeSlot(() => {
    publicSlotCalls++;
  });
  const unsubDrop = controller.subscribeDrop(() => {
    publicDropCalls++;
  });

  assert.equal(typeof unsubFeedback, "function", "subscribe 必须返回清理函数");
  assert.equal(typeof unsubSlot, "function", "subscribeSlot 必须返回清理函数");
  assert.equal(typeof unsubDrop, "function", "subscribeDrop 必须返回清理函数");

  // 触发手势变更，验证各公开订阅接收正常派发
  controller.handlePointerDown(
    { taskId: "task-b", laneId: "lane-main", onPress: () => {} },
    { x: 50, y: 50 },
    "handle",
  );
  assert.ok(publicFeedbackCalls > 0, "活动手势期间 feedback 订阅必须接收派发");
  assert.ok(publicSlotCalls > 0, "活动手势期间 slot 订阅必须接收派发");

  // 执行取消订阅清理函数
  unsubFeedback();
  unsubSlot();
  unsubDrop();

  const feedbackCallsAfterUnsub = publicFeedbackCalls;
  const slotCallsAfterUnsub = publicSlotCalls;
  const dropCallsAfterUnsub = publicDropCalls;

  // 取消订阅后触发控制器事件（移动、落位动画开启、取消手势等）
  controller.handlePointerMove({ x: 150, y: 150 });
  controller.cancelGesture();
  t.mock.timers.tick(60);

  assert.equal(
    publicFeedbackCalls,
    feedbackCallsAfterUnsub,
    "subscribe 取消后严禁再接收任何通知派发",
  );
  assert.equal(
    publicSlotCalls,
    slotCallsAfterUnsub,
    "subscribeSlot 取消后严禁再接收任何通知派发",
  );
  assert.equal(
    publicDropCalls,
    dropCallsAfterUnsub,
    "subscribeDrop 取消后严禁再接收任何通知派发",
  );
});

// ---------------------------------------------------------------------------
// 3. 看板占位槽针对剩余卡片计算，而非被拖拽卡片
// ---------------------------------------------------------------------------
test("board renders the slot against the remaining cards, not the dragged card", () => {
  const board = {
    lanes: [{ id: "lane", title: "Lane" }],
    tasks: ["1", "2", "3"].map((id) => ({
      id,
      laneId: "lane",
      title: id,
      subtasks: [],
      projectId: null,
    })),
  };
  const drag = {
    feedback: {
      isDragging: true,
      draggingTaskId: "1",
      targetIndex: 0,
      draggedCardHeight: 96,
    },
    isLaneHovered: () => true,
    isTaskDragging: (id) => id === "1",
    bindLane: (_laneId) => ({
      isHovered: true,
      targetIndex: drag.feedback.targetIndex,
      isTaskDragging: (id) => drag.isTaskDragging(id),
      draggedCardHeight: drag.feedback.draggedCardHeight,
      registerLaneLayout: () => {},
      registerCardsViewport: () => {},
      handleLaneScroll: () => {},
      setDropSpacerY: () => {},
      setLaneCardOrder: () => {},
      bindCard: (taskId) => ({
        isDragging: drag.isTaskDragging(taskId),
        cardPanHandlers: {},
        handlePanHandlers: {},
        onLayout: () => {},
        onUnmount: () => {},
      }),
    }),
  };

  const KanbanBoardView = loadClientComponent(
    "kanban-board",
    "KanbanBoardView",
    {
      "@getpaseo/plugin/client": {
        useSettings: () => ({ status: "ready", values: board }),
      },
      "../shared/kanban": {
        filterTasksByProject: (tasks) => tasks,
        kanbanSettings: {},
      },
      "./use-projects": {
        useProjects: () => ({ projects: [] }),
        getProjectDisplayName: () => null,
      },
      "./kanban-card": {
        KanbanCard: "Card",
        KanbanDropSpacer: "Slot",
        KanbanCardPreview: "Preview",
      },
      "./kanban-drag": { useKanbanDrag: () => drag },
      "./task-modal": { TaskModal: "TaskModal" },
      "./lane-modal": { LaneModal: "LaneModal" },
      "./kanban-session": {},
    },
  );

  function collect(node, result = []) {
    if (!node) return result;
    if (Array.isArray(node)) {
      node.forEach((child) => collect(child, result));
    } else {
      if (node.type === "Slot") {
        result.push("slot");
        assert.equal(
          node.props?.height,
          drag.feedback.draggedCardHeight,
          "slot must match the dragged card height",
        );
      }
      if (node.type === "Card" && !node.props?.binding?.isDragging) {
        result.push(node.props?.task?.id);
      }
      const children = node.children || node.props?.children;
      if (children) {
        collect(children, result);
      }
    }
    return result;
  }

  for (const compact of [false, true]) {
    for (const draggedId of ["1", "2", "3"]) {
      drag.feedback.draggingTaskId = draggedId;
      drag.isTaskDragging = (id) => id === draggedId;
      for (const index of [0, 1, 2]) {
        drag.feedback.targetIndex = index;
        const expected = ["1", "2", "3"].filter((id) => id !== draggedId);
        expected.splice(index, 0, "slot");

        let root;
        act(() => {
          root = TestRenderer.create(
            React.createElement(KanbanBoardView, {
              theme: { colors: {} },
              layout: { compact },
            }),
          );
        });

        assert.deepEqual(collect(root.toJSON()), expected);
        act(() => {
          root.unmount();
        });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 4. 长按即时抓起、可控定时器推进、无缝滑动与槽位定位
// ---------------------------------------------------------------------------
test("long press grabs the card immediately, seamlessly continues dragging on move, and getDropSlotPosition targets the dashed slot", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });

  const controller = new KanbanDragController({ lanes: ["lane-a"] });
  controller.registerContainerBounds({ x: 10, y: 20, width: 300, height: 600 });
  controller.registerLaneLayout("lane-a", {
    x: 10,
    y: 20,
    width: 300,
    height: 600,
  });
  controller.registerCardsViewportLayout("lane-a", {
    x: 10,
    y: 40,
    width: 280,
    height: 500,
  });
  controller.setLaneCardOrder("lane-a", ["c1", "c2", "c3"]);
  controller.registerCardLayout("lane-a", "c1", {
    x: 0,
    y: 0,
    width: 280,
    height: 60,
  });
  controller.registerCardLayout("lane-a", "c2", {
    x: 0,
    y: 68,
    width: 280,
    height: 60,
  });
  controller.registerCardLayout("lane-a", "c3", {
    x: 0,
    y: 136,
    width: 280,
    height: 60,
  });

  let clicked = false;
  const nativePanResponder = {
    create: (handlers) => ({ panHandlers: handlers }),
  };
  const binding1 = controller.bindCard(
    "lane-a",
    "card-1",
    () => {
      clicked = true;
    },
    nativePanResponder,
  );

  let root;
  act(() => {
    root = TestRenderer.create(
      React.createElement(KanbanCard, {
        task: { id: "card-1", laneId: "lane-a", title: "Test", subtasks: [] },
        projectDisplayName: null,
        theme: { colors: {} },
        layout: { compact: false },
        binding: binding1,
      }),
    );
  });

  const tree = root.toJSON();

  // 1. 按下卡片手势
  tree.props.onPanResponderGrant({ nativeEvent: {} }, { x0: 120, y0: 240 });

  // 2. 推进 260ms (鼠标输入长按阈值，ADR与源码kanban-drag.ts:479明确touch为220ms，mouse为260ms)
  act(() => {
    t.mock.timers.tick(260);
  });

  assert.equal(
    controller.getFeedback().isDragging,
    true,
    "Long press must trigger dragging",
  );
  assert.equal(controller.getFeedback().draggingTaskId, "card-1");

  // 3. 抓起后移动指针: 无缝延续拖拽
  tree.props.onPanResponderMove(
    { nativeEvent: {} },
    { dx: 10, dy: 20, moveX: 130, moveY: 260 },
  );
  assert.equal(controller.getFeedback().pointerX, 130);
  assert.equal(controller.getFeedback().pointerY, 260);

  // 4. 释放手势
  await act(async () => {
    await tree.props.onPanResponderRelease(
      { nativeEvent: {} },
      { moveX: 130, moveY: 260 },
    );
  });

  assert.equal(
    controller.getFeedback().isDragging,
    false,
    "Release must finish dragging",
  );
  assert.equal(
    clicked,
    false,
    "Long press and drag must not trigger click onPress",
  );

  // 推进 60ms 释放互斥锁
  act(() => {
    t.mock.timers.tick(60);
  });
  assert.equal(controller.isDragLocked(), false);

  // 5. 验证快速轻点打开详情 (< 260ms 且 < 5px)
  let clickCount = 0;
  const binding2 = controller.bindCard(
    "lane-a",
    "card-2",
    () => {
      clickCount++;
    },
    nativePanResponder,
  );

  let clickRoot;
  act(() => {
    clickRoot = TestRenderer.create(
      React.createElement(KanbanCard, {
        task: { id: "card-2", laneId: "lane-a", title: "Test 2", subtasks: [] },
        projectDisplayName: null,
        theme: { colors: {} },
        layout: { compact: false },
        binding: binding2,
      }),
    );
  });

  const clickTree = clickRoot.toJSON();
  clickTree.props.onPanResponderGrant({ nativeEvent: {} }, { x0: 50, y0: 50 });
  await act(async () => {
    await clickTree.props.onPanResponderRelease(
      { nativeEvent: {} },
      { moveX: 50, moveY: 50 },
    );
  });
  assert.equal(clickCount, 1, "Quick tap must open task details");

  // 槽位坐标校验
  const slot0 = controller.getDropSlotPosition("lane-a", 0);
  assert.deepEqual(
    slot0,
    { x: 20, y: 60 },
    "Slot 0 should be at top of cards list",
  );

  const slot1 = controller.getDropSlotPosition("lane-a", 1);
  assert.deepEqual(slot1, { x: 20, y: 128 }, "Slot 1 should match card 2 top");

  const slot3 = controller.getDropSlotPosition("lane-a", 3);
  assert.deepEqual(
    slot3,
    { x: 20, y: 264 },
    "Slot 3 should follow card 3 bottom with gap",
  );

  act(() => {
    root.unmount();
    clickRoot.unmount();
  });
});

// ---------------------------------------------------------------------------
// 5. 静止左键点击与微小位移抖动均触发详情打开
// ---------------------------------------------------------------------------
test("stationary left click opens task details without requiring a mouse move", async () => {
  const controller = new KanbanDragController({ lanes: ["lane"] });
  let clicks = 0;

  let root;
  act(() => {
    root = TestRenderer.create(
      React.createElement(KanbanCard, {
        task: { id: "task", laneId: "lane", title: "Task", subtasks: [] },
        projectDisplayName: null,
        theme: { colors: {} },
        layout: { compact: false },
        binding: controller.bindCard(
          "lane",
          "task",
          () => {
            clicks++;
          },
          {
            create: (handlers) => ({ panHandlers: handlers }),
          },
        ),
      }),
    );
  });

  const tree = root.toJSON();
  const event = { nativeEvent: { pageX: 120, pageY: 240, button: 0 } };
  const gesture = { x0: 120, y0: 240, moveX: 0, moveY: 0, dx: 0, dy: 0 };

  tree.props.onPanResponderGrant(event, gesture);
  await act(async () => {
    await tree.props.onPanResponderRelease(event, gesture);
  });
  assert.equal(clicks, 1, "a stationary left click must open task details");
  assert.equal(controller.isDragLocked(), false);

  tree.props.onPanResponderGrant(event, gesture);
  tree.props.onPanResponderMove(event, {
    ...gesture,
    moveX: 123,
    moveY: 240,
    dx: 3,
  });
  await act(async () => {
    await tree.props.onPanResponderRelease(event, {
      ...gesture,
      moveX: 123,
      moveY: 240,
      dx: 3,
    });
  });
  assert.equal(
    clicks,
    2,
    "slight mouse jitter must still open task details exactly once",
  );

  act(() => {
    root.unmount();
  });
});

// ---------------------------------------------------------------------------
// 6. 主体与手柄拖拽释放保留位置且不触发点击详情
// ---------------------------------------------------------------------------
for (const source of ["body", "handle"]) {
  test(`${source} drag release retains its recorded position and never opens details`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });

    const controller = new KanbanDragController({ lanes: ["lane"] });
    let clicks = 0;
    const releases = [];
    controller.setReleaseHandler(async (x, y) => {
      releases.push({ x, y });
      controller.cancelGesture();
    });

    const binding = controller.bindCard(
      "lane",
      "task",
      () => {
        clicks++;
      },
      {
        create: (handlers) => ({ panHandlers: handlers }),
      },
    );

    let root;
    act(() => {
      root = TestRenderer.create(
        React.createElement(KanbanCard, {
          task: { id: "task", laneId: "lane", title: "Task", subtasks: [] },
          projectDisplayName: null,
          theme: { colors: {} },
          layout: { compact: false },
          binding,
        }),
      );
    });

    const handlers =
      source === "body" ? binding.cardPanHandlers : binding.handlePanHandlers;
    const event = { nativeEvent: {} };
    const gesture = { x0: 120, y0: 240, moveX: 0, moveY: 0, dx: 0, dy: 0 };

    handlers.onPanResponderGrant(event, gesture);
    if (source === "body") {
      handlers.onPanResponderMove(event, {
        ...gesture,
        moveX: 140,
        moveY: 260,
        dx: 20,
        dy: 20,
      });
      handlers.onPanResponderMove(event, {
        ...gesture,
        moveX: 120,
        moveY: 240,
      });
    }

    assert.equal(controller.getFeedback().isDragging, true);
    await act(async () => {
      await handlers.onPanResponderRelease(event, gesture);
    });

    assert.deepEqual(releases, [{ x: 120, y: 240 }]);
    assert.equal(clicks, 0);

    // 推进互斥定时器
    act(() => {
      t.mock.timers.tick(60);
    });

    act(() => {
      root.unmount();
    });
  });
}

// ---------------------------------------------------------------------------
// 7. KanbanDragOverlay: 落位动画浮层渲染与动态预览任务快照绑定
// ---------------------------------------------------------------------------
test("KanbanDragOverlay: 落位动画浮层渲染与动态预览任务快照绑定", () => {
  let committed = false;

  const feedbackSnapshot = {
    isDragging: false,
    draggingTaskId: null,
    pointerX: undefined,
    pointerY: undefined,
  };

  const dragMock = {
    feedback: feedbackSnapshot,
    droppingState: {
      operationId: "op-overlay-1",
      taskId: "task-101",
      task: null,
      projectName: null,
      fromX: 100,
      fromY: 200,
      toX: 300,
      toY: 400,
      isDrop: true,
    },
    getTaskPreview: (taskId) => ({
      task: { id: taskId, title: "Dynamic Drop Preview", subtasks: [] },
      projectDisplayName: "Test Project",
    }),
    commitDrop: () => {
      committed = true;
    },
    abortDrop: () => {},
    controller: {
      subscribe: () => () => {},
      subscribeDrop: () => () => {},
      getFeedback: () => feedbackSnapshot,
      getDroppingState: () => dragMock.droppingState,
      getContainerBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    },
  };

  let root;
  act(() => {
    root = TestRenderer.create(
      React.createElement(KanbanDragOverlay, {
        drag: dragMock,
        theme: { colors: {} },
        layout: { compact: false },
      }),
    );
  });

  const tree = root.toJSON();
  assert.ok(tree, "落位状态下必须渲染落位浮层，不得返回 null");
  assert.equal(
    tree.props.style[1].left,
    100,
    "必须从起点坐标 fromX 开始落位吸附",
  );
  assert.equal(
    tree.props.style[1].top,
    200,
    "必须从起点坐标 fromY 开始落位吸附",
  );
  const preview = root.root.findByProps({
    projectDisplayName: "Test Project",
  });
  assert.equal(
    preview.props.task.title,
    "Dynamic Drop Preview",
    "必须成功解析出动态任务数据",
  );
  assert.equal(
    preview.props.projectDisplayName,
    "Test Project",
    "必须解析出关联项目名",
  );
  assert.equal(committed, true, "落位动画完成后必须调用 commitDrop 提交事务");

  act(() => {
    root.unmount();
  });
});

// ---------------------------------------------------------------------------
// 8. 落位动画期间卡片保持隐藏: 原位卡片不得在动画期间重新渲染复显
// ---------------------------------------------------------------------------
test("落位动画期间卡片保持隐藏: 原位卡片不得在动画期间重新渲染复显", async () => {
  const controller = new KanbanDragController({
    lanes: ["lane-a", "lane-b"],
  });
  controller.registerContainerBounds({ x: 0, y: 0, width: 600, height: 600 });
  controller.registerLaneLayout("lane-a", {
    x: 0,
    y: 0,
    width: 280,
    height: 600,
  });
  controller.registerLaneLayout("lane-b", {
    x: 300,
    y: 0,
    width: 280,
    height: 600,
  });
  controller.setLaneCardOrder("lane-a", ["card-1", "card-2"]);
  controller.setLaneCardOrder("lane-b", ["card-3"]);

  function getCardProps() {
    return {
      task: { id: "card-1", laneId: "lane-a", title: "Card 1", subtasks: [] },
      projectDisplayName: null,
      theme: { colors: {} },
      layout: { compact: false },
      binding: controller.bindCard("lane-a", "card-1"),
    };
  }

  let root;
  act(() => {
    root = TestRenderer.create(React.createElement(KanbanCard, getCardProps()));
  });

  // 1. 静止状态: 卡片正常显示
  assert.equal(root.toJSON().props.style, undefined, "静止状态下卡片正常显示");

  // 2. 拖拽激活状态: 卡片隐藏
  controller.handlePointerDown(
    { taskId: "card-1", laneId: "lane-a", onPress: () => {} },
    { x: 50, y: 50 },
    "handle",
  );
  controller.handlePointerMove({ x: 350, y: 100 });
  assert.equal(controller.isTaskDragging("card-1"), true);

  act(() => {
    root.update(React.createElement(KanbanCard, getCardProps()));
  });
  assert.equal(
    root.toJSON().props.style.position,
    "absolute",
    "拖拽期间原位卡片必须隐藏",
  );
  assert.equal(
    root.toJSON().props.style.opacity,
    0,
    "拖拽期间原位卡片透明度为 0",
  );

  // 3. 进入落位动画阶段 (droppingState 激活，尚未完成提交)
  let droppingState;
  await act(async () => {
    droppingState = await controller.beginDropAnimation({ x: 350, y: 100 });
  });
  assert.ok(droppingState, "必须生成落位状态");
  assert.equal(
    controller.isTaskDragging("card-1"),
    true,
    "落位动画期间控制器必须判定该卡片仍在处理中",
  );

  act(() => {
    root.update(React.createElement(KanbanCard, getCardProps()));
  });
  assert.equal(
    root.toJSON().props.style?.position,
    "absolute",
    "落位动画期间原位卡片必须继续隐藏，严禁在原位置重新出现",
  );
  assert.equal(
    root.toJSON().props.style?.opacity,
    0,
    "落位动画期间原位卡片透明度必须维持 0",
  );

  // 4. 落位动画完成并持久化
  await act(async () => {
    await controller.reportDropComplete(droppingState.operationId);
  });
  assert.equal(
    controller.isTaskDragging("card-1"),
    false,
    "提交流程结束后恢复状态",
  );

  act(() => {
    root.update(React.createElement(KanbanCard, getCardProps()));
  });
  assert.equal(
    root.toJSON().props.style,
    undefined,
    "提交完成后重新渲染展示恢复正常",
  );

  act(() => {
    root.unmount();
  });
});

// ---------------------------------------------------------------------------
// 9. (S4) 卡片 Pending 阶段卸载与非活动卡片注销隔离
// ---------------------------------------------------------------------------
test("(S4) 卡片pending长按阶段卸载，推进时间无拖拽激活、无点击、无落位提交；注销其他非活动卡片不取消正在进行的拖拽", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });

  const reorders = [];
  let clickCount1 = 0;
  let clickCount2 = 0;

  const controller = new KanbanDragController({
    lanes: ["lane-1"],
    onReorderTask: (taskId, targetLaneId, targetIndex) => {
      reorders.push({ taskId, targetLaneId, targetIndex });
    },
  });
  controller.registerContainerBounds({ x: 0, y: 0, width: 400, height: 600 });
  controller.registerLaneLayout("lane-1", {
    x: 0,
    y: 0,
    width: 300,
    height: 600,
  });
  controller.setLaneCardOrder("lane-1", ["card-1", "card-2"]);

  const nativePanResponder = {
    create: (handlers) => ({ panHandlers: handlers }),
  };

  const binding1 = controller.bindCard(
    "lane-1",
    "card-1",
    () => {
      clickCount1++;
    },
    nativePanResponder,
  );
  const binding2 = controller.bindCard(
    "lane-1",
    "card-2",
    () => {
      clickCount2++;
    },
    nativePanResponder,
  );

  let root1;
  let root2;
  act(() => {
    root1 = TestRenderer.create(
      React.createElement(KanbanCard, {
        task: { id: "card-1", laneId: "lane-1", title: "Card 1", subtasks: [] },
        projectDisplayName: null,
        theme: { colors: {} },
        layout: { compact: false },
        binding: binding1,
      }),
    );
    root2 = TestRenderer.create(
      React.createElement(KanbanCard, {
        task: { id: "card-2", laneId: "lane-1", title: "Card 2", subtasks: [] },
        projectDisplayName: null,
        theme: { colors: {} },
        layout: { compact: false },
        binding: binding2,
      }),
    );
  });

  // 1a. 卡片 1 触发 pointerDown，进入长按 pending 状态 (鼠标长按阈值 260ms)
  const card1Tree = root1.toJSON();
  card1Tree.props.onPanResponderGrant({ nativeEvent: {} }, { x0: 50, y0: 50 });

  // 在 260ms 长按判定完成前（推进 100ms），卡片 1 从组件树卸载
  act(() => {
    t.mock.timers.tick(100);
  });
  act(() => {
    root1.unmount();
  });

  // 推进超过长按阈值（推进 200ms），断言无拖拽激活、无点击、无落位提交
  act(() => {
    t.mock.timers.tick(200);
  });

  assert.equal(
    controller.getFeedback().isDragging,
    false,
    "卡片卸载后推进长按时间严禁激活拖拽",
  );
  assert.equal(controller.getFeedback().draggingTaskId, null);
  assert.equal(clickCount1, 0, "卡片卸载后严禁触发点击详情");
  assert.equal(clickCount2, 0, "卡片2未触发点击详情");
  assert.equal(reorders.length, 0, "卡片卸载后严禁产生落位提交");
  assert.equal(controller.isDragLocked(), false, "控制器不得残留拖拽互斥锁");

  // 1b. 验证注销其他非活动卡片不得取消正在进行的拖拽
  const binding1New = controller.bindCard(
    "lane-1",
    "card-1",
    () => {
      clickCount1++;
    },
    nativePanResponder,
  );
  act(() => {
    root1 = TestRenderer.create(
      React.createElement(KanbanCard, {
        task: { id: "card-1", laneId: "lane-1", title: "Card 1", subtasks: [] },
        projectDisplayName: null,
        theme: { colors: {} },
        layout: { compact: false },
        binding: binding1New,
      }),
    );
  });

  // card-1 正常激活拖拽
  const newTree1 = root1.toJSON();
  newTree1.props.onPanResponderGrant({ nativeEvent: {} }, { x0: 50, y0: 50 });
  act(() => {
    t.mock.timers.tick(260);
  });
  assert.equal(
    controller.getFeedback().isDragging,
    true,
    "Card 1 拖拽正常激活",
  );
  assert.equal(controller.getFeedback().draggingTaskId, "card-1");

  // 此时注销非活动卡片 card-2 (root2 unmount)
  act(() => {
    root2.unmount();
  });

  // 断言 card-1 的拖拽会话绝对不受影响
  assert.equal(
    controller.getFeedback().isDragging,
    true,
    "注销非活动卡片不得取消正在进行的拖拽",
  );
  assert.equal(controller.getFeedback().draggingTaskId, "card-1");

  // card-1 正常移动并释放
  newTree1.props.onPanResponderMove(
    { nativeEvent: {} },
    { moveX: 50, moveY: 150 },
  );
  await act(async () => {
    await newTree1.props.onPanResponderRelease(
      { nativeEvent: {} },
      { moveX: 50, moveY: 150 },
    );
  });

  assert.equal(reorders.length, 1, "Card 1 正常完成落位提交");
  assert.equal(reorders[0].taskId, "card-1");

  act(() => {
    t.mock.timers.tick(60);
  });
  act(() => {
    root1.unmount();
  });
});

// ---------------------------------------------------------------------------
// 10. (S4) Hook/看板卸载取消内部待执行资源、无泄漏派发与幂等落位
// ---------------------------------------------------------------------------
test("(S4) 真实hook/看板卸载时取消内部待执行资源，延迟回调不再通知废弃订阅、不再启动新保存；清理幂等", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });

  const reorders = [];
  let liveDrag = null;

  function BoardWithHook({ laneId, taskId }) {
    const drag = useKanbanDrag({
      lanes: [laneId],
      onReorderTask: (id, targetLane, idx) => {
        reorders.push({ id, targetLane, idx });
      },
    });
    liveDrag = drag;
    const laneBinding = drag.bindLane(laneId);

    return React.createElement(
      "View",
      null,
      React.createElement(KanbanCard, {
        task: { id: taskId, laneId, title: taskId, subtasks: [] },
        projectDisplayName: null,
        theme: { colors: {} },
        layout: { compact: false },
        binding: laneBinding.bindCard(taskId, undefined, {
          create: (handlers) => ({ panHandlers: handlers }),
        }),
      }),
    );
  }

  let root;
  act(() => {
    root = TestRenderer.create(
      React.createElement(BoardWithHook, {
        laneId: "lane-a",
        taskId: "task-1",
      }),
    );
  });

  const controller = liveDrag.controller;
  controller.registerContainerBounds({ x: 0, y: 0, width: 400, height: 600 });
  controller.registerLaneLayout("lane-a", {
    x: 0,
    y: 0,
    width: 300,
    height: 600,
  });
  controller.setLaneCardOrder("lane-a", ["task-1"]);

  // 观测订阅
  const tracker = instrumentControllerSubscriptions(controller);

  // 重新渲染注入 instrumented 订阅函数
  act(() => {
    root.update(
      React.createElement(BoardWithHook, {
        laneId: "lane-a",
        taskId: "task-1",
      }),
    );
  });

  // 2a. 在 pending 状态下直接卸载整个组件（包含 useKanbanDrag）
  const cardTree = root.toJSON().children[0];
  act(() => {
    cardTree.props.onPanResponderGrant({ nativeEvent: {} }, { x0: 60, y0: 60 });
  });

  // 标记卸载并执行真实卸载
  tracker.markUnmounted();
  act(() => {
    root.unmount();
  });

  // 推进定时器（长按 260ms + 互斥 60ms）
  act(() => {
    t.mock.timers.tick(350);
  });

  // 断言：延迟回调不得通知废弃订阅，不得启动保存
  assert.equal(
    tracker.leakedDispatchesAfterUnmount,
    0,
    "看板卸载后内部计时器取消，延迟回调严禁向已废弃订阅派发任何通知",
  );
  assert.equal(reorders.length, 0, "卸载后严禁启动任何新保存");
  assert.equal(controller.getFeedback().isDragging, false);

  // 2b. 卸载前尚未完成动画的落位按取消语义中止，迟到/重复的完成信号幂等无害
  act(() => {
    root = TestRenderer.create(
      React.createElement(BoardWithHook, {
        laneId: "lane-a",
        taskId: "task-1",
      }),
    );
  });
  const newController = liveDrag.controller;
  newController.registerContainerBounds({
    x: 0,
    y: 0,
    width: 400,
    height: 600,
  });
  newController.registerLaneLayout("lane-a", {
    x: 0,
    y: 0,
    width: 300,
    height: 600,
  });
  newController.setLaneCardOrder("lane-a", ["task-1"]);

  // 激活拖拽并进入落位动画阶段
  let droppingState;
  await act(async () => {
    newController.startGesture("task-1", "lane-a", 60, 60, true);
    newController.moveGesture(60, 160);
    droppingState = await newController.beginDropAnimation({ x: 60, y: 160 });
  });
  assert.ok(droppingState, "落位动画已开启");

  // 此时动画尚未完成，看板组件突然卸载！
  act(() => {
    root.unmount();
  });

  // 迟到的动画完成回调尝试调用 reportDropComplete
  await act(async () => {
    await newController.reportDropComplete(droppingState.operationId);
    // 重复调用以验证幂等性
    await newController.reportDropComplete(droppingState.operationId);
  });

  assert.equal(
    reorders.length,
    0,
    "未完成动画在卸载后中止，迟到/重复的完成信号严禁产生新提交",
  );
});

// ---------------------------------------------------------------------------
// 11. (S4) 在途异步保存完成不复活废弃交互状态或污染新会话
// ---------------------------------------------------------------------------
test("(S4) 已经发出的save不能凭空撤销，但其异步完成不得复活废弃交互状态或污染新会话", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });

  let resolveSavePromise;
  const savePromise = new Promise((resolve) => {
    resolveSavePromise = resolve;
  });

  const saves = [];
  const controller = new KanbanDragController({
    lanes: ["lane-1"],
    onReorderTask: (taskId, targetLaneId, targetIndex) => {
      saves.push({ taskId, targetLaneId, targetIndex });
      return savePromise;
    },
  });
  controller.registerContainerBounds({ x: 0, y: 0, width: 400, height: 600 });
  controller.registerLaneLayout("lane-1", {
    x: 0,
    y: 0,
    width: 300,
    height: 600,
  });
  controller.setLaneCardOrder("lane-1", ["task-1"]);

  // 1. 正常拖拽并启动落位
  let dropState;
  await act(async () => {
    controller.startGesture("task-1", "lane-1", 50, 50, true);
    dropState = await controller.beginDropAnimation({ x: 50, y: 50 });
  });

  // 2. 触发 reportDropComplete，savePromise 处于在途 pending 状态
  let reportCompletePromise;
  act(() => {
    reportCompletePromise = controller.reportDropComplete(
      dropState.operationId,
    );
  });
  assert.equal(saves.length, 1, "保存已被正常发出");

  // 3. 此时看板发生卸载信号 (teardown)
  controller.teardown();

  // 观测此时订阅，确保废弃会话不会再被晚到的异步完成通知
  let notifiedAfterTeardown = 0;
  controller.subscribe(() => {
    notifiedAfterTeardown++;
  });
  controller.subscribeDrop(() => {
    notifiedAfterTeardown++;
  });

  // 4. 异步保存成功完成
  await act(async () => {
    resolveSavePromise();
    await reportCompletePromise;
  });

  // 推进互斥定时器（如果有的话）
  act(() => {
    t.mock.timers.tick(100);
  });

  assert.equal(
    notifiedAfterTeardown,
    0,
    "在途保存完成后严禁向已 teardown 的订阅派发通知",
  );
  assert.equal(
    controller.isDragLocked(),
    false,
    "在途保存完成严禁复活旧会话的互斥锁",
  );
  assert.equal(
    controller.getFeedback().isDragging,
    false,
    "在途保存完成严禁复活旧会话的拖拽状态",
  );
});

// ---------------------------------------------------------------------------
// 12. (S4) 真实 React StrictMode 双重生命周期与重新挂载后正常交互与落位
// ---------------------------------------------------------------------------
test("(S4) React StrictMode setup-cleanup-setup与重新挂载后必须仍可正常拖拽、订阅和落位", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });

  const reorderEvents = [];
  let liveDrag = null;

  function StrictBoard({ laneId, tasks }) {
    const drag = useKanbanDrag({
      lanes: [laneId],
      onReorderTask: (id, targetLane, idx) => {
        reorderEvents.push({ id, targetLane, idx });
      },
    });
    liveDrag = drag;
    const laneBinding = drag.bindLane(laneId);

    return React.createElement(
      "View",
      null,
      tasks.map((task) =>
        React.createElement(KanbanCard, {
          key: task.id,
          task,
          projectDisplayName: null,
          theme: { colors: {} },
          layout: { compact: false },
          binding: laneBinding.bindCard(task.id, undefined, {
            create: (handlers) => ({ panHandlers: handlers }),
          }),
        }),
      ),
    );
  }

  const tasks = [
    { id: "task-1", laneId: "lane-main", title: "Task 1", subtasks: [] },
    { id: "task-2", laneId: "lane-main", title: "Task 2", subtasks: [] },
  ];

  // 1. 使用真实 React.StrictMode 包装挂载
  let root;
  act(() => {
    root = TestRenderer.create(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(StrictBoard, { laneId: "lane-main", tasks }),
      ),
    );
  });

  const controller = liveDrag.controller;
  controller.registerContainerBounds({ x: 0, y: 0, width: 400, height: 600 });
  controller.registerLaneLayout("lane-main", {
    x: 0,
    y: 0,
    width: 300,
    height: 600,
  });
  controller.setLaneCardOrder("lane-main", ["task-1", "task-2"]);

  // 2. 验证在 StrictMode (setup-cleanup-setup) 后，控制器未被死锁，拖拽依然完全可用
  const card1Node = root.toJSON().children[0];
  act(() => {
    card1Node.props.onPanResponderGrant(
      { nativeEvent: {} },
      { x0: 50, y0: 50 },
    );
  });

  // 推进 260ms 长按阈值
  act(() => {
    t.mock.timers.tick(260);
  });

  assert.equal(
    controller.getFeedback().isDragging,
    true,
    "StrictMode 双重生命周期后必须依然能正常激活长按拖拽",
  );
  assert.equal(controller.getFeedback().draggingTaskId, "task-1");

  // 移动并落位
  act(() => {
    card1Node.props.onPanResponderMove(
      { nativeEvent: {} },
      { moveX: 50, moveY: 150 },
    );
  });
  let dropState;
  await act(async () => {
    dropState = await controller.beginDropAnimation({ x: 50, y: 150 });
  });
  assert.ok(dropState, "StrictMode 下必须能生成落位状态");

  await act(async () => {
    await controller.reportDropComplete(dropState.operationId);
  });
  assert.equal(reorderEvents.length, 1, "StrictMode 下落位提交必须成功");
  assert.equal(reorderEvents[0].id, "task-1");

  act(() => {
    t.mock.timers.tick(60);
  });
  assert.equal(controller.isDragLocked(), false);

  // 3. 真正卸载组件
  act(() => {
    root.unmount();
  });

  // 4. 再次在 StrictMode 中重新挂载该看板，验证重新挂载后仍可完整拖拽落位
  let root2;
  act(() => {
    root2 = TestRenderer.create(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(StrictBoard, { laneId: "lane-main", tasks }),
      ),
    );
  });

  const controller2 = liveDrag.controller;
  controller2.registerContainerBounds({
    x: 0,
    y: 0,
    width: 400,
    height: 600,
  });
  controller2.registerLaneLayout("lane-main", {
    x: 0,
    y: 0,
    width: 300,
    height: 600,
  });
  controller2.setLaneCardOrder("lane-main", ["task-1", "task-2"]);

  const card2Node = root2.toJSON().children[1];
  act(() => {
    card2Node.props.onPanResponderGrant(
      { nativeEvent: {} },
      { x0: 50, y0: 100 },
    );
  });
  act(() => {
    t.mock.timers.tick(260);
  });

  assert.equal(
    controller2.getFeedback().isDragging,
    true,
    "重新挂载后必须能正常激活拖拽",
  );
  assert.equal(controller2.getFeedback().draggingTaskId, "task-2");

  let dropState2;
  await act(async () => {
    dropState2 = await controller2.beginDropAnimation({ x: 50, y: 100 });
  });
  await act(async () => {
    await controller2.reportDropComplete(dropState2.operationId);
  });

  assert.equal(reorderEvents.length, 2, "重新挂载后落位提交成功");
  assert.equal(reorderEvents[1].id, "task-2");

  act(() => {
    t.mock.timers.tick(60);
  });
  act(() => {
    root2.unmount();
  });
});
