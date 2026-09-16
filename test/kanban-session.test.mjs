import test from "node:test";
import assert from "node:assert/strict";
import { KanbanBoardSchema } from "../shared/kanban.ts";
import {
  openTaskSession,
  openLaneSession,
} from "../client/kanban-session.ts";

function createMockStore(initialData = {}) {
  let currentBoard = KanbanBoardSchema.parse(initialData);
  let currentRevision = "rev-1";
  const callHistory = [];

  return {
    get values() {
      return currentBoard;
    },
    get revision() {
      return currentRevision;
    },
    get history() {
      return callHistory;
    },
    async save(newBoard, expectedRevision) {
      callHistory.push({ board: newBoard, revision: expectedRevision });
      if (expectedRevision !== currentRevision) {
        return false;
      }
      currentBoard = KanbanBoardSchema.parse(newBoard);
      currentRevision = `rev-${callHistory.length + 1}`;
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// 1. 正常路径 (Happy path)
// ---------------------------------------------------------------------------

test("正常路径: 创建任务并完整保留标题、描述、泳道、项目与子步骤", async () => {
  const store = createMockStore({});
  const session = openTaskSession({
    mode: "create",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
    defaultLaneId: "to-plan",
  });

  assert.equal(session.mode, "create");
  assert.equal(session.task, null);
  assert.equal(session.initialValues.laneId, "to-plan");

  const result = await session.saveDraft({
    id: "task-new-1",
    title: "用户认证模块",
    description: "支持 OAuth 与密码登录",
    laneId: "to-plan",
    projectId: "proj-auth",
    subtasks: [
      { id: "sub-1", title: "设计数据表", completed: false },
      { id: "sub-2", title: "实现 JWT 签发", completed: true },
    ],
  });

  assert.equal(result.success, true);
  assert.equal(store.values.tasks.length, 1);
  const saved = store.values.tasks[0];
  assert.equal(saved.id, "task-new-1");
  assert.equal(saved.title, "用户认证模块");
  assert.equal(saved.description, "支持 OAuth 与密码登录");
  assert.equal(saved.laneId, "to-plan");
  assert.equal(saved.projectId, "proj-auth");
  assert.deepEqual(saved.subtasks, [
    { id: "sub-1", title: "设计数据表", completed: false },
    { id: "sub-2", title: "实现 JWT 签发", completed: true },
  ]);
});

test("正常路径: 编辑任务并更新属性，严格保留子步骤标识与完成状态", async () => {
  const store = createMockStore({
    tasks: [
      {
        id: "task-edit-1",
        title: "原有任务",
        description: "原有描述",
        laneId: "to-plan",
        projectId: null,
        subtasks: [
          { id: "sub-a", title: "步骤A", completed: false },
          { id: "sub-b", title: "步骤B", completed: true },
        ],
      },
    ],
  });

  const session = openTaskSession({
    mode: "edit",
    taskId: "task-edit-1",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
  });

  assert.equal(session.mode, "edit");
  assert.equal(session.initialValues.title, "原有任务");
  assert.equal(session.initialValues.subtasks.length, 2);

  const result = await session.saveDraft({
    title: "更新后的任务",
    description: "更新后的描述",
    laneId: "in-progress",
    projectId: "proj-1",
    subtasks: [
      { id: "sub-a", title: "步骤A 改名", completed: true },
      { id: "sub-b", title: "步骤B", completed: true },
      { id: "sub-c", title: "步骤C 新增", completed: false },
    ],
  });

  assert.equal(result.success, true);
  const updated = store.values.tasks.find((t) => t.id === "task-edit-1");
  assert.ok(updated);
  assert.equal(updated.title, "更新后的任务");
  assert.equal(updated.laneId, "in-progress");
  assert.equal(updated.projectId, "proj-1");
  assert.equal(updated.subtasks.length, 3);
  assert.deepEqual(updated.subtasks[0], { id: "sub-a", title: "步骤A 改名", completed: true });
  assert.deepEqual(updated.subtasks[1], { id: "sub-b", title: "步骤B", completed: true });
  assert.deepEqual(updated.subtasks[2], { id: "sub-c", title: "步骤C 新增", completed: false });
});

test("正常路径: 删除任务操作", async () => {
  const store = createMockStore({
    tasks: [{ id: "task-del", title: "待删任务", laneId: "to-plan" }],
  });

  const session = openTaskSession({
    mode: "edit",
    taskId: "task-del",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
  });

  const result = await session.deleteTask();
  assert.equal(result.success, true);
  assert.equal(store.values.tasks.length, 0);
});

test("正常路径: 泳道创建、重命名与删除", async () => {
  const store = createMockStore({});

  // 1. 创建泳道
  const createSession = openLaneSession({
    mode: "create",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
  });
  const createResult = await createSession.saveDraft({
    id: "lane-qa",
    title: "测试验证",
  });
  assert.equal(createResult.success, true);
  assert.equal(store.values.lanes.length, 4);
  assert.equal(store.values.lanes[3].id, "lane-qa");

  // 2. 编辑重命名泳道
  const editSession = openLaneSession({
    mode: "edit",
    laneId: "lane-qa",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
  });
  assert.equal(editSession.initialValues.title, "测试验证");
  const editResult = await editSession.saveDraft({ title: "QA验收" });
  assert.equal(editResult.success, true);
  assert.equal(store.values.lanes.find((l) => l.id === "lane-qa")?.title, "QA验收");

  // 3. 删除空泳道
  const delSession = openLaneSession({
    mode: "edit",
    laneId: "lane-qa",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
  });
  assert.equal(delSession.canDelete, true);
  const delResult = await delSession.deleteLane();
  assert.equal(delResult.success, true);
  assert.equal(store.values.lanes.length, 3);
  assert.equal(store.values.lanes.some((l) => l.id === "lane-qa"), false);
});

// ---------------------------------------------------------------------------
// 2. 并发路径 (Concurrency / Stale Baseline)
// ---------------------------------------------------------------------------

test("并发路径: 打开会话后外部发生修改，原会话保存被拒绝，外部内容不被覆盖", async () => {
  const store = createMockStore({
    tasks: [{ id: "t1", title: "初始标题", laneId: "to-plan" }],
  });

  // 会话A在 rev-1 打开
  const sessionA = openTaskSession({
    mode: "edit",
    taskId: "t1",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
  });

  // 外部会话B成功写入并将 revision 更新到 rev-2
  await store.save(
    {
      ...store.values,
      tasks: [{ id: "t1", title: "会话B修改的标题", laneId: "in-progress", projectId: null, subtasks: [] }],
    },
    store.revision
  );
  assert.equal(store.revision, "rev-2");

  // 会话A尝试保存草稿
  const result = await sessionA.saveDraft({
    title: "会话A试图覆盖的标题",
    laneId: "to-plan",
  });

  // 必须被拒绝
  assert.equal(result.success, false);
  assert.match(result.error, /保存失败/);

  // 存储中的数据保持会话B的成果，未被篡改覆盖
  assert.equal(store.values.tasks[0].title, "会话B修改的标题");
  assert.equal(store.values.tasks[0].laneId, "in-progress");
});

test("并发路径: 目标被外部删除后，原会话保存被拒绝，已删除目标不复活", async () => {
  const store = createMockStore({
    tasks: [{ id: "t1", title: "即将被外部删除的任务", laneId: "to-plan" }],
  });

  // 会话A在 rev-1 打开
  const sessionA = openTaskSession({
    mode: "edit",
    taskId: "t1",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
  });

  // 外部将 t1 删除并提交，revision 推进
  await store.save(
    {
      ...store.values,
      tasks: [],
    },
    store.revision
  );
  assert.equal(store.values.tasks.length, 0);

  // 会话A尝试保存修改
  const result = await sessionA.saveDraft({
    title: "复活尝试",
    laneId: "to-plan",
  });

  assert.equal(result.success, false);
  // 目标不被意外复活
  assert.equal(store.values.tasks.length, 0);
});

test("并发路径: 泳道编辑在外部修改后保存被拒绝", async () => {
  const store = createMockStore({});

  const session = openLaneSession({
    mode: "edit",
    laneId: "to-plan",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
  });

  // 外部修改看板，revision 递增
  await store.save(store.values, store.revision);

  const result = await session.saveDraft({ title: "尝试更新已过期的泳道" });
  assert.equal(result.success, false);
  assert.match(result.error, /保存失败/);
  assert.equal(store.values.lanes[0].title, "待规划");
});

// ---------------------------------------------------------------------------
// 3. 基准锁定校验 (Strict Baseline Locking check)
// ---------------------------------------------------------------------------

test("基准路径: 外部更新后原会话仍提交与打开时相配的基准版本号，不改用最新版本号", async () => {
  const store = createMockStore({});
  const initialRevision = store.revision; // rev-1

  const session = openTaskSession({
    mode: "create",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
    defaultLaneId: "to-plan",
  });

  // 外部多次写入推进版本号到 rev-3
  await store.save(store.values, store.revision);
  await store.save(store.values, store.revision);
  assert.equal(store.revision, "rev-3");

  // 原会话发起保存
  await session.saveDraft({
    id: "late-task",
    title: "迟到的任务",
    laneId: "to-plan",
  });

  // 检查会话提交给 save 的实参
  const lastCall = store.history[store.history.length - 1];
  assert.equal(
    lastCall.revision,
    initialRevision,
    "提交的版本号必须严格是会话打开时的 baseRevision (rev-1)，绝不能改用最新版本号 (rev-3)"
  );
});

// ---------------------------------------------------------------------------
// 4. 无效操作路径 (Invalid operations & constraints)
// ---------------------------------------------------------------------------

test("无效操作: 编辑或删除不存在的任务直接失败，不产生存储写入，不执行创建", async () => {
  const store = createMockStore({});
  const session = openTaskSession({
    mode: "edit",
    taskId: "ghost-task",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
  });

  // 1. 保存不存在的任务 -> 失败，且不写入
  const saveResult = await session.saveDraft({
    title: "幽灵任务",
    laneId: "to-plan",
  });
  assert.equal(saveResult.success, false);
  assert.match(saveResult.error, /不存在或已被删除/);
  assert.equal(store.history.length, 0, "不得调用 save 进行写入");
  assert.equal(store.values.tasks.length, 0);

  // 2. 删除不存在的任务 -> 失败，且不写入
  const delResult = await session.deleteTask();
  assert.equal(delResult.success, false);
  assert.match(delResult.error, /不存在或已被删除/);
  assert.equal(store.history.length, 0);
});

test("无效操作: 编辑或删除不存在的泳道直接失败，不产生存储写入", async () => {
  const store = createMockStore({});
  const session = openLaneSession({
    mode: "edit",
    laneId: "ghost-lane",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
  });

  const saveResult = await session.saveDraft({ title: "幽灵泳道" });
  assert.equal(saveResult.success, false);
  assert.match(saveResult.error, /不存在或已被删除/);
  assert.equal(store.history.length, 0);

  const delResult = await session.deleteLane();
  assert.equal(delResult.success, false);
  assert.match(delResult.error, /不存在或已被删除/);
  assert.equal(store.history.length, 0);
});

test("无效操作: 空白任务标题或空白子步骤标题拦截，不产生存储写入", async () => {
  const store = createMockStore({});
  const session = openTaskSession({
    mode: "create",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
  });

  // 空白标题
  const res1 = await session.saveDraft({ title: "   ", laneId: "to-plan" });
  assert.equal(res1.success, false);
  assert.match(res1.error, /标题不能为空/);
  assert.equal(store.history.length, 0);

  // 空白子步骤标题
  const res2 = await session.saveDraft({
    title: "正常标题",
    laneId: "to-plan",
    subtasks: [{ id: "s1", title: "  ", completed: false }],
  });
  assert.equal(res2.success, false);
  assert.match(res2.error, /第 1 个子步骤标题不能为空/);
  assert.equal(store.history.length, 0);
});

test("无效操作: 引用不存在的泳道拦截，不产生存储写入", async () => {
  const store = createMockStore({});
  const session = openTaskSession({
    mode: "create",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
  });

  const res = await session.saveDraft({
    title: "任务",
    laneId: "non-existent-lane",
  });
  assert.equal(res.success, false);
  assert.match(res.error, /does not exist/);
  assert.equal(store.history.length, 0);
});

test("无效操作: 受保护泳道拦截删除（含任务或最后一条泳道），不产生存储写入", async () => {
  // 1. 泳道内有任务
  const storeWithTask = createMockStore({
    tasks: [{ id: "t1", title: "任务", laneId: "to-plan" }],
  });
  const session1 = openLaneSession({
    mode: "edit",
    laneId: "to-plan",
    baseBoard: storeWithTask.values,
    baseRevision: storeWithTask.revision,
    save: (b, r) => storeWithTask.save(b, r),
  });
  assert.equal(session1.canDelete, false);
  assert.equal(session1.tasksInLaneCount, 1);
  const res1 = await session1.deleteLane();
  assert.equal(res1.success, false);
  assert.match(res1.error, /because it contains tasks/);
  assert.equal(storeWithTask.history.length, 0);

  // 2. 只有最后一条泳道
  const storeSingleLane = createMockStore({
    lanes: [{ id: "only", title: "独苗泳道" }],
    tasks: [],
  });
  const session2 = openLaneSession({
    mode: "edit",
    laneId: "only",
    baseBoard: storeSingleLane.values,
    baseRevision: storeSingleLane.revision,
    save: (b, r) => storeSingleLane.save(b, r),
  });
  assert.equal(session2.canDelete, false);
  assert.equal(session2.lanesCount, 1);
  const res2 = await session2.deleteLane();
  assert.equal(res2.success, false);
  assert.match(res2.error, /Cannot delete the last remaining lane/);
  assert.equal(storeSingleLane.history.length, 0);
});

// ---------------------------------------------------------------------------
// 5. 取消、重新打开与草稿隔离
// ---------------------------------------------------------------------------

test("取消与无副作用: 会话打开后取消不调用 save，无写入副作用", async () => {
  const store = createMockStore({});
  openTaskSession({
    mode: "create",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
  });
  openLaneSession({
    mode: "create",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
  });

  // 未调用 saveDraft/deleteTask -> 0 次保存
  assert.equal(store.history.length, 0);
});

test("会话重新打开: 保存成功后重新打开会话准确展示最新持久化内容", async () => {
  const store = createMockStore({});

  // 1. 创建任务带有子步骤
  const s1 = openTaskSession({
    mode: "create",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
  });
  await s1.saveDraft({
    id: "task-cycle",
    title: "初始标题",
    laneId: "to-plan",
    subtasks: [{ id: "sub-1", title: "步骤1", completed: false }],
  });

  // 2. 重新打开编辑会话
  const s2 = openTaskSession({
    mode: "edit",
    taskId: "task-cycle",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
  });
  assert.equal(s2.initialValues.title, "初始标题");
  assert.equal(s2.initialValues.subtasks[0].title, "步骤1");
  assert.equal(s2.initialValues.subtasks[0].completed, false);

  // 3. 修改子步骤并保存
  await s2.saveDraft({
    title: "新标题",
    laneId: "to-plan",
    subtasks: [
      { id: "sub-1", title: "步骤1已完成", completed: true },
      { id: "sub-2", title: "新步骤2", completed: false },
    ],
  });

  // 4. 再次重新打开
  const s3 = openTaskSession({
    mode: "edit",
    taskId: "task-cycle",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
  });
  assert.equal(s3.initialValues.title, "新标题");
  assert.equal(s3.initialValues.subtasks.length, 2);
  assert.equal(s3.initialValues.subtasks[0].title, "步骤1已完成");
  assert.equal(s3.initialValues.subtasks[0].completed, true);
  assert.equal(s3.initialValues.subtasks[1].title, "新步骤2");
  assert.equal(s3.initialValues.subtasks[1].completed, false);
});
