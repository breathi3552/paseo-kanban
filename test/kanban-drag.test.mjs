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

  // Move pointer into "in-progress" lane: pointerX = 340, pointerY = 130
  controller.moveGesture(340, 130);

  const moveFeedback = controller.getFeedback();
  assert.equal(moveFeedback.isDragging, true);
  assert.equal(moveFeedback.hoveredLaneId, "in-progress");

  // Release gesture in "in-progress" lane
  await controller.releaseGesture(340, 130);

  // Assert move request
  assert.equal(moveRequests.length, 1);
  assert.deepEqual(moveRequests[0], { taskId: "task-1", targetLaneId: "in-progress" });

  // Assert feedback is cleared
  const endFeedback = controller.getFeedback();
  assert.equal(endFeedback.isDragging, false);
  assert.equal(endFeedback.draggingTaskId, null);
  assert.equal(endFeedback.draggingSourceLaneId, null);
  assert.equal(endFeedback.hoveredLaneId, null);

  // Duplicate termination events must not trigger another move request
  await controller.releaseGesture(340, 130);
  controller.cancelGesture();
  assert.equal(moveRequests.length, 1, "Duplicate termination events must be no-ops");
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
  assert.equal(moveRequests.length, 0, "Release in toolbar area must not trigger move");

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

  assert.equal(moveRequests.length, 0, "Release outside container viewport must not trigger move");
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

  assert.equal(moveRequests.length, 0, "Release in same lane must not trigger move");
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
  assert.equal(controller.getFeedback().hoveredLaneId, null, "Hover should clear in gap");

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
  assert.equal(moveRequests.length, 0, "Release vertically outside lane must not trigger move");
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
  assert.equal(controller.getFeedback().hoveredLaneId, null, "Inactive lane must not be hovered");

  await controller.releaseGesture(630, 130);
  assert.equal(moveRequests.length, 0, "Release into inactive lane must not trigger move");
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
    "Scroll update must recompute hover immediately"
  );

  // Release at pointerX = 70
  await controller.releaseGesture(70, 130);

  assert.equal(moveRequests.length, 1);
  assert.deepEqual(moveRequests[0], { taskId: "task-1", targetLaneId: "in-progress" });
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
  assert.equal(moveRequests.length, 0, "Cancelled gesture must not trigger move");

  // Extra orphan events after cancellation
  controller.moveGesture(340, 130);
  await controller.releaseGesture(340, 130);
  controller.cancelGesture();
  assert.equal(moveRequests.length, 0, "Events without active session must be no-ops");

  // Next gesture functions completely normally
  controller.startGesture("task-2", "to-plan", 70, 130);
  controller.moveGesture(340, 130);
  await controller.releaseGesture(340, 130);

  assert.equal(moveRequests.length, 1);
  assert.deepEqual(moveRequests[0], { taskId: "task-2", targetLaneId: "in-progress" });
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
  assert.deepEqual(moveRequests[0], { taskId: "task-1", targetLaneId: "in-progress" });
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
  assert.equal(secondRequests.length, 1, "Latest callback must receive move request");
  assert.deepEqual(secondRequests[0], { taskId: "task-1", targetLaneId: "done" });
});
