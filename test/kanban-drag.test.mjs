import test from "node:test";
import assert from "node:assert/strict";
import { KanbanDragController } from "../client/kanban-drag.ts";

// Focused geometry/scroll scenarios supply deterministic native measurements.
// Connected card/lane/overlay behavior lives in kanban-card-drag.test.mjs;
// native layout/touch still requires host acceptance.
const mockContainer = { x: 20, y: 80, width: 800, height: 600 };
const mockLanes = [
  { id: "to-plan", rect: { x: 10, y: 10, width: 280, height: 550 } },
  { id: "in-progress", rect: { x: 304, y: 10, width: 280, height: 550 } },
  { id: "done", rect: { x: 598, y: 10, width: 280, height: 550 } },
];
const context = { taskId: "task-1", laneId: "to-plan" };

function setupController() {
  const requests = [];
  const controller = new KanbanDragController({
    lanes: mockLanes.map(({ id }) => id),
    onReorderTask: (...args) => requests.push(args),
  });
  controller.registerContainerBounds(mockContainer);
  for (const { id, rect } of mockLanes) controller.registerLaneLayout(id, rect);
  return { controller, requests };
}

function registerCards(controller, laneId, cards) {
  controller.setLaneCardOrder(
    laneId,
    cards.map(([id]) => id),
  );
  for (const [id, y, height] of cards) {
    controller.registerCardLayout(laneId, id, { x: 10, y, width: 260, height });
  }
}

const threeCards = [
  ["task-1", 0, 64],
  ["2", 80, 64],
  ["3", 160, 64],
];

test("释放时重算落点：视口外、泳道间隙、内容外与已移除泳道均不提交且回弹回原槽位", async () => {
  for (const [label, point, removedLane] of [
    ["视口上方", { x: 340, y: 30 }],
    ["视口下方", { x: 340, y: 700 }],
    ["视口左侧", { x: 10, y: 130 }],
    ["泳道间隙", { x: 318, y: 130 }],
    ["泳道内容下方", { x: 340, y: 660 }],
    ["已移除泳道", { x: 340, y: 130 }, "in-progress"],
  ]) {
    const { controller, requests } = setupController();
    registerCards(controller, "to-plan", threeCards);
    controller.handlePointerDown(context, { x: 70, y: 130 }, "handle");
    controller.handlePointerMove({ x: 340, y: 130 });
    assert.equal(controller.getFeedback().hoveredLaneId, "in-progress", label);
    if (removedLane) controller.setLanes(["to-plan", "done"]);
    const drop = await controller.beginDropAnimation(point);
    assert.equal(drop.isDrop, false, label);
    assert.equal(
      drop.targetIndex,
      0,
      `${label}: 回弹期间源泳道槽位保持在原位 0`,
    );
    await controller.reportDropComplete(drop.operationId);
    assert.deepEqual(requests, [], label);
    assert.equal(controller.getFeedback().isDragging, false, label);
    assert.equal(controller.getFeedback().hoveredLaneId, null, label);
  }
});

test("取消后清空反馈、忽略迟到事件，下一次手势仍能落位", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  const { controller, requests } = setupController();
  controller.handlePointerDown(context, { x: 70, y: 130 }, "handle");
  controller.handlePointerMove({ x: 340, y: 130 });
  controller.handlePointerCancel();
  assert.equal(controller.getFeedback().isDragging, false);
  assert.equal(controller.getFeedback().draggingTaskId, null);
  assert.equal(controller.getFeedback().hoveredLaneId, null);
  controller.handlePointerMove({ x: 340, y: 130 });
  await controller.handlePointerUp({ x: 340, y: 130 });
  controller.handlePointerCancel();
  assert.deepEqual(requests, []);
  t.mock.timers.tick(60);
  controller.handlePointerDown(
    { taskId: "task-2", laneId: "to-plan" },
    { x: 70, y: 130 },
    "handle",
  );
  await controller.handlePointerUp({ x: 340, y: 130 });
  assert.deepEqual(requests, [["task-2", "in-progress", 0]]);
});

test("拖拽期间更新泳道与回调，释放仍交给最新回调", async () => {
  const { controller, requests: oldRequests } = setupController();
  const latestRequests = [];
  controller.handlePointerDown(context, { x: 70, y: 130 }, "handle");
  controller.setLanes(mockLanes.map(({ id }) => id));
  controller.setOnReorderTask((...args) => latestRequests.push(args));
  await controller.handlePointerUp({ x: 340, y: 130 });
  assert.deepEqual(oldRequests, []);
  assert.deepEqual(latestRequests, [["task-1", "in-progress", 0]]);
});

test("卡片边界微颤保持占位槽，突破迟滞区后切换并提交最后槽位", async () => {
  const { controller, requests } = setupController();
  registerCards(controller, "in-progress", [
    ["card-a", 20, 60],
    ["card-b", 90, 60],
  ]);
  controller.handlePointerDown(context, { x: 70, y: 130 }, "handle");
  // card-b 底部边界在窗口 y=244，迟滞区 236..252。
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
});

test("列表顶部偏移与纵向滚动参与命中，重排后二次拖拽按更新顺序重算抓取偏移与单调槽位", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  const { controller, requests } = setupController();
  controller.registerCardsViewportLayout("to-plan", {
    x: 12,
    y: 60,
    width: 260,
    height: 480,
  });
  registerCards(controller, "to-plan", [
    ["task-1", 0, 96],
    ["2", 104, 60],
    ["3", 172, 100],
  ]);
  controller.handlePointerDown(context, { x: 100, y: 180 }, "handle");
  assert.equal(controller.getFeedback().draggedCardHeight, 96);
  controller.handlePointerMove({ x: 100, y: 280 });
  assert.equal(controller.getFeedback().targetIndex, 1);
  controller.handleLaneScroll("to-plan", 100);
  assert.equal(controller.getFeedback().targetIndex, 2);
  await controller.handlePointerUp({ x: 100, y: 280 });
  assert.deepEqual(requests, [["task-1", "to-plan", 2]]);

  t.mock.timers.tick(60);
  controller.handleLaneScroll("to-plan", 0);
  // 重排为 ["3"(0..100), "task-1"(108..204), "2"(212..272)]，不重新触发 registerCardLayout。
  controller.setLaneCardOrder("to-plan", ["3", "task-1", "2"]);
  controller.handlePointerDown(
    { taskId: "2", laneId: "to-plan" },
    { x: 100, y: 390 },
    "handle",
  );
  assert.equal(controller.getFeedback().grabOffsetY, 28);
  assert.equal(controller.getFeedback().targetIndex, 2);
  controller.handlePointerMove({ x: 100, y: 270 });
  assert.equal(controller.getFeedback().targetIndex, 1);
  controller.handlePointerMove({ x: 100, y: 180 });
  assert.equal(controller.getFeedback().targetIndex, 0);
  await controller.handlePointerUp({ x: 100, y: 270 });
  assert.deepEqual(requests, [
    ["task-1", "to-plan", 2],
    ["2", "to-plan", 1],
  ]);
});

test("横向滚动使静止指针切换到空泳道，同时清除旧槽位", async () => {
  const { controller, requests } = setupController();
  registerCards(controller, "to-plan", threeCards);
  controller.handlePointerDown(context, { x: 100, y: 110 }, "handle");
  controller.handlePointerMove({ x: 100, y: 400 });
  assert.equal(controller.getFeedback().targetIndex, 2);
  controller.handleScroll(294);
  assert.equal(controller.getFeedback().hoveredLaneId, "in-progress");
  assert.equal(controller.getFeedback().targetIndex, 0);
  await controller.handlePointerUp({ x: 100, y: 400 });
  assert.deepEqual(requests, [["task-1", "in-progress", 0]]);
});

test("占位动画改变卡片布局时，同一指针保持槽位并按该槽位提交", async () => {
  const { controller, requests } = setupController();
  registerCards(controller, "to-plan", threeCards);
  controller.handlePointerDown(context, { x: 100, y: 110 }, "handle");
  controller.handlePointerMove({ x: 100, y: 190 });
  assert.equal(controller.getFeedback().targetIndex, 1);
  controller.registerCardLayout("to-plan", "2", {
    x: 10,
    y: 160,
    width: 260,
    height: 64,
  });
  controller.handlePointerMove({ x: 100, y: 190 });
  assert.equal(controller.getFeedback().targetIndex, 1);
  await controller.handlePointerUp();
  assert.deepEqual(requests, [["task-1", "to-plan", 1]]);
});

test("保存异常后清理并解锁，下一次拖拽可以成功提交", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  const { controller, requests } = setupController();
  controller.setOnReorderTask(async (...args) => {
    requests.push(args);
    if (requests.length === 1) throw new Error("Network failure");
  });
  controller.handlePointerDown(context, { x: 70, y: 130 }, "handle");
  await assert.rejects(
    controller.handlePointerUp({ x: 340, y: 130 }),
    /Network failure/,
  );
  assert.equal(controller.getDroppingState(), null);
  assert.equal(controller.getFeedback().isDragging, false);
  t.mock.timers.tick(60);
  assert.equal(controller.isDragLocked(), false);
  controller.handlePointerDown(
    { taskId: "task-2", laneId: "to-plan" },
    { x: 70, y: 130 },
    "handle",
  );
  await controller.handlePointerUp({ x: 340, y: 130 });
  assert.deepEqual(requests, [
    ["task-1", "in-progress", 0],
    ["task-2", "in-progress", 0],
  ]);
});

test("触屏快速滑动让渡滚动；长按抓起后可落位，两者都不误触详情", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  for (const longPress of [false, true]) {
    const { controller, requests } = setupController();
    let clicks = 0;
    controller.handlePointerDown(
      { ...context, onPress: () => clicks++ },
      { x: 100, y: 100 },
      "body",
      "touch",
    );
    assert.equal(controller.getFeedback().isDragging, false);
    if (longPress) t.mock.timers.tick(220);
    controller.handlePointerMove(
      longPress ? { x: 340, y: 100 } : { x: 100, y: 120 },
    );
    assert.equal(controller.getFeedback().isDragging, longPress);
    await controller.handlePointerUp();
    assert.equal(clicks, 0);
    assert.deepEqual(requests, longPress ? [["task-1", "in-progress", 0]] : []);
  }
});

test("分屏移动和缩窄后按新的窗口坐标与横向滚动定位落点", async () => {
  const { controller, requests } = setupController();
  const bounds = { x: 520, y: 80, width: 360, height: 600 };
  controller.bindContainerRef({
    measureInWindow(callback) {
      callback(bounds.x, bounds.y, bounds.width, bounds.height);
    },
  });
  controller.handleContainerLayout({ x: 0, y: 0, width: 360, height: 600 });
  controller.registerLaneLayout("to-plan", {
    x: 10,
    y: 10,
    width: 270,
    height: 550,
  });
  controller.registerLaneLayout("in-progress", {
    x: 290,
    y: 10,
    width: 270,
    height: 550,
  });
  controller.registerCardLayout("to-plan", "task-1", {
    x: 10,
    y: 20,
    width: 246,
    height: 64,
  });
  controller.handleScroll(250);
  controller.handlePointerDown(context, { x: 535, y: 130 }, "handle");
  const feedback = controller.getFeedback();
  const drop = await controller.beginDropAnimation({ x: 620, y: 130 });
  assert.equal(drop.draggedCardWidth, 246);
  assert.equal(drop.fromX, 620 - bounds.x - feedback.grabOffsetX);
  assert.equal(drop.fromY, 130 - bounds.y - feedback.grabOffsetY);
  await controller.reportDropComplete(drop.operationId);
  assert.deepEqual(requests, [["task-1", "in-progress", 0]]);
});
