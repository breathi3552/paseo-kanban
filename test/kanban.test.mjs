import test from "node:test";
import assert from "node:assert/strict";
import {
  KanbanBoardSchema,
  addLane,
  updateLane,
  deleteLane,
  addTask,
  updateTask,
  deleteTask,
  reorderTask,
  filterTasksByProject,
} from "../shared/kanban.ts";

test("KanbanBoardSchema: parses empty object into default lanes and empty tasks", () => {
  const board = KanbanBoardSchema.parse({});
  assert.equal(board.lanes.length, 3);
  assert.deepEqual(
    board.lanes.map((l) => l.id),
    ["to-plan", "in-progress", "done"],
  );
  assert.equal(board.lanes[0].title, "待规划");
  assert.equal(board.lanes[1].title, "执行中");
  assert.equal(board.lanes[2].title, "已完成");
  assert.deepEqual(board.tasks, []);
});

test("KanbanBoardSchema: rejects duplicate lane IDs and empty lane titles", () => {
  assert.throws(
    () =>
      KanbanBoardSchema.parse({
        lanes: [
          { id: "l1", title: "Lane 1" },
          { id: "l1", title: "Lane 1 Duplicate" },
        ],
        tasks: [],
      }),
    /Duplicate lane ID/,
  );

  assert.throws(
    () =>
      KanbanBoardSchema.parse({
        lanes: [{ id: "l1", title: "   " }],
        tasks: [],
      }),
    /Lane title cannot be empty/,
  );
});

test("KanbanBoardSchema: rejects duplicate task IDs, empty titles, and dangling lane IDs", () => {
  assert.throws(
    () =>
      KanbanBoardSchema.parse({
        lanes: [{ id: "l1", title: "Lane 1" }],
        tasks: [
          { id: "t1", title: "Task 1", laneId: "l1" },
          { id: "t1", title: "Task 1 dup", laneId: "l1" },
        ],
      }),
    /Duplicate task ID/,
  );

  assert.throws(
    () =>
      KanbanBoardSchema.parse({
        lanes: [{ id: "l1", title: "Lane 1" }],
        tasks: [{ id: "t1", title: "   ", laneId: "l1" }],
      }),
    /Task title cannot be empty/,
  );

  assert.throws(
    () =>
      KanbanBoardSchema.parse({
        lanes: [{ id: "l1", title: "Lane 1" }],
        tasks: [{ id: "t1", title: "Task 1", laneId: "non-existent" }],
      }),
    /references non-existent lane/,
  );
});

test("KanbanBoardSchema: rejects duplicate subtask IDs within the same task", () => {
  assert.throws(
    () =>
      KanbanBoardSchema.parse({
        lanes: [{ id: "l1", title: "Lane 1" }],
        tasks: [
          {
            id: "t1",
            title: "Task 1",
            laneId: "l1",
            subtasks: [
              { id: "s1", title: "Sub 1", completed: false },
              { id: "s1", title: "Sub 2", completed: true },
            ],
          },
        ],
      }),
    /Duplicate subtask ID/,
  );
});

test("Lane operations: add, rename, and protect against non-empty or last lane deletion", () => {
  const initial = KanbanBoardSchema.parse({});

  // Add lane
  const withTesting = addLane(initial, { id: "testing", title: "测试中" });
  assert.equal(withTesting.lanes.length, 4);
  assert.equal(withTesting.lanes[3].id, "testing");

  // Rename lane
  const renamed = updateLane(withTesting, "testing", { title: "QA验证" });
  assert.equal(renamed.lanes[3].title, "QA验证");

  // Add task to testing lane
  const withTask = addTask(renamed, {
    id: "task-1",
    title: "Verify login",
    laneId: "testing",
    projectId: "proj_123",
  });

  // Protection 1: cannot delete lane with tasks
  assert.throws(
    () => deleteLane(withTask, "testing"),
    /because it contains tasks/,
  );

  // Move task away, then delete succeeds
  const moved = updateTask(withTask, "task-1", { laneId: "done" });
  const deleted = deleteLane(moved, "testing");
  assert.equal(deleted.lanes.length, 3);
  assert.equal(
    deleted.lanes.some((l) => l.id === "testing"),
    false,
  );

  // Protection 2: cannot delete the last remaining lane
  const singleLaneBoard = {
    lanes: [{ id: "only", title: "Only Lane" }],
    tasks: [],
  };
  assert.throws(
    () => deleteLane(singleLaneBoard, "only"),
    /Cannot delete the last remaining lane/,
  );
});

test("Task operations: create, update, delete, cross-lane movement, and project association", () => {
  const initial = KanbanBoardSchema.parse({});

  // Create task with null projectId
  const b1 = addTask(initial, {
    id: "task-a",
    title: "Setup DB",
    laneId: "to-plan",
  });
  assert.equal(b1.tasks.length, 1);
  assert.equal(b1.tasks[0].id, "task-a");
  assert.equal(b1.tasks[0].projectId, null);
  assert.equal(b1.tasks[0].description, "");
  assert.deepEqual(b1.tasks[0].subtasks, []);

  // Update task description and set projectId
  const b2 = updateTask(b1, "task-a", {
    description: "SQLite setup",
    projectId: "proj_real_456",
  });
  assert.equal(b2.tasks[0].description, "SQLite setup");
  assert.equal(b2.tasks[0].projectId, "proj_real_456");

  // Cross-lane move
  const b3 = updateTask(b2, "task-a", { laneId: "in-progress" });
  assert.equal(b3.tasks[0].laneId, "in-progress");

  // Reject move to invalid lane
  assert.throws(
    () => updateTask(b3, "task-a", { laneId: "ghost-lane" }),
    /Target lane "ghost-lane" does not exist/,
  );

  // Delete task
  const b4 = deleteTask(b3, "task-a");
  assert.equal(b4.tasks.length, 0);

  // Original board is immutable
  assert.equal(initial.tasks.length, 0);
});

test("Task reorder operations: intra-lane, cross-lane, clamping, and visible-relative splice", () => {
  const initial = KanbanBoardSchema.parse({});
  const b1 = addTask(initial, {
    id: "t1",
    title: "Task 1",
    laneId: "to-plan",
    projectId: "projA",
  });
  const b2 = addTask(b1, {
    id: "t2",
    title: "Task 2",
    laneId: "to-plan",
    projectId: "projB",
  });
  const b3 = addTask(b2, {
    id: "t3",
    title: "Task 3",
    laneId: "to-plan",
    projectId: "projA",
  });
  const b4 = addTask(b3, {
    id: "t4",
    title: "Task 4",
    laneId: "in-progress",
  });

  assert.deepEqual(
    filterTasksByProject(b4.tasks, "projA").map((t) => t.id),
    ["t1", "t3"],
  );
  assert.deepEqual(
    filterTasksByProject(b4.tasks, "unassigned").map((t) => t.id),
    ["t4"],
  );

  // 1. Intra-lane move down: t1 from index 0 to index 2 in to-plan
  const reordered1 = reorderTask(b4, "t1", "to-plan", 2);
  const toPlanTasks1 = reordered1.tasks
    .filter((t) => t.laneId === "to-plan")
    .map((t) => t.id);
  assert.deepEqual(toPlanTasks1, ["t2", "t3", "t1"]);

  // 2. Intra-lane move up: t3 to index 0 in to-plan
  const reordered2 = reorderTask(b4, "t3", "to-plan", 0);
  const toPlanTasks2 = reordered2.tasks
    .filter((t) => t.laneId === "to-plan")
    .map((t) => t.id);
  assert.deepEqual(toPlanTasks2, ["t3", "t1", "t2"]);

  // 3. Cross-lane move: t1 from to-plan to in-progress at index 0 (before t4)
  const reordered3 = reorderTask(b4, "t1", "in-progress", 0);
  const inProgressTasks = reordered3.tasks
    .filter((t) => t.laneId === "in-progress")
    .map((t) => t.id);
  assert.deepEqual(inProgressTasks, ["t1", "t4"]);
  assert.equal(
    reordered3.tasks.find((t) => t.id === "t1")?.laneId,
    "in-progress",
  );

  // 目标泳道为空时按泳道顺序插入全量数组
  const movedToEmptyLane = reorderTask(b4, "t1", "done", 0);
  assert.deepEqual(
    movedToEmptyLane.tasks.map((t) => `${t.id}:${t.laneId}`),
    ["t2:to-plan", "t3:to-plan", "t4:in-progress", "t1:done"],
  );

  // 4. Clamping: negative index clamps to 0, huge index clamps to end
  const clampedLow = reorderTask(b4, "t3", "to-plan", -10);
  assert.deepEqual(
    clampedLow.tasks.filter((t) => t.laneId === "to-plan").map((t) => t.id),
    ["t3", "t1", "t2"],
  );
  const clampedHigh = reorderTask(b4, "t1", "to-plan", 9999);
  assert.deepEqual(
    clampedHigh.tasks.filter((t) => t.laneId === "to-plan").map((t) => t.id),
    ["t2", "t3", "t1"],
  );

  // 5. 项目筛选下从可见槽位插入全量数组；t2 隐藏但仍留在看板中
  const relativeMove = reorderTask(b4, "t3", "to-plan", 0, "projA");
  const toPlanTasksRel = relativeMove.tasks
    .filter((t) => t.laneId === "to-plan")
    .map((t) => t.id);
  // t3 is inserted before t1; t2 is still in the lane and its relative position to others is maintained
  assert.deepEqual(toPlanTasksRel, ["t3", "t1", "t2"]);

  // 6. Error handling
  assert.throws(
    () => reorderTask(b4, "non-existent", "to-plan", 0),
    /Task with ID "non-existent" not found/,
  );
  assert.throws(
    () => reorderTask(b4, "t1", "invalid-lane", 0),
    /Target lane "invalid-lane" does not exist/,
  );
});

test("Task reorder with project filter: no-anchor cross-lane append, self-only no-op, and non-integer rejection", () => {
  const initial = KanbanBoardSchema.parse({});
  // to-plan: t1 (projA), t2 (projB)
  // in-progress: t3 (projB), t4 (projB)
  // done: empty
  const b1 = addTask(initial, {
    id: "t1",
    title: "Task 1",
    laneId: "to-plan",
    projectId: "projA",
  });
  const b2 = addTask(b1, {
    id: "t2",
    title: "Task 2",
    laneId: "to-plan",
    projectId: "projB",
  });
  const b3 = addTask(b2, {
    id: "t3",
    title: "Task 3",
    laneId: "in-progress",
    projectId: "projB",
  });
  const b4 = addTask(b3, {
    id: "t4",
    title: "Task 4",
    laneId: "in-progress",
    projectId: "projB",
  });

  // Filter is projA.
  // In in-progress lane, there are only hidden tasks (t3, t4), no projA visible tasks.
  // Moving t1 (projA) into in-progress with targetIndex = 0:
  // Must append to the END of in-progress tasks, NOT insert before t3!
  const movedCrossLane = reorderTask(b4, "t1", "in-progress", 0, {
    type: "project",
    projectId: "projA",
  });
  const fullTasks = movedCrossLane.tasks.map((t) => `${t.id}:${t.laneId}`);
  assert.deepEqual(
    fullTasks,
    ["t2:to-plan", "t3:in-progress", "t4:in-progress", "t1:in-progress"],
    "无可见锚点时应追加到目标泳道现有隐藏任务末尾",
  );
  // Verify other tasks content and relative order are completely unchanged
  assert.deepEqual(
    movedCrossLane.tasks.find((t) => t.id === "t3"),
    b4.tasks.find((t) => t.id === "t3"),
  );
  assert.deepEqual(
    movedCrossLane.tasks.find((t) => t.id === "t4"),
    b4.tasks.find((t) => t.id === "t4"),
  );

  // Same lane self-only visible no-op:
  // In to-plan under projA, t1 is the only visible task (t2 is hidden projB).
  // Dropping at slot 0 must keep t1 at its original position relative to t2.
  const sameLaneSelfOnly = reorderTask(b4, "t1", "to-plan", 0, "projA");
  assert.deepEqual(
    sameLaneSelfOnly.tasks.map((t) => t.id),
    ["t1", "t2", "t3", "t4"],
    "同泳道仅自身可见时原位释放不改变任务次序",
  );

  // Non-integer and non-finite index rejection:
  assert.throws(
    () => reorderTask(b4, "t1", "to-plan", NaN),
    /Target index must be a finite integer/,
  );
  assert.throws(
    () => reorderTask(b4, "t1", "to-plan", Infinity),
    /Target index must be a finite integer/,
  );
  assert.throws(
    () => reorderTask(b4, "t1", "to-plan", 1.5),
    /Target index must be a finite integer/,
  );
});
