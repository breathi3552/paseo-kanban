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

  // 5. 真实卸载解除订阅验证: 卸载后后续事件严禁引起渲染
  const rendersBeforeUnmount = renderCount;
  act(() => {
    root.unmount();
  });

  // 卸载后再对控制器执行操作，组件不应再重新执行渲染
  act(() => {
    controller.startGesture("task-b", "lane-main", 50, 50, true);
    controller.cancelGesture();
    t.mock.timers.tick(60);
  });

  assert.equal(
    renderCount,
    rendersBeforeUnmount,
    "卸载后外部存储订阅已解除，严禁在卸载后再渲染",
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
