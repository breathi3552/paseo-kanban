import test from "node:test";
import assert from "node:assert/strict";
import { KanbanDragController } from "../client/kanban-drag.ts";

const mockContainer = {
  x: 20,
  y: 80,
  width: 800,
  height: 600,
};

const mockLanes = [
  { id: "to-plan", rect: { x: 10, y: 10, width: 280, height: 550 } },
  { id: "in-progress", rect: { x: 304, y: 10, width: 280, height: 550 } },
  { id: "done", rect: { x: 598, y: 10, width: 280, height: 550 } },
];

function setupController(onMoveTask) {
  const controller = new KanbanDragController({
    lanes: mockLanes.map((l) => ({ id: l.id })),
    onMoveTask,
  });
  controller.registerContainerBounds(mockContainer);
  for (const lane of mockLanes) {
    controller.registerLaneLayout(lane.id, lane.rect);
  }
  return controller;
}

// ---------------------------------------------------------------------------
// 1. 有效移动: 开始、移动到另一泳道并释放
// ---------------------------------------------------------------------------
test("有效移动: 开始拖拽、移动到另一泳道并释放，仅产生一次有效移动请求且清空反馈", async () => {
  const moveRequests = [];
  const controller = setupController((taskId, targetLaneId) => {
    moveRequests.push({ taskId, targetLaneId });
  });

  // Start gesture in "to-plan" lane: pointerX = 70, pointerY = 130
  controller.startGesture("task-1", "to-plan", 70, 130);

  const startFeedback = controller.getFeedback();
  assert.equal(startFeedback.isDragging, true);
  assert.equal(startFeedback.draggingTaskId, "task-1");
  assert.equal(startFeedback.draggingSourceLaneId, "to-plan");
  assert.equal(startFeedback.hoveredLaneId, "to-plan");
  assert.equal(startFeedback.pointerX, 70);
  assert.equal(startFeedback.pointerY, 130);

  // Move pointer into "in-progress" lane: pointerX = 340, pointerY = 130
  controller.moveGesture(340, 130);

  const moveFeedback = controller.getFeedback();
  assert.equal(moveFeedback.isDragging, true);
  assert.equal(moveFeedback.hoveredLaneId, "in-progress");
  assert.equal(moveFeedback.pointerX, 340);
  assert.equal(moveFeedback.pointerY, 130);

  // Release gesture in "in-progress" lane
  await controller.releaseGesture(340, 130);

  // Assert move request
  assert.equal(moveRequests.length, 1);
  assert.deepEqual(moveRequests[0], {
    taskId: "task-1",
    targetLaneId: "in-progress",
  });

  // Assert feedback is cleared
  const endFeedback = controller.getFeedback();
  assert.equal(endFeedback.isDragging, false);
  assert.equal(endFeedback.draggingTaskId, null);
  assert.equal(endFeedback.draggingSourceLaneId, null);
  assert.equal(endFeedback.hoveredLaneId, null);
  assert.equal(endFeedback.pointerX, undefined);
  assert.equal(endFeedback.pointerY, undefined);

  // Duplicate termination events must not trigger another move request
  await controller.releaseGesture(340, 130);
  controller.cancelGesture();
  assert.equal(
    moveRequests.length,
    1,
    "Duplicate termination events must be no-ops",
  );
});

// ---------------------------------------------------------------------------
// 2. 释放重算: 悬停后移动到无效区释放
// ---------------------------------------------------------------------------
test("释放重算: 先悬停有效目标，再以工具栏位置释放，断言重新计算命中并阻止移动", async () => {
  const moveRequests = [];
  const controller = setupController((taskId, targetLaneId) => {
    moveRequests.push({ taskId, targetLaneId });
  });

  // Start gesture in "to-plan"
  controller.startGesture("task-1", "to-plan", 70, 130);

  // Move pointer into "in-progress" lane (hover active)
  controller.moveGesture(340, 130);
  assert.equal(controller.getFeedback().hoveredLaneId, "in-progress");

  // Pointer moves up into the toolbar area (pointerY = 30 < container.y = 80) and releases there
  await controller.releaseGesture(340, 30);

  // Release recalculation must reject move
  assert.equal(
    moveRequests.length,
    0,
    "Release in toolbar area must not trigger move",
  );

  // Visual feedback must be cleared
  const feedback = controller.getFeedback();
  assert.equal(feedback.isDragging, false);
  assert.equal(feedback.hoveredLaneId, null);
});

test("释放重算: 先悬停有效目标，再在视口外位置释放，断言不移动", async () => {
  const moveRequests = [];
  const controller = setupController((taskId, targetLaneId) => {
    moveRequests.push({ taskId, targetLaneId });
  });

  controller.startGesture("task-1", "to-plan", 70, 130);
  controller.moveGesture(340, 130);
  assert.equal(controller.getFeedback().hoveredLaneId, "in-progress");

  // Release below container viewport (pointerY = 700 > container.y + height = 680)
  await controller.releaseGesture(340, 700);

  assert.equal(
    moveRequests.length,
    0,
    "Release outside container viewport must not trigger move",
  );
  assert.equal(controller.getFeedback().isDragging, false);
});

// ---------------------------------------------------------------------------
// 3. 无效落点: 原泳道、泳道间隙、垂直范围外、已移除泳道
// ---------------------------------------------------------------------------
test("无效落点: 在原泳道内释放不产生移动请求", async () => {
  const moveRequests = [];
  const controller = setupController((taskId, targetLaneId) => {
    moveRequests.push({ taskId, targetLaneId });
  });

  controller.startGesture("task-1", "to-plan", 70, 130);
  controller.moveGesture(80, 150); // Still in to-plan
  await controller.releaseGesture(80, 150);

  assert.equal(
    moveRequests.length,
    0,
    "Release in same lane must not trigger move",
  );
  assert.equal(controller.getFeedback().isDragging, false);
});

test("无效落点: 在泳道水平间隙中释放不产生移动请求", async () => {
  const moveRequests = [];
  const controller = setupController((taskId, targetLaneId) => {
    moveRequests.push({ taskId, targetLaneId });
  });

  controller.startGesture("task-1", "to-plan", 70, 130);
  // Pointer in gap between to-plan and in-progress: contentX = 298 -> pointerX = 318
  controller.moveGesture(318, 130);
  assert.equal(
    controller.getFeedback().hoveredLaneId,
    null,
    "Hover should clear in gap",
  );

  await controller.releaseGesture(318, 130);
  assert.equal(moveRequests.length, 0, "Release in gap must not trigger move");
});

test("无效落点: 在泳道垂直范围外释放不产生移动请求", async () => {
  const moveRequests = [];
  const controller = setupController((taskId, targetLaneId) => {
    moveRequests.push({ taskId, targetLaneId });
  });

  controller.startGesture("task-1", "to-plan", 70, 130);
  // Below lane contentY = 580 -> pointerY = 660
  controller.moveGesture(340, 660);
  assert.equal(controller.getFeedback().hoveredLaneId, null);

  await controller.releaseGesture(340, 660);
  assert.equal(
    moveRequests.length,
    0,
    "Release vertically outside lane must not trigger move",
  );
});

test("无效落点: 释放到已不在当前看板中的泳道不产生移动请求", async () => {
  const moveRequests = [];
  // Controller where "done" lane has layout registered, but is NOT in active lanes
  const controller = new KanbanDragController({
    lanes: [{ id: "to-plan" }, { id: "in-progress" }], // "done" is excluded
    onMoveTask: (taskId, targetLaneId) => {
      moveRequests.push({ taskId, targetLaneId });
    },
  });
  controller.registerContainerBounds(mockContainer);
  for (const lane of mockLanes) {
    controller.registerLaneLayout(lane.id, lane.rect);
  }

  controller.startGesture("task-1", "to-plan", 70, 130);
  // Pointer in "done" lane
  controller.moveGesture(630, 130);
  assert.equal(
    controller.getFeedback().hoveredLaneId,
    null,
    "Inactive lane must not be hovered",
  );

  await controller.releaseGesture(630, 130);
  assert.equal(
    moveRequests.length,
    0,
    "Release into inactive lane must not trigger move",
  );
});

// ---------------------------------------------------------------------------
// 4. 滚动变化: 同一手势中更新水平滚动偏移
// ---------------------------------------------------------------------------
test("滚动变化: 在手势过程中更新水平滚动偏移，使用当前偏移计算命中并完成移动", async () => {
  const moveRequests = [];
  const controller = setupController((taskId, targetLaneId) => {
    moveRequests.push({ taskId, targetLaneId });
  });

  // Start drag at pointerX = 70 with scrollX = 0 (in "to-plan")
  controller.startGesture("task-1", "to-plan", 70, 130);
  assert.equal(controller.getFeedback().hoveredLaneId, "to-plan");

  // Board scrolls horizontally by 294px while pointer stays at x = 70
  controller.handleScroll(294);

  // Hover state automatically reflects the scrolled target ("in-progress")
  assert.equal(
    controller.getFeedback().hoveredLaneId,
    "in-progress",
    "Scroll update must recompute hover immediately",
  );

  // Release at pointerX = 70
  await controller.releaseGesture(70, 130);

  assert.equal(moveRequests.length, 1);
  assert.deepEqual(moveRequests[0], {
    taskId: "task-1",
    targetLaneId: "in-progress",
  });
});

// ---------------------------------------------------------------------------
// 5. 取消与无会话事件
// ---------------------------------------------------------------------------
test("取消与无会话事件: 手势取消时立即清空反馈且不移动，无会话后续事件安全忽略", async () => {
  const moveRequests = [];
  const controller = setupController((taskId, targetLaneId) => {
    moveRequests.push({ taskId, targetLaneId });
  });

  // Start gesture and hover over "in-progress"
  controller.startGesture("task-1", "to-plan", 70, 130);
  controller.moveGesture(340, 130);
  assert.equal(controller.getFeedback().hoveredLaneId, "in-progress");

  // Gesture cancelled
  controller.cancelGesture();

  const feedback = controller.getFeedback();
  assert.equal(feedback.isDragging, false);
  assert.equal(feedback.hoveredLaneId, null);
  assert.equal(feedback.draggingTaskId, null);
  assert.equal(
    moveRequests.length,
    0,
    "Cancelled gesture must not trigger move",
  );

  // Extra orphan events after cancellation
  controller.moveGesture(340, 130);
  await controller.releaseGesture(340, 130);
  controller.cancelGesture();
  assert.equal(
    moveRequests.length,
    0,
    "Events without active session must be no-ops",
  );

  // Next gesture functions completely normally
  controller.startGesture("task-2", "to-plan", 70, 130);
  controller.moveGesture(340, 130);
  await controller.releaseGesture(340, 130);

  assert.equal(moveRequests.length, 1);
  assert.deepEqual(moveRequests[0], {
    taskId: "task-2",
    targetLaneId: "in-progress",
  });
});

// ---------------------------------------------------------------------------
// 6. 释放坐标回退: 平台未提供有效释放位置时回退末次指针位置
// ---------------------------------------------------------------------------
test("释放坐标回退: 平台未提供有效坐标时回退使用末次已知位置", async () => {
  const moveRequests = [];
  const controller = setupController((taskId, targetLaneId) => {
    moveRequests.push({ taskId, targetLaneId });
  });

  controller.startGesture("task-1", "to-plan", 70, 130);
  // Pointer moved to in-progress
  controller.moveGesture(340, 130);

  // Platform sends 0, 0 or undefined on release
  await controller.releaseGesture(0, 0);

  assert.equal(moveRequests.length, 1);
  assert.deepEqual(moveRequests[0], {
    taskId: "task-1",
    targetLaneId: "in-progress",
  });
});

// ---------------------------------------------------------------------------
// 7. 重渲染稳定性: 更新泳道列表与回调不中断当前活动拖拽
// ---------------------------------------------------------------------------
test("重渲染稳定性: 更新泳道与回调不中断活动拖拽，并使用最新回调", async () => {
  const firstRequests = [];
  const secondRequests = [];

  const controller = setupController((taskId, targetLaneId) => {
    firstRequests.push({ taskId, targetLaneId });
  });

  controller.startGesture("task-1", "to-plan", 70, 130);

  // Simulate component re-render with new callback reference and lanes
  controller.setLanes(mockLanes.map((l) => ({ id: l.id })));
  controller.setOnMoveTask((taskId, targetLaneId) => {
    secondRequests.push({ taskId, targetLaneId });
  });

  // Move pointer to "done" lane
  controller.moveGesture(630, 130);
  assert.equal(controller.getFeedback().hoveredLaneId, "done");

  await controller.releaseGesture(630, 130);

  assert.equal(firstRequests.length, 0, "Old callback must not be called");
  assert.equal(
    secondRequests.length,
    1,
    "Latest callback must receive move request",
  );
  assert.deepEqual(secondRequests[0], {
    taskId: "task-1",
    targetLaneId: "done",
  });
});

// ---------------------------------------------------------------------------
// 8. 手势位移阈值 (5px slop threshold) 与互斥锁 (dragLock)
// ---------------------------------------------------------------------------
test("手势分流: 鼠标按住移动 < 5px 识别为点击，>= 5px 激活拖拽与互斥锁", async () => {
  const reorderRequests = [];
  const controller = new KanbanDragController({
    lanes: mockLanes.map((l) => ({ id: l.id })),
    onReorderTask: (taskId, targetLaneId, targetIndex) => {
      reorderRequests.push({ taskId, targetLaneId, targetIndex });
    },
  });
  controller.registerContainerBounds(mockContainer);
  for (const lane of mockLanes) {
    controller.registerLaneLayout(lane.id, lane.rect);
  }

  // 1. 小于 5px 位移 (桌面端按住不放只晃动 2px)
  controller.startGesture(
    "task-1",
    "to-plan",
    70,
    130,
    false /* immediate = false */,
  );
  assert.equal(controller.getFeedback().isDragging, false);
  assert.equal(controller.isDragLocked(), false);

  controller.moveGesture(72, 131); // sqrt(2^2 + 1^2) = 2.23px < 5px
  assert.equal(controller.getFeedback().isDragging, false);
  assert.equal(controller.isDragLocked(), false);

  await controller.releaseGesture(72, 131);
  assert.equal(reorderRequests.length, 0, "未达阈值释放不触发重排");
  assert.equal(controller.isDragLocked(), false, "未达阈值释放不锁定点击");

  // 2. 超过 5px 位移 (激活拖拽)
  controller.startGesture("task-1", "to-plan", 70, 130, false);
  controller.moveGesture(76, 135); // sqrt(6^2 + 5^2) = 7.81px >= 5px
  assert.equal(controller.getFeedback().isDragging, true);
  assert.equal(controller.isDragLocked(), true);

  // 移入 in-progress 并释放
  controller.moveGesture(340, 130);
  await controller.releaseGesture(340, 130);
  assert.equal(reorderRequests.length, 1);
  assert.equal(reorderRequests[0].targetLaneId, "in-progress");
  assert.equal(
    controller.isDragLocked(),
    true,
    "拖拽刚结束时互斥锁保持生效，防止松手误触发点击",
  );
});

// ---------------------------------------------------------------------------
// 9. 目标槽位计算与卡片间迟滞死区 (Hysteresis Buffer)
// ---------------------------------------------------------------------------
test("槽位与防抖: 重合卡片位置直接落位并使原卡片顺移，卡片分界迟滞死区防止临界微颤", async () => {
  const controller = setupController();
  // 注册 in-progress 泳道内 2 张现有卡片
  // container.y = 80, lane.y = 10, 因此卡片相对 containerOriginY:
  // 卡片 1 (card-a): y = 20, height = 60. windowY = 110 ~ 170.
  // 卡片 2 (card-b): y = 90, height = 60. windowY = 180 ~ 240.
  // 两卡片间分界线: windowY = (170 + 180) / 2 = 175 (死区 167 ~ 183)
  // card-b 底部边界: windowY = 240 + 4 = 244 (死区 236 ~ 252)
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

  controller.startGesture("task-1", "to-plan", 70, 130, true);

  // 移动到 in-progress，光标在 card-a 重合位置 (windowY = 110 < 167) -> index 0 (card-a 顺移)
  controller.moveGesture(340, 110);
  assert.equal(controller.getFeedback().hoveredLaneId, "in-progress");
  assert.equal(controller.getFeedback().targetIndex, 0);

  // 移动到 card-b 重合位置 (windowY = 200, 处于 183 ~ 236 之间) -> index 1 (card-b 顺移)
  controller.moveGesture(340, 200);
  assert.equal(controller.getFeedback().targetIndex, 1);

  // 向下移动，进入 card-b 底部迟滞缓冲死区 (windowY = 240, 死区 236 ~ 252)
  controller.moveGesture(340, 240);
  assert.equal(
    controller.getFeedback().targetIndex,
    1,
    "死区内微颤保持原有槽位 index 1",
  );

  // 向下突破底部迟滞死区 (windowY = 260 > 252) -> index 2 (落位末尾)
  controller.moveGesture(340, 260);
  assert.equal(controller.getFeedback().targetIndex, 2);

  // 向上轻微回退至 windowY = 240 (处于 236 ~ 252 死区)
  // 保持当前 index 2，不产生抖动！
  controller.moveGesture(340, 240);
  assert.equal(
    controller.getFeedback().targetIndex,
    2,
    "回退在死区内保持已有 index 2",
  );

  // 向上突破死区上界回到 card-b 重合区 (windowY = 210 < 236) -> index 切回 1
  controller.moveGesture(340, 210);
  assert.equal(controller.getFeedback().targetIndex, 1);

  await controller.releaseGesture();
});

test("卡片坐标: 包含列表顶部偏移与纵向滚动，滚动后原地释放匹配新槽位", async () => {
  const requests = [];
  const controller = setupController();
  controller.setOnReorderTask((...args) => requests.push(args));
  controller.registerCardsViewportLayout("to-plan", {
    x: 12,
    y: 60,
    width: 260,
    height: 480,
  });
  controller.setLaneCardOrder("to-plan", ["1", "2", "3"]);
  for (const [id, y, height] of [
    ["1", 0, 96],
    ["2", 104, 60],
    ["3", 172, 100],
  ]) {
    controller.registerCardLayout("to-plan", id, {
      x: 0,
      y,
      width: 260,
      height,
    });
  }
  controller.startGesture("1", "to-plan", 100, 180);
  assert.equal(controller.getFeedback().draggedCardHeight, 96);
  controller.moveGesture(100, 200);
  assert.equal(controller.getFeedback().targetIndex, 0);
  controller.moveGesture(100, 280);
  assert.equal(controller.getFeedback().targetIndex, 1);
  controller.handleLaneScroll("to-plan", 100);
  assert.equal(
    controller.getFeedback().targetIndex,
    2,
    "scrolling must recompute the slot without a pointer move",
  );
  await controller.releaseGesture(100, 280);
  assert.deepEqual(requests, [["1", "to-plan", 2]]);
});

test("横向滚动切换泳道时同时更新槽位，空泳道索引为零", async () => {
  const requests = [];
  const controller = setupController();
  controller.setOnReorderTask((...args) => requests.push(args));
  controller.setLaneCardOrder("to-plan", ["1", "2", "3"]);
  for (const [i, id] of ["1", "2", "3"].entries()) {
    controller.registerCardLayout("to-plan", id, {
      x: 10,
      y: i * 80,
      width: 260,
      height: 64,
    });
  }
  controller.startGesture("1", "to-plan", 100, 110);
  controller.moveGesture(100, 400);
  assert.equal(controller.getFeedback().targetIndex, 2);
  controller.handleScroll(294);
  assert.equal(controller.getFeedback().hoveredLaneId, "in-progress");
  assert.equal(controller.getFeedback().targetIndex, 0);
  await controller.releaseGesture(100, 400);
  assert.deepEqual(requests, [["1", "in-progress", 0]]);
});

test("占位动画不能反过来改变命中阈值", () => {
  const controller = setupController();
  controller.setLaneCardOrder("to-plan", ["1", "2", "3"]);
  for (const [i, id] of ["1", "2", "3"].entries()) {
    controller.registerCardLayout("to-plan", id, {
      x: 10,
      y: i * 80,
      width: 260,
      height: 64,
    });
  }
  controller.startGesture("1", "to-plan", 100, 110);
  controller.moveGesture(100, 230);
  assert.equal(controller.getFeedback().targetIndex, 1);
  // Source leaves flow; the slot expands. The same pointer must not oscillate.
  controller.registerCardLayout("to-plan", "2", {
    x: 10,
    y: 160,
    width: 260,
    height: 64,
  });
  controller.moveGesture(100, 230);
  assert.equal(controller.getFeedback().targetIndex, 1);
  controller.cancelGesture();
});

test("卡片重合定位: 挪到目标卡片重合区域释放时，拖拽卡片落位于重合卡片槽位，下方卡片顺移", async () => {
  const requests = [];
  const controller = setupController();
  controller.setOnReorderTask((...args) => requests.push(args));
  controller.setLaneCardOrder("in-progress", ["A", "B", "C"]);
  // container.y = 80, lane.y = 10 -> origin = 90
  // A: y = 0, h = 60 (window 90 ~ 150)
  // B: y = 70, h = 60 (window 160 ~ 220)
  // C: y = 140, h = 60 (window 230 ~ 290)
  controller.registerCardLayout("in-progress", "A", {
    x: 10,
    y: 0,
    width: 260,
    height: 60,
  });
  controller.registerCardLayout("in-progress", "B", {
    x: 10,
    y: 70,
    width: 260,
    height: 60,
  });
  controller.registerCardLayout("in-progress", "C", {
    x: 10,
    y: 140,
    width: 260,
    height: 60,
  });

  // 1. 跨泳道拖动到卡片 B 的重合位置 (windowY = 190，处于卡片 B 正中)
  controller.startGesture("task-x", "to-plan", 70, 130, true);
  controller.moveGesture(340, 190);
  assert.equal(controller.getFeedback().hoveredLaneId, "in-progress");
  assert.equal(
    controller.getFeedback().targetIndex,
    1,
    "重合卡片 B 时落位于卡片 B 原槽位 index 1",
  );
  await controller.releaseGesture(340, 190);
  assert.deepEqual(requests[0], ["task-x", "in-progress", 1]);

  // 2. 同泳道从下方 (卡片 C) 拖动到卡片 B 的重合位置 (windowY = 190)
  controller.startGesture("C", "in-progress", 340, 260, true);
  controller.moveGesture(340, 190);
  assert.equal(
    controller.getFeedback().targetIndex,
    1,
    "从下方移到重合位置，落位于卡片 B 原槽位 index 1",
  );
  await controller.releaseGesture(340, 190);
  assert.deepEqual(requests[1], ["C", "in-progress", 1]);

  // 3. 同泳道从上方 (卡片 A) 拖动到卡片 B 的重合位置 (windowY = 190)
  controller.startGesture("A", "in-progress", 340, 120, true);
  controller.moveGesture(340, 190);
  assert.equal(
    controller.getFeedback().targetIndex,
    1,
    "从上方移到重合位置，卡片 A 占位卡片 B 原槽位 index 1",
  );
  await controller.releaseGesture(340, 190);
  assert.deepEqual(requests[2], ["A", "in-progress", 1]);

  // 4. 移动到所有卡片下方空白区域 (windowY = 320 > 290)
  controller.startGesture("task-x", "to-plan", 70, 130, true);
  controller.moveGesture(340, 320);
  assert.equal(
    controller.getFeedback().targetIndex,
    3,
    "移至底部空白区域时落位于泳道末尾 index 3",
  );
  await controller.releaseGesture(340, 320);
  assert.deepEqual(requests[3], ["task-x", "in-progress", 3]);
});

test("同泳道释放: 顶部、中间、底部落位均与占位索引一致", async () => {
  for (const [y, expected] of [
    [110, 0],
    [230, 1],
    [400, 2],
  ]) {
    const requests = [];
    const controller = setupController();
    controller.setOnReorderTask((...args) => requests.push(args));
    controller.setLaneCardOrder("to-plan", ["1", "2", "3"]);
    for (const [i, id] of ["1", "2", "3"].entries()) {
      controller.registerCardLayout("to-plan", id, {
        x: 10,
        y: i * 80,
        width: 260,
        height: 64,
      });
    }
    controller.startGesture("1", "to-plan", 100, 110);
    controller.moveGesture(100, y);
    assert.equal(controller.getFeedback().targetIndex, expected);
    await controller.releaseGesture(100, y);
    assert.deepEqual(requests, [["1", "to-plan", expected]]);
  }
});

// ---------------------------------------------------------------------------
// 10. 视口边缘感应平滑自动滚动 (Edge Auto-scroll)
// ---------------------------------------------------------------------------
test("边缘滚动: 接近看板视口左右 48px 边缘时输出定向速度矢量", async () => {
  const controller = setupController();
  controller.startGesture("task-1", "to-plan", 70, 130, true);

  // mockContainer: x = 20, width = 800. 视口范围 20 ~ 820
  // 左侧边缘区: 20 ~ 68. 指针在 x = 30 时进入左侧边缘
  controller.moveGesture(30, 130);
  assert.ok(
    (controller.getFeedback().autoScrollVelocity ?? 0) < 0,
    "左侧边缘速度应为负",
  );

  // 中间安全区: x = 400
  controller.moveGesture(400, 130);
  assert.equal(
    controller.getFeedback().autoScrollVelocity ?? 0,
    0,
    "中间安全区速度为 0",
  );

  // 右侧边缘区: 820 - 48 = 772 ~ 820. 指针在 x = 800 时进入右侧边缘
  controller.moveGesture(800, 130);
  assert.ok(
    (controller.getFeedback().autoScrollVelocity ?? 0) > 0,
    "右侧边缘速度应为正",
  );

  await controller.releaseGesture();
});

// ---------------------------------------------------------------------------
// 11. 失败清理与互斥锁释放
// ---------------------------------------------------------------------------
test("失败清理: 提交回调抛出异常或保存被拒绝后，互斥锁仍能正常释放，后续可继续操作", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });

  let attempts = 0;
  const controller = setupController();
  controller.setOnReorderTask(async () => {
    attempts++;
    throw new Error("Network failure");
  });

  controller.startGesture("task-1", "to-plan", 70, 130, true);
  controller.moveGesture(340, 130);

  try {
    await controller.releaseGesture(340, 130);
  } catch (err) {
    assert.match(String(err), /Network failure/);
  }

  // 推进 60ms 释放互斥锁
  t.mock.timers.tick(60);

  assert.equal(attempts, 1, "重排回调应且仅应被调用一次");
  assert.equal(controller.isDragLocked(), false, "互斥锁必须在失败后恢复释放");
  assert.equal(controller.getFeedback().isDragging, false);

  // 下一次操作必须可以正常进行
  controller.startGesture("task-2", "to-plan", 70, 130, true);
  assert.equal(controller.getFeedback().isDragging, true);
  assert.equal(controller.getFeedback().draggingTaskId, "task-2");
  controller.cancelGesture();
});

// ---------------------------------------------------------------------------
// 12. 统一手势输入入口 (handlePointerDown/Move/Up/Cancel)
// ---------------------------------------------------------------------------
test("共同输入入口: 轻点分流、手柄立即激活与主体位移升级拖拽", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });

  const reorders = [];
  let clicks = 0;
  const controller = setupController();
  controller.setOnReorderTask((...args) => reorders.push(args));
  const ctx = {
    taskId: "t1",
    laneId: "to-plan",
    onPress: () => {
      clicks++;
    },
  };

  // 1. 轻点: 按下并在原地抬起 (< 5px)，触发 onPress，不触发排序
  controller.handlePointerDown(ctx, { x: 100, y: 100 }, "body");
  await controller.handlePointerUp({ x: 100, y: 100 });
  assert.equal(clicks, 1, "原地松手识别为轻点打开详情");
  assert.equal(reorders.length, 0, "轻点不产生排序");

  // 2. 主体移动 >= 5px 激活拖拽
  controller.handlePointerDown(ctx, { x: 100, y: 100 }, "body");
  controller.handlePointerMove({ x: 106, y: 100 });
  assert.equal(
    controller.getFeedback().isDragging,
    true,
    "位移 >= 5px 激活拖拽",
  );
  await controller.handlePointerUp({ x: 340, y: 100 });
  assert.equal(clicks, 1, "拖拽不触发点击");
  assert.equal(reorders.length, 1, "释放触发排序");

  // 推进 60ms 释放互斥锁
  t.mock.timers.tick(60);

  // 3. 手柄立即激活
  controller.handlePointerDown(ctx, { x: 50, y: 50 }, "handle");
  assert.equal(controller.getFeedback().isDragging, true, "手柄按下立即激活");
  await controller.handlePointerUp({ x: 340, y: 100 });
  assert.equal(clicks, 1, "手柄拖拽不触发点击");
  assert.equal(reorders.length, 2, "手柄释放触发排序");
});

// ---------------------------------------------------------------------------
// 13. 触屏 220ms 长按抓起与快速滑动让渡滚动
// ---------------------------------------------------------------------------
test("触屏输入: 220ms 长按抓起，长按前快速滑动让渡滚动且不触发拖拽与轻点", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });

  let clicks = 0;
  const reorders = [];
  const controller = setupController();
  controller.setOnReorderTask((...args) => reorders.push(args));
  const ctx = {
    taskId: "t1",
    laneId: "to-plan",
    onPress: () => {
      clicks++;
    },
  };

  // 1. 触屏在 220ms 前快速滑动 (移动 >= 5px): 应取消手势，不升级拖拽，不触发轻点
  controller.handlePointerDown(ctx, { x: 100, y: 100 }, "body", "touch");
  controller.handlePointerMove({ x: 100, y: 120 }); // 滑动 20px
  assert.equal(
    controller.getFeedback().isDragging,
    false,
    "快速滑动不得升级为拖拽",
  );
  await controller.handlePointerUp({ x: 100, y: 120 });
  assert.equal(clicks, 0, "快速滑动不得误触详情弹窗");
  assert.equal(reorders.length, 0);

  // 推进 60ms 释放互斥锁
  t.mock.timers.tick(60);

  // 2. 触屏长按 220ms: 成功抓起卡片
  controller.handlePointerDown(ctx, { x: 100, y: 100 }, "body", "touch");
  assert.equal(
    controller.getFeedback().isDragging,
    false,
    "按下未满 220ms 前未激活",
  );

  // 推进 220ms 触屏长按到时
  t.mock.timers.tick(220);
  assert.equal(
    controller.getFeedback().isDragging,
    true,
    "触屏长按 220ms 后激活拖拽",
  );

  // 后续滑动正常跟随
  controller.handlePointerMove({ x: 340, y: 100 });
  await controller.handlePointerUp({ x: 340, y: 100 });
  assert.equal(clicks, 0);
  assert.equal(reorders.length, 1);
});

// ---------------------------------------------------------------------------
// 14. 操作身份与动画生命周期闭环
// ---------------------------------------------------------------------------
test("动画与事务闭环: 操作身份保护，仅完成落位提交一次，重复上报与中断零提交", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });

  const reorders = [];
  const controller = setupController();
  controller.setOnReorderTask((...args) => reorders.push(args));
  const ctx = { taskId: "t1", laneId: "to-plan", onPress: () => {} };

  // 1. 正常落位与可控动画完成上报
  controller.handlePointerDown(ctx, { x: 50, y: 50 }, "handle");
  controller.handlePointerMove({ x: 340, y: 100 });
  const droppingState = await controller.beginDropAnimation({ x: 340, y: 100 });
  assert.ok(droppingState, "必须生成落位动画状态");
  assert.ok(droppingState.operationId, "必须包含操作唯一标识");
  assert.equal(droppingState.targetLaneId, "in-progress");
  assert.equal(reorders.length, 0, "未完成动画前不得提交");

  // 上报完成: 触发唯一一次提交
  await controller.reportDropComplete(droppingState.operationId);
  assert.equal(reorders.length, 1, "动画完成后提交一次");

  // 重复上报过期/旧 operationId: 不得产生二次写入
  await controller.reportDropComplete(droppingState.operationId);
  assert.equal(reorders.length, 1, "重复完成通知不得重复写入");

  t.mock.timers.tick(60);

  // 2. 动画中断: 调用 abortDrop，零提交
  controller.handlePointerDown(ctx, { x: 50, y: 50 }, "handle");
  controller.handlePointerMove({ x: 340, y: 100 });
  const droppingState2 = await controller.beginDropAnimation({
    x: 340,
    y: 100,
  });
  controller.abortDrop(droppingState2.operationId);
  assert.equal(reorders.length, 1, "中断动画不得提交");
});

// ---------------------------------------------------------------------------
// 15. 落位动画状态保持与任务快照动态解析
// ---------------------------------------------------------------------------
test("落位动画与提交流程: 动态预览更新、保存期间保持落位状态防止原位闪烁、快速释放互斥锁", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });

  let saveStarted = false;
  let saveCompleted = false;
  let droppingStateDuringSave = null;

  const controller = setupController();
  // 初始为 null 的获取器（模拟初始化时 board 尚未加载）
  controller.setGetTaskPreview?.(() => null);

  // 随后数据就绪，动态注入真实获取器
  if (controller.setGetTaskPreview) {
    controller.setGetTaskPreview((taskId) => ({
      task: { id: taskId, title: "Dynamic Task", subtasks: [] },
      projectDisplayName: "Project Alpha",
    }));
  }

  controller.setOnReorderTask(async () => {
    saveStarted = true;
    droppingStateDuringSave = controller.getDroppingState();
    await new Promise((r) => setTimeout(r, 40));
    saveCompleted = true;
  });

  const ctx = { taskId: "dyn-1", laneId: "to-plan", onPress: () => {} };
  controller.handlePointerDown(ctx, { x: 50, y: 50 }, "handle");
  controller.handlePointerMove({ x: 340, y: 100 });

  const drop = await controller.beginDropAnimation({ x: 340, y: 100 });
  assert.ok(drop, "必须生成落位动画状态");
  assert.equal(drop.task?.title, "Dynamic Task", "必须使用动态注入的任务快照");
  assert.equal(drop.projectName, "Project Alpha", "必须使用动态注入的项目名称");

  // 发起提交
  const reportPromise = controller.reportDropComplete(drop.operationId);
  // 在保存过程中断言
  assert.equal(saveStarted, true, "应当已经触发保存");
  assert.ok(
    droppingStateDuringSave,
    "保存期间必须保留 droppingState，防止卡片闪回原位",
  );
  assert.equal(droppingStateDuringSave.taskId, "dyn-1");

  t.mock.timers.tick(40);
  await reportPromise;
  assert.equal(saveCompleted, true, "保存已完成");
  assert.equal(
    controller.getDroppingState(),
    null,
    "保存完成后清除 droppingState",
  );

  // 验证快速解锁（60ms 缓冲后即解锁，不超过 100ms）
  t.mock.timers.tick(60);
  assert.equal(
    controller.isDragLocked(),
    false,
    "互斥锁必须在平滑缓冲后迅速解锁",
  );
});
