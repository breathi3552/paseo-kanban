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

test("编辑命令返回新看板，删除泳道同时删除其未完成任务", () => {
  const initial = KanbanBoardSchema.parse({});
  const withLane = updateLane(
    addLane(initial, { id: "testing", title: "测试中" }),
    "testing",
    { title: "QA验证" },
  );
  assert.deepEqual(
    withLane.lanes.map(({ id, title }) => [id, title]),
    [
      ["to-plan", "待规划"],
      ["in-progress", "执行中"],
      ["testing", "QA验证"],
      ["done", "已完成"],
    ],
  );
  const created = addTask(withLane, {
    id: "task-a",
    title: "Setup DB",
    laneId: "testing",
  });
  assert.deepEqual(created.tasks, [
    {
      id: "task-a",
      title: "Setup DB",
      source: "manual",
      issueNumber: null,
      externalUrl: null,
      description: "",
      laneId: "testing",
      projectId: null,
      subtasks: [],
      completed: false,
      completedAt: null,
    },
  ]);
  const original = structuredClone(created);
  const deleted = deleteLane(created, "testing");
  assert.deepEqual(deleted.tasks, []);
  assert.deepEqual(
    deleted.lanes.map((lane) => lane.id),
    ["to-plan", "in-progress", "done"],
  );
  const edited = updateTask(created, "task-a", {
    description: "SQLite setup",
    projectId: "proj_real_456",
    laneId: "in-progress",
  });
  assert.deepEqual(edited.tasks, [
    {
      ...created.tasks[0],
      description: "SQLite setup",
      projectId: "proj_real_456",
      laneId: "in-progress",
    },
  ]);
  assert.throws(
    () => updateTask(edited, "task-a", { laneId: "ghost-lane" }),
    /Target lane "ghost-lane" does not exist/,
  );
  const withoutLane = deleteLane(edited, "testing");
  assert.deepEqual(withoutLane.lanes, initial.lanes);
  assert.deepEqual(withoutLane.tasks, edited.tasks);
  assert.deepEqual(deleteTask(withoutLane, "task-a"), initial);
  assert.deepEqual(created, original, "后续编辑不改变已有看板");
  assert.deepEqual(initial.tasks, []);
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
  for (const [filter, expected] of [
    ["projA", ["t1", "t3"]],
    ["unassigned", ["t4"]],
  ]) {
    assert.deepEqual(
      filterTasksByProject(board.tasks, filter).map(({ id }) => id),
      expected,
    );
  }
  for (const [name, id, laneId, index, filter, expected] of [
    ["同泳道下移", "t1", "to-plan", 2, undefined, ["t2", "t3", "t1", "t4"]],
    ["同泳道上移", "t3", "to-plan", 0, undefined, ["t3", "t1", "t2", "t4"]],
    ["跨泳道", "t1", "in-progress", 0, undefined, ["t2", "t3", "t1", "t4"]],
    [
      "负索引限制为首位",
      "t3",
      "to-plan",
      -10,
      undefined,
      ["t3", "t1", "t2", "t4"],
    ],
    [
      "超大索引限制为末尾",
      "t1",
      "to-plan",
      9999,
      undefined,
      ["t2", "t3", "t1", "t4"],
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

test("筛选下无可见锚点时跨泳道追加，同泳道仅自身可见时保持原位", () => {
  const board = KanbanBoardSchema.parse({
    tasks: [
      task("t1", "to-plan", "projA"),
      task("t2", "to-plan", "projB"),
      task("t3", "in-progress", "projB"),
      task("t4", "in-progress", "projB"),
    ],
  });
  const moved = reorderTask(board, "t1", "in-progress", 0, {
    type: "project",
    projectId: "projA",
  });
  assert.deepEqual(
    moved.tasks,
    [...board.tasks.slice(1), { ...board.tasks[0], laneId: "in-progress" }],
    "追加到隐藏任务末尾，保留隐藏任务内容和顺序",
  );
  assert.strictEqual(
    reorderTask(board, "t1", "to-plan", 0, "projA"),
    board,
    "原位操作返回原看板，允许调用方跳过写入",
  );
});

test("排序拒绝不存在的任务/泳道及非有限整数槽位", () => {
  const board = KanbanBoardSchema.parse({ tasks: [task("t1")] });
  for (const [id, lane, index, error] of [
    ["missing", "to-plan", 0, /Task with ID "missing" not found/],
    ["t1", "ghost", 0, /Target lane "ghost" does not exist/],
    ...[NaN, Infinity, 1.5].map((index) => [
      "t1",
      "to-plan",
      index,
      /Target index must be a finite integer/,
    ]),
  ]) {
    assert.throws(
      () => reorderTask(board, id, lane, index),
      error,
      `${id}/${lane}/${index}`,
    );
  }
});
