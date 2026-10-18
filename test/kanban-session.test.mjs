import test from "node:test";
import assert from "node:assert/strict";
import { KanbanBoardSchema } from "../shared/kanban.ts";
import {
  openTaskSession,
  openLaneSession,
  executeTaskReorder,
} from "../client/kanban-session.ts";

// 模拟外部 CAS 存储；会话、草稿和看板转换保留真实实现。
function createMockStore(initialData = {}) {
  let board = KanbanBoardSchema.parse(initialData);
  let version = 1;
  let writes = 0;
  return {
    get values() {
      return board;
    },
    get writes() {
      return writes;
    },
    options() {
      return {
        baseBoard: board,
        baseRevision: `rev-${version}`,
        save: this.save,
      };
    },
    async save(next, revision) {
      writes++;
      if (revision !== `rev-${version}`) return false;
      board = KanbanBoardSchema.parse(next);
      version++;
      return true;
    },
  };
}

const task = { id: "t1", title: "原有任务", laneId: "to-plan" };

test("任务草稿从创建、编辑到删除，完整持久化内容与子步骤", async () => {
  const store = createMockStore();
  const draft = {
    id: "t1",
    title: "用户认证模块",
    description: "支持 OAuth 与密码登录",
    laneId: "to-plan",
    projectId: "proj-auth",
    subtasks: [
      { id: "sub-a", title: "设计数据表", completed: false },
      { id: "sub-b", title: "实现 JWT 签发", completed: true },
    ],
  };
  const create = openTaskSession({ ...store.options(), mode: "create" });
  assert.deepEqual(await create.saveDraft(draft), { success: true });
  assert.deepEqual(store.values.tasks, [
    {
      ...draft,
      completed: false,
      completedAt: null,
      source: "manual",
      issueNumber: null,
      externalUrl: null,
    },
  ]);

  const edit = openTaskSession({
    ...store.options(),
    mode: "edit",
    taskId: "t1",
    idGenerator: () => "sub-c",
  });
  edit.setTitle("更新后的任务");
  edit.setDescription("更新后的描述");
  edit.setLaneId("in-progress");
  edit.setProjectId("proj-1");
  edit.updateSubtask("sub-a", {
    title: "设计数据表（已通过）",
    completed: true,
  });
  edit.addSubtask("部署服务");
  assert.deepEqual(await edit.save(), { success: true });
  assert.deepEqual(store.values.tasks, [
    {
      id: "t1",
      title: "更新后的任务",
      description: "更新后的描述",
      laneId: "in-progress",
      projectId: "proj-1",
      subtasks: [
        { id: "sub-a", title: "设计数据表（已通过）", completed: true },
        { id: "sub-b", title: "实现 JWT 签发", completed: true },
        { id: "sub-c", title: "部署服务", completed: false },
      ],
      completed: false,
      completedAt: null,
      source: "manual",
      issueNumber: null,
      externalUrl: null,
    },
  ]);
  const remove = openTaskSession({
    ...store.options(),
    mode: "edit",
    taskId: "t1",
  });
  assert.deepEqual(await remove.deleteTask(), { success: true });
  assert.deepEqual(store.values.tasks, []);
});

test("泳道草稿创建、重命名与删除保留其他泳道", async () => {
  const store = createMockStore();
  const initial = store.values.lanes;
  const create = openLaneSession({ ...store.options(), mode: "create" });
  assert.deepEqual(await create.saveDraft({ id: "qa", title: "测试验证" }), {
    success: true,
  });
  assert.deepEqual(store.values.lanes, [
    ...initial.slice(0, -1),
    { id: "qa", title: "测试验证", isCompletionLane: false },
    initial.at(-1),
  ]);
  const edit = openLaneSession({
    ...store.options(),
    mode: "edit",
    laneId: "qa",
  });
  assert.equal(edit.getSnapshot().title, "测试验证");
  edit.setTitle("QA 验收");
  assert.deepEqual(await edit.save(), { success: true });
  assert.equal(
    store.values.lanes.find((lane) => lane.id === "qa").title,
    "QA 验收",
  );
  const remove = openLaneSession({
    ...store.options(),
    mode: "edit",
    laneId: "qa",
  });
  assert.equal(remove.getSnapshot().canDelete, true);
  assert.deepEqual(await remove.deleteLane(), { success: true });
  assert.deepEqual(store.values.lanes, initial);
});

test("打开时锁定的版本过期后拒绝任务/泳道草稿，不覆盖外部修改或删除", async () => {
  for (const [name, open, update] of [
    [
      "任务修改",
      openTaskSession,
      (board) => ({ ...board, tasks: [{ ...task, title: "外部标题" }] }),
    ],
    ["任务删除", openTaskSession, (board) => ({ ...board, tasks: [] })],
    [
      "泳道修改",
      openLaneSession,
      (board) => ({
        ...board,
        lanes: board.lanes.map((lane) =>
          lane.id === "to-plan" ? { ...lane, title: "外部泳道" } : lane,
        ),
      }),
    ],
    ["任务创建", openTaskSession, (board) => board],
  ]) {
    const store = createMockStore({ tasks: [task] });
    const session = open({
      ...store.options(),
      mode: name === "任务创建" ? "create" : "edit",
      taskId: "t1",
      laneId: "to-plan",
    });
    await store.save(update(store.values), store.options().baseRevision);
    await store.save(store.values, store.options().baseRevision);
    const external = structuredClone(store.values);
    session.setTitle("未同步的草稿");
    const result = await session.save();
    assert.equal(result.success, false, name);
    assert.match(result.error, /保存失败/, name);
    assert.deepEqual(store.values, external, name);
    assert.equal(session.getSnapshot().title, "未同步的草稿", name);
    assert.equal(session.getSnapshot().isSaving, false, name);
  }
});

test("缺失的任务/泳道不能编辑或删除，也不能误创建", async () => {
  for (const [open, options, deleteAction] of [
    [openTaskSession, { taskId: "ghost" }, "deleteTask"],
    [openLaneSession, { laneId: "ghost" }, "deleteLane"],
  ]) {
    const store = createMockStore();
    const initial = structuredClone(store.values);
    const session = open({ ...store.options(), ...options, mode: "edit" });
    session.setTitle("幽灵记录");
    for (const result of [
      await session.save(),
      await session[deleteAction](),
    ]) {
      assert.equal(result.success, false);
      assert.match(result.error, /不存在或已被删除/);
    }
    assert.equal(store.writes, 0);
    assert.deepEqual(store.values, initial);
  }
});

test("非法任务草稿显示错误并保留输入，不产生存储写入", async () => {
  for (const [draft, error] of [
    [{ title: "   ", laneId: "to-plan" }, /标题不能为空/],
    [
      {
        title: "任务",
        laneId: "to-plan",
        subtasks: [{ id: "s1", title: "  ", completed: false }],
      },
      /第 1 个子步骤标题不能为空/,
    ],
    [{ title: "任务", laneId: "ghost" }, /does not exist/],
  ]) {
    const store = createMockStore();
    const session = openTaskSession({ ...store.options(), mode: "create" });
    const result = await session.saveDraft(draft);
    assert.equal(result.success, false);
    assert.match(session.getSnapshot().error, error);
    assert.equal(session.getSnapshot().title, draft.title);
    assert.equal(store.writes, 0);
    assert.deepEqual(store.values.tasks, []);
  }
});

test("空白名称保存失败保留草稿，有任务的泳道可连同未完成任务删除", async () => {
  const store = createMockStore({ tasks: [task] });
  const initial = structuredClone(store.values);
  const session = openLaneSession({
    ...store.options(),
    mode: "edit",
    laneId: "to-plan",
  });
  const snapshot = session.getSnapshot();
  assert.equal(snapshot.canDelete, true);
  assert.equal(snapshot.tasksInLaneCount, 1);
  session.setTitle("   ");
  assert.equal((await session.save()).success, false);
  assert.match(session.getSnapshot().error, /泳道名称不能为空/);
  assert.equal(store.writes, 0);
  assert.deepEqual(store.values, initial);
  assert.equal((await session.deleteLane()).success, true);
  assert.deepEqual(store.values.tasks, []);
  assert.equal(
    store.values.lanes.some((lane) => lane.id === "to-plan"),
    false,
  );
});

test("排序提交持久化新次序；筛选下原位排序不写入", async () => {
  for (const [name, targetIndex, filter, ids, writes] of [
    ["移动", 1, undefined, ["t2", "t1"], 1],
    ["筛选原位", 0, "proj-a", ["t1", "t2"], 0],
  ]) {
    const store = createMockStore({
      tasks: [
        { ...task, projectId: "proj-a" },
        {
          id: "t2",
          title: "其他项目任务",
          laneId: "to-plan",
          projectId: "proj-b",
        },
      ],
    });
    const result = await executeTaskReorder({
      ...store.options(),
      taskId: "t1",
      targetLaneId: "to-plan",
      targetIndex,
      filter,
    });
    assert.deepEqual(
      result,
      writes ? { success: true } : { success: true, unchanged: true },
      name,
    );
    assert.deepEqual(
      store.values.tasks.map((item) => item.id),
      ids,
      name,
    );
    assert.equal(store.writes, writes, name);
  }
});

test("排序遇到版本冲突或存储异常返回失败并保留当前看板", async () => {
  for (const failure of ["conflict", "exception"]) {
    const store = createMockStore({ tasks: [task] });
    const options = store.options();
    await store.save(
      { ...store.values, tasks: [{ ...task, title: "外部标题" }] },
      options.baseRevision,
    );
    const external = structuredClone(store.values);
    const result = await executeTaskReorder({
      ...options,
      taskId: "t1",
      targetLaneId: "in-progress",
      targetIndex: 0,
      ...(failure === "exception"
        ? {
            save: async () => {
              throw new Error("Disk full");
            },
          }
        : {}),
    });
    assert.equal(result.success, false, failure);
    assert.match(
      result.error,
      failure === "exception" ? /Disk full/ : /保存失败|冲突/,
      failure,
    );
    assert.deepEqual(store.values, external, failure);
  }
});

// 快照引用和通知是 useSyncExternalStore 消费者的独立 API 承诺。
test("草稿修改通知订阅者；无变化时快照引用稳定且不重复通知", () => {
  const store = createMockStore();
  const session = openTaskSession({
    ...store.options(),
    mode: "create",
    defaultLaneId: "to-plan",
  });
  let notifications = 0;
  session.subscribe(() => notifications++);
  const initial = session.getSnapshot();
  assert.equal(initial.laneId, "to-plan");
  session.setTitle("新功能设计");
  const changed = session.getSnapshot();
  assert.equal(changed.title, "新功能设计");
  assert.notEqual(changed, initial);
  assert.equal(initial.title, "");
  session.setTitle("新功能设计");
  assert.equal(notifications, 1);
  assert.equal(session.getSnapshot(), changed);
});

test("子步骤拒绝空白输入，修改和删除保留身份，生成碰撞后仍可保存", async () => {
  const store = createMockStore();
  const session = openTaskSession({
    ...store.options(),
    mode: "create",
    idGenerator: () => "sub-1",
  });
  session.setTitle("配置网络");
  session.addSubtask("检查网络");
  assert.equal(session.addSubtask("   "), false);
  assert.match(session.getSnapshot().error, /子步骤内容不能为空/);
  session.updateSubtask("sub-1", { title: "检查通过", completed: true });
  assert.deepEqual(session.getSnapshot().subtasks, [
    { id: "sub-1", title: "检查通过", completed: true },
  ]);
  session.addSubtask("验证证书");
  const second = session.getSnapshot().subtasks[1];
  assert.notEqual(second.id, "sub-1");
  session.removeSubtask("sub-1");
  assert.deepEqual(await session.save(), { success: true });
  assert.deepEqual(store.values.tasks[0].subtasks, [
    { id: second.id, title: "验证证书", completed: false },
  ]);
});

test("保存期间保护草稿并拒绝重复提交，失败后恢复操作且保留完整草稿", async () => {
  const store = createMockStore();
  let finishSave;
  const session = openTaskSession({
    ...store.options(),
    mode: "create",
    idGenerator: () => "s1",
    save: (board, revision) =>
      new Promise((resolve) => {
        finishSave = () => resolve(store.save(board, revision));
      }),
  });
  session.setTitle("初始草稿");
  session.addSubtask("步骤1");
  const pending = session.save();
  assert.equal(session.getSnapshot().isSaving, true);
  session.setTitle("保存中修改");
  const duplicate = await session.save();
  assert.equal(duplicate.success, false);
  assert.match(duplicate.error, /正在保存中/);
  finishSave();
  assert.deepEqual(await pending, { success: true });
  assert.equal(store.values.tasks[0].title, "初始草稿");
  assert.equal(session.getSnapshot().isSaving, false);

  session.setTitle("未同步的内容");
  const saved = structuredClone(store.values);
  const retry = session.save();
  finishSave();
  assert.equal((await retry).success, false);
  const snapshot = session.getSnapshot();
  assert.equal(snapshot.isSaving, false);
  assert.equal(snapshot.title, "未同步的内容");
  assert.deepEqual(snapshot.subtasks, [
    { id: "s1", title: "步骤1", completed: false },
  ]);
  assert.deepEqual(store.values, saved);
  session.setTitle("核对后的内容");
  assert.equal(session.getSnapshot().title, "核对后的内容");
});
