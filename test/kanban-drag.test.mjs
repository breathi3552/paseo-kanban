import test from "node:test";
import assert from "node:assert/strict";
import { loadClientModule } from "./helpers/react-host-env.mjs";

const { KanbanDragController } = loadClientModule("kanban-drag");

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
    controller.handlePointerMove(point);
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

test("列表顶部偏移与纵向滚动参与命中并提交可见落点", async () => {
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
  controller.handlePointerMove({ x: 620, y: 130 });
  const drop = await controller.beginDropAnimation({ x: 620, y: 130 });
  assert.equal(drop.draggedCardWidth, 246);
  assert.equal(drop.fromX, 620 - bounds.x - feedback.grabOffsetX);
  assert.equal(drop.fromY, 130 - bounds.y - feedback.grabOffsetY);
  await controller.reportDropComplete(drop.operationId);
  assert.deepEqual(requests, [["task-1", "in-progress", 0]]);
});
