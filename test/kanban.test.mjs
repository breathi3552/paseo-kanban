import test from "node:test";
import assert from "node:assert/strict";
import {
  KanbanBoardSchema,
  kanbanSettings,
  getLaneTasks,
} from "../shared/kanban.ts";

const task = (id, laneId = "to-plan", projectId = null) => ({
  id,
  title: id,
  laneId,
  projectId,
});

test("空数据初始化为默认泳道与空任务", () => {
  assert.deepEqual(KanbanBoardSchema.parse({}), {
    lanes: [
      { id: "to-plan", title: "待规划", isCompletionLane: false },
      { id: "in-progress", title: "执行中", isCompletionLane: false },
      { id: "done", title: "已完成", isCompletionLane: true },
    ],
    tasks: [],
  });
});

test("持久化数据拒绝重复标识、空标题和未完成任务的失效泳道引用", () => {
  const completionLane = { id: "done", title: "完成", isCompletionLane: true };
  const lane = { id: "l1", title: "Lane 1" };
  for (const [name, data, error] of [
    ["重复泳道", { lanes: [lane, lane, completionLane] }, /Duplicate lane ID/],
    [
      "空泳道标题",
      { lanes: [{ ...lane, title: "   " }, completionLane] },
      /Lane title cannot be empty/,
    ],
    ["重复任务", { tasks: [task("t1"), task("t1")] }, /Duplicate task ID/],
    [
      "空任务标题",
      { tasks: [{ ...task("t1"), title: "   " }] },
      /Task title cannot be empty/,
    ],
    [
      "失效泳道",
      { tasks: [task("t1", "ghost")] },
      /references non-existent lane/,
    ],
    [
      "同任务重复子步骤",
      {
        tasks: [
          {
            ...task("t1"),
            subtasks: [
              { id: "s1", title: "Sub 1", completed: false },
              { id: "s1", title: "Sub 2", completed: true },
            ],
          },
        ],
      },
      /Duplicate subtask ID/,
    ],
  ]) {
    assert.throws(() => KanbanBoardSchema.parse(data), error, name);
  }
});

test("设置版本升级平滑迁移：v1/v2 升级至最新结构，转换旧完成泳道并补齐任务默认属性", () => {
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

  const migratedV1 = kanbanSettings.migrate(legacyV1, 1);
  assert.deepEqual(migratedV1.lanes.at(-1), {
    id: "done",
    title: "已完成历史",
    isCompletionLane: true,
  });
  assert.deepEqual(
    getLaneTasks(migratedV1, "done").map(
      ({ id, laneId, completed, completedAt, source }) => ({
        id,
        laneId,
        completed,
        completedAt,
        source,
      }),
    ),
    [
      {
        id: "old1",
        laneId: "review",
        completed: true,
        completedAt: null,
        source: "manual",
      },
      {
        id: "old2",
        laneId: "review",
        completed: true,
        completedAt: null,
        source: "manual",
      },
    ],
  );

  const legacyV2 = {
    lanes: [
      { id: "todo", title: "Todo", isCompletionLane: false },
      { id: "done", title: "Done", isCompletionLane: true },
    ],
    tasks: [
      {
        id: "old",
        title: "Old",
        description: "https://github.com/example/repo/issues/1",
        laneId: "todo",
        projectId: null,
        subtasks: [],
        completed: true,
        completedAt: 123,
      },
    ],
  };
  const migratedV2 = kanbanSettings.migrate(legacyV2, 2);
  assert.deepEqual(migratedV2.tasks[0], {
    ...legacyV2.tasks[0],
    source: "manual",
    issueNumber: null,
    externalUrl: null,
  });
});
