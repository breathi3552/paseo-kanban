import test from "node:test";
import assert from "node:assert/strict";
import * as kanban from "../shared/kanban.ts";

function createBoard(tasks) {
  return kanban.KanbanBoardSchema.parse({
    lanes: [
      { id: "todo", title: "To Do", isCompletionLane: false },
      { id: "review", title: "Review", isCompletionLane: false },
      { id: "done", title: "Done", isCompletionLane: true },
    ],
    tasks,
  });
}

test("完成任务保留归属并按完成时间排序，取消后恢复至原泳道末尾", () => {
  const initial = createBoard([
    { id: "t1", title: "Task 1", laneId: "todo" },
    { id: "t2", title: "Task 2", laneId: "todo" },
    { id: "active", title: "Active", laneId: "todo" },
  ]);

  const completed1 = kanban.setTaskCompleted(initial, "t1", true, 1000);
  const completed2 = kanban.setTaskCompleted(completed1, "t2", true, 2000);
  assert.deepEqual(
    kanban
      .getLaneTasks(completed2, "done")
      .map(({ id, laneId, completedAt }) => ({ id, laneId, completedAt })),
    [
      { id: "t2", laneId: "todo", completedAt: 2000 },
      { id: "t1", laneId: "todo", completedAt: 1000 },
    ],
  );
  assert.deepEqual(
    kanban.getLaneTasks(completed2, "todo").map((t) => t.id),
    ["active"],
  );
  const restored = kanban.setTaskCompleted(completed2, "t1", false);
  assert.equal(restored.tasks.find((t) => t.id === "t1").completedAt, null);
  assert.deepEqual(
    kanban.getLaneTasks(restored, "todo").map((t) => t.id),
    ["active", "t1"],
  );
});

test("拖入完成泳道后按时间排序且不能手动重排，拖出按落点恢复", (t) => {
  t.mock.method(Date, "now", () => 2000);
  const initial = createBoard([
    { id: "t1", title: "Task 1", laneId: "todo" },
    { id: "t2", title: "Task 2", laneId: "review" },
    { id: "t3", title: "Task 3", laneId: "review" },
    { id: "t4", title: "Task 4", laneId: "review" },
  ]);

  const completed = kanban.setTaskCompleted(initial, "t2", true, 1000);
  const draggedIn = kanban.reorderTask(completed, "t1", "done", 1);
  const t1Done = draggedIn.tasks.find((t) => t.id === "t1");
  assert.equal(t1Done.laneId, "todo");
  assert.deepEqual(
    kanban.getLaneTasks(draggedIn, "done").map((t) => t.id),
    ["t1", "t2"],
  );

  const internalReorder = kanban.reorderTask(draggedIn, "t1", "done", 1);
  assert.deepEqual(
    kanban.getLaneTasks(internalReorder, "done"),
    kanban.getLaneTasks(draggedIn, "done"),
    "完成泳道的手动重排不改变展示顺序或任务内容",
  );

  const draggedOut = kanban.reorderTask(internalReorder, "t1", "review", 1);
  assert.deepEqual(
    kanban.getLaneTasks(draggedOut, "review").map((t) => t.id),
    ["t3", "t1", "t4"],
  );
});

test("设置版本升级平滑迁移: v1到v2无损转换旧done泳道、标记历史任务完成并保留相对次序", () => {
  const legacyV1 = {
    lanes: [
      { id: "todo", title: "待办" },
      { id: "done", title: "已完成历史" },
      { id: "review", title: "评审" },
    ],
    tasks: [
      { id: "old1", title: "Old 1", laneId: "done" },
      { id: "active", title: "Active", laneId: "todo" },
      { id: "old2", title: "Old 2", laneId: "done" },
    ],
  };

  const migrated = kanban.kanbanSettings.migrate(legacyV1, 1);
  assert.deepEqual(migrated.lanes.at(-1), {
    id: "done",
    title: "已完成历史",
    isCompletionLane: true,
  });

  assert.deepEqual(
    kanban
      .getLaneTasks(migrated, "done")
      .map(({ id, laneId, completedAt }) => ({ id, laneId, completedAt })),
    [
      { id: "old1", laneId: "review", completedAt: null },
      { id: "old2", laneId: "review", completedAt: null },
    ],
  );

  assert.deepEqual(
    kanban.getLaneTasks(migrated, "todo").map((t) => t.id),
    ["active"],
  );
});
