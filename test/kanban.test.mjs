import test from "node:test";
import assert from "node:assert/strict";
import {
  KanbanBoardSchema,
  DEFAULT_LANES,
  addLane,
  updateLane,
  deleteLane,
  addTask,
  updateTask,
  deleteTask,
  moveTask,
  addSubtask,
  updateSubtask,
  deleteSubtask,
} from "../shared/kanban.ts";

test("KanbanBoardSchema: parses empty object into default lanes and empty tasks", () => {
  const board = KanbanBoardSchema.parse({});
  assert.equal(board.lanes.length, 3);
  assert.deepEqual(
    board.lanes.map((l) => l.id),
    ["to-plan", "in-progress", "done"]
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
    /Duplicate lane ID/
  );

  assert.throws(
    () =>
      KanbanBoardSchema.parse({
        lanes: [{ id: "l1", title: "   " }],
        tasks: [],
      }),
    /Lane title cannot be empty/
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
    /Duplicate task ID/
  );

  assert.throws(
    () =>
      KanbanBoardSchema.parse({
        lanes: [{ id: "l1", title: "Lane 1" }],
        tasks: [{ id: "t1", title: "   ", laneId: "l1" }],
      }),
    /Task title cannot be empty/
  );

  assert.throws(
    () =>
      KanbanBoardSchema.parse({
        lanes: [{ id: "l1", title: "Lane 1" }],
        tasks: [{ id: "t1", title: "Task 1", laneId: "non-existent" }],
      }),
    /references non-existent lane/
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
    /Duplicate subtask ID/
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
    /because it contains tasks/
  );

  // Move task away, then delete succeeds
  const moved = moveTask(withTask, "task-1", "done");
  const deleted = deleteLane(moved, "testing");
  assert.equal(deleted.lanes.length, 3);
  assert.equal(deleted.lanes.some((l) => l.id === "testing"), false);

  // Protection 2: cannot delete the last remaining lane
  const singleLaneBoard = {
    lanes: [{ id: "only", title: "Only Lane" }],
    tasks: [],
  };
  assert.throws(
    () => deleteLane(singleLaneBoard, "only"),
    /Cannot delete the last remaining lane/
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
  const b3 = moveTask(b2, "task-a", "in-progress");
  assert.equal(b3.tasks[0].laneId, "in-progress");

  // Reject move to invalid lane
  assert.throws(
    () => moveTask(b3, "task-a", "ghost-lane"),
    /Target lane "ghost-lane" does not exist/
  );

  // Delete task
  const b4 = deleteTask(b3, "task-a");
  assert.equal(b4.tasks.length, 0);

  // Original board is immutable
  assert.equal(initial.tasks.length, 0);
});

test("Subtask operations: create, toggle completion, edit title, and delete", () => {
  const initial = KanbanBoardSchema.parse({});
  const withTask = addTask(initial, {
    id: "task-1",
    title: "Implement auth",
    laneId: "to-plan",
  });

  // Add subtask
  const s1 = addSubtask(withTask, "task-1", {
    id: "sub-1",
    title: "Design token format",
  });
  assert.equal(s1.tasks[0].subtasks.length, 1);
  assert.equal(s1.tasks[0].subtasks[0].completed, false);

  // Toggle completed
  const s2 = updateSubtask(s1, "task-1", "sub-1", { completed: true });
  assert.equal(s2.tasks[0].subtasks[0].completed, true);

  // Rename subtask
  const s3 = updateSubtask(s2, "task-1", "sub-1", { title: "Design JWT format" });
  assert.equal(s3.tasks[0].subtasks[0].title, "Design JWT format");

  // Reject duplicate subtask ID
  assert.throws(
    () => addSubtask(s3, "task-1", { id: "sub-1", title: "Duplicate" }),
    /already exists in task/
  );

  // Delete subtask
  const s4 = deleteSubtask(s3, "task-1", "sub-1");
  assert.equal(s4.tasks[0].subtasks.length, 0);
});
