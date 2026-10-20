import test from "node:test";
import assert from "node:assert/strict";
import { KanbanBoardSchema, addLane, reorderTask } from "../shared/kanban.ts";

const task = (id, laneId = "to-plan", projectId = null) => ({
  id,
  title: id,
  laneId,
  projectId,
});

// Persisted-board validation is a public contract, independent of editing commands.
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

test("普通泳道排序按目标槽位插入，项目筛选保留隐藏任务", () => {
  const board = KanbanBoardSchema.parse({
    tasks: [
      task("t1", "to-plan", "projA"),
      task("t2", "to-plan", "projB"),
      task("t3", "to-plan", "projA"),
      task("t4", "in-progress"),
    ],
  });
  for (const [name, id, laneId, index, filter, expected] of [
    ["同泳道下移", "t1", "to-plan", 2, undefined, ["t2", "t3", "t1", "t4"]],
    ["同泳道上移", "t3", "to-plan", 0, undefined, ["t3", "t1", "t2", "t4"]],
    ["跨泳道", "t1", "in-progress", 0, undefined, ["t2", "t3", "t1", "t4"]],
    [
      "目标无可见锚点",
      "t1",
      "in-progress",
      0,
      "projA",
      ["t2", "t3", "t4", "t1"],
    ],
    ["筛选后的可见槽位", "t3", "to-plan", 0, "projA", ["t3", "t1", "t2", "t4"]],
  ]) {
    const reordered = reorderTask(board, id, laneId, index, filter);
    // Compare full task data as well as global order; hidden tasks survive unchanged.
    assert.deepEqual(
      reordered.tasks,
      expected.map((taskId) => ({
        ...board.tasks.find((entry) => entry.id === taskId),
        ...(taskId === id ? { laneId } : {}),
      })),
      name,
    );
  }
  const emptyLane = addLane(board, { id: "empty", title: "Empty" });
  assert.deepEqual(
    reorderTask(emptyLane, "t1", "empty", 0).tasks.map(
      ({ id, laneId }) => `${id}:${laneId}`,
    ),
    ["t2:to-plan", "t3:to-plan", "t4:in-progress", "t1:empty"],
    "空目标泳道按泳道次序插入全量数组",
  );
});
