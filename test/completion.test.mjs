import test from "node:test";
import assert from "node:assert/strict";
import * as kanban from "../shared/kanban.ts";

function createBoard(tasks = [], lanes = null) {
  return {
    lanes: lanes ?? [
      { id: "todo", title: "To Do", isCompletionLane: false },
      { id: "review", title: "Review", isCompletionLane: false },
      { id: "done", title: "Done", isCompletionLane: true },
    ],
    tasks: tasks.map((t) => ({
      description: "",
      projectId: null,
      subtasks: [],
      completed: false,
      completedAt: null,
      ...t,
    })),
  };
}

// 1. 任务完成与可逆恢复
test("任务完成与可逆恢复: 保留普通归属、派生完成排序、取消恢复末尾、失效归属安全回退", () => {
  const initial = createBoard([
    { id: "t1", title: "Task 1", laneId: "todo" },
    { id: "t2", title: "Task 2", laneId: "todo" },
  ]);

  // 完成任务：记录完成时间，保留原普通泳道归属
  const completed1 = kanban.setTaskCompleted(initial, "t1", true, 1000);
  assert.equal(completed1.tasks.find((t) => t.id === "t1").completed, true);
  assert.equal(completed1.tasks.find((t) => t.id === "t1").completedAt, 1000);
  assert.equal(completed1.tasks.find((t) => t.id === "t1").laneId, "todo");

  // 派生显示：未完成留在 todo，完成显示在 done
  assert.deepEqual(
    kanban.getLaneTasks(completed1, "todo").map((t) => t.id),
    ["t2"],
  );
  assert.deepEqual(
    kanban.getLaneTasks(completed1, "done").map((t) => t.id),
    ["t1"],
  );

  // 完成第二个任务：完成泳道按完成时间倒序显示
  const completed2 = kanban.setTaskCompleted(completed1, "t2", true, 2000);
  assert.deepEqual(
    kanban.getLaneTasks(completed2, "done").map((t) => t.id),
    ["t2", "t1"],
  );

  // 取消完成：恢复未完成状态并追加到原普通泳道末尾
  const restored = kanban.setTaskCompleted(completed2, "t1", false);
  assert.equal(restored.tasks.find((t) => t.id === "t1").completed, false);
  assert.equal(restored.tasks.find((t) => t.id === "t1").completedAt, null);
  assert.deepEqual(
    kanban.getLaneTasks(restored, "todo").map((t) => t.id),
    ["t1"],
  );

  // 失效归属回退：原普通泳道被删除后，取消完成安全回退到当前最右侧普通泳道末尾
  const deletedLaneBoard = kanban.deleteLane(
    createBoard([
      {
        id: "orphan",
        title: "Orphan",
        laneId: "review",
        completed: true,
        completedAt: 1000,
      },
      { id: "active", title: "Active", laneId: "todo" },
    ]),
    "review",
  );
  const fallbackRestored = kanban.setTaskCompleted(
    deletedLaneBoard,
    "orphan",
    false,
  );
  assert.equal(
    fallbackRestored.tasks.find((t) => t.id === "orphan").laneId,
    "todo",
  );
  assert.deepEqual(
    kanban.getLaneTasks(fallbackRestored, "todo").map((t) => t.id),
    ["active", "orphan"],
  );
});

// 2. 完成泳道拖拽与排序规则
test("完成泳道拖拽与排序规则: 拖入自动完成、拖出恢复未完成并指定槽位、内部禁止手动排序", () => {
  const initial = createBoard([
    { id: "t1", title: "Task 1", laneId: "todo" },
    { id: "t2", title: "Task 2", laneId: "review" },
    { id: "t3", title: "Task 3", laneId: "review" },
  ]);

  // 拖入完成泳道：自动转换为完成状态并保留原普通归属
  const draggedIn = kanban.reorderTask(initial, "t1", "done", 0);
  const t1Done = draggedIn.tasks.find((t) => t.id === "t1");
  assert.equal(t1Done.completed, true);
  assert.equal(t1Done.laneId, "todo");
  assert.deepEqual(
    kanban.getLaneTasks(draggedIn, "done").map((t) => t.id),
    ["t1"],
  );

  // 完成泳道内部拖动：不可手动调整次序，返回原对象不产生变更
  const internalReorder = kanban.reorderTask(draggedIn, "t1", "done", 1);
  assert.equal(internalReorder, draggedIn);

  // 从完成泳道拖出到普通泳道：取消完成，更新 laneId，按指定槽位插入
  const draggedOut = kanban.reorderTask(draggedIn, "t1", "review", 1);
  const t1Reopened = draggedOut.tasks.find((t) => t.id === "t1");
  assert.equal(t1Reopened.completed, false);
  assert.equal(t1Reopened.laneId, "review");
  assert.deepEqual(
    kanban.getLaneTasks(draggedOut, "review").map((t) => t.id),
    ["t2", "t1", "t3"],
  );
});

// 3. 完成泳道规则与受保护约束
test("完成泳道规则与受保护约束: 唯一最右完成泳道、不可删除、普通泳道保护与删除约束", () => {
  const board = kanban.KanbanBoardSchema.parse({});
  // 始终恰好一条最右侧完成泳道
  assert.equal(board.lanes.at(-1).isCompletionLane, true);
  assert.equal(board.lanes.filter((l) => l.isCompletionLane).length, 1);

  // 新增普通泳道始终插入到完成泳道左侧
  const added = kanban.addLane(board, { id: "testing", title: "Testing" });
  assert.equal(added.lanes.at(-1).isCompletionLane, true);
  assert.equal(added.lanes.at(-2).id, "testing");

  // 完成泳道不可删除，最后一条普通泳道不可删除
  assert.throws(() => kanban.deleteLane(board, "done"), /completion lane/i);

  // 包含未完成任务的普通泳道不可删除
  const withActive = kanban.addTask(added, {
    id: "a",
    title: "Active",
    laneId: "testing",
  });
  assert.throws(
    () => kanban.deleteLane(withActive, "testing"),
    /contains tasks/,
  );

  // 仅被已完成任务引用的普通泳道允许删除
  const withCompleted = kanban.setTaskCompleted(withActive, "a", true);
  const deleted = kanban.deleteLane(withCompleted, "testing");
  assert.equal(
    deleted.lanes.some((l) => l.id === "testing"),
    false,
  );
  assert.equal(deleted.tasks.find((t) => t.id === "a").laneId, "testing");
});

// 4. 设置版本升级平滑迁移
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
  // done 泳道成为最右侧完成泳道并保留名称
  assert.equal(migrated.lanes.at(-1).id, "done");
  assert.equal(migrated.lanes.at(-1).title, "已完成历史");
  assert.equal(migrated.lanes.at(-1).isCompletionLane, true);

  // 历史完成任务标记为 completed，普通归属回退到最右普通泳道，且保持相对次序
  const old1 = migrated.tasks.find((t) => t.id === "old1");
  const old2 = migrated.tasks.find((t) => t.id === "old2");
  assert.equal(old1.completed, true);
  assert.equal(old1.laneId, "review");
  assert.equal(old1.completedAt, null);
  assert.equal(old2.completed, true);
  assert.deepEqual(
    kanban.getLaneTasks(migrated, "done").map((t) => t.id),
    ["old1", "old2"],
  );

  // 未完成任务保持未完成状态
  assert.equal(migrated.tasks.find((t) => t.id === "active").completed, false);
});
