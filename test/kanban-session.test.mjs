import test from "node:test";
import assert from "node:assert/strict";
import { KanbanBoardSchema } from "../shared/kanban.ts";
import {
  openTaskSession,
  openLaneSession,
  executeTaskReorder,
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
  assert.deepEqual(updated.subtasks[0], {
    id: "sub-a",
    title: "步骤A 改名",
    completed: true,
  });
  assert.deepEqual(updated.subtasks[1], {
    id: "sub-b",
    title: "步骤B",
    completed: true,
  });
  assert.deepEqual(updated.subtasks[2], {
    id: "sub-c",
    title: "步骤C 新增",
    completed: false,
  });
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
  assert.equal(
    store.values.lanes.find((l) => l.id === "lane-qa")?.title,
    "QA验收",
  );

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
  assert.equal(
    store.values.lanes.some((l) => l.id === "lane-qa"),
    false,
  );
});

// ---------------------------------------------------------------------------
// 2. 并发路径 (Concurrency / Stale Baseline)
// ---------------------------------------------------------------------------

test("并发路径: 外部修改或删除任务后，旧会话保存被拒绝且保留外部结果", async () => {
  for (const [scenario, externalTasks] of [
    ["修改", [{ id: "t1", title: "外部标题", laneId: "in-progress" }]],
    ["删除", []],
  ]) {
    const store = createMockStore({
      tasks: [{ id: "t1", title: "初始标题", laneId: "to-plan" }],
    });
    const session = openTaskSession({
      mode: "edit",
      taskId: "t1",
      baseBoard: store.values,
      baseRevision: store.revision,
      save: (b, r) => store.save(b, r),
    });

    assert.equal(
      await store.save(
        { ...store.values, tasks: externalTasks },
        store.revision,
      ),
      true,
      scenario,
    );
    const externalBoard = structuredClone(store.values);
    const externalRevision = store.revision;
    const result = await session.saveDraft({
      title: "旧会话的标题",
      laneId: "to-plan",
    });

    assert.equal(result.success, false, scenario);
    assert.match(result.error, /保存失败/, scenario);
    assert.deepEqual(store.values, externalBoard, scenario);
    assert.equal(store.revision, externalRevision, scenario);
  }
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
    "提交的版本号必须严格是会话打开时的 baseRevision (rev-1)，绝不能改用最新版本号 (rev-3)",
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
// 5. 统一任务排序操作 (executeTaskReorder)
// ---------------------------------------------------------------------------

test("排序操作: 成功移动任务，版本号匹配并推进，完整任务列表更新", async () => {
  const store = createMockStore({
    tasks: [
      { id: "t1", title: "Task 1", laneId: "to-plan", projectId: null },
      { id: "t2", title: "Task 2", laneId: "to-plan", projectId: null },
    ],
  });

  const baseRevision = store.revision;
  const result = await executeTaskReorder({
    baseBoard: store.values,
    baseRevision,
    taskId: "t1",
    targetLaneId: "to-plan",
    targetIndex: 1,
    save: (b, r) => store.save(b, r),
  });

  assert.equal(result.success, true);
  assert.equal(result.unchanged, undefined);
  assert.equal(store.history.length, 1);
  assert.equal(store.history[0].revision, baseRevision);
  assert.deepEqual(
    store.values.tasks.map((t) => t.id),
    ["t2", "t1"],
  );
});

test("排序操作: 同泳道原位操作返回 unchanged，不产生存储写入", async () => {
  const store = createMockStore({
    tasks: [
      { id: "t1", title: "Task 1", laneId: "to-plan", projectId: "projA" },
      { id: "t2", title: "Task 2", laneId: "to-plan", projectId: "projB" },
    ],
  });

  const result = await executeTaskReorder({
    baseBoard: store.values,
    baseRevision: store.revision,
    taskId: "t1",
    targetLaneId: "to-plan",
    targetIndex: 0,
    filter: "projA", // 看板选中项目时传入的实际筛选值
    save: (b, r) => store.save(b, r),
  });

  assert.equal(result.success, true);
  assert.equal(result.unchanged, true);
  assert.equal(store.history.length, 0, "原位操作不触发 save");
});

test("排序操作: 使用过期版本号提交返回保存失败，未覆盖新数据", async () => {
  const store = createMockStore({
    tasks: [{ id: "t1", title: "Task 1", laneId: "to-plan", projectId: null }],
  });

  // 外部并发修改导致 store 版本推进
  await store.save(
    {
      ...store.values,
      tasks: [
        {
          id: "t1",
          title: "外部并发修改的标题",
          laneId: "to-plan",
          projectId: null,
        },
      ],
    },
    store.revision,
  );

  // 旧事务使用旧版本号提交
  const result = await executeTaskReorder({
    baseBoard: {
      lanes: store.values.lanes,
      tasks: [
        { id: "t1", title: "旧快照任务", laneId: "to-plan", projectId: null },
      ],
    },
    baseRevision: "rev-1", // 已过期的版本
    taskId: "t1",
    targetLaneId: "in-progress",
    targetIndex: 0,
    save: (b, r) => store.save(b, r),
  });

  assert.equal(result.success, false);
  assert.match(result.error, /保存失败|冲突/);
  // 外部新数据未被覆盖
  assert.equal(store.values.tasks[0].title, "外部并发修改的标题");
  assert.equal(store.values.tasks[0].laneId, "to-plan");
});

test("排序操作: 保存适配器抛错被捕获并返回错误信息，不抛未捕获异常", async () => {
  const store = createMockStore({
    tasks: [{ id: "t1", title: "Task 1", laneId: "to-plan", projectId: null }],
  });

  const result = await executeTaskReorder({
    baseBoard: store.values,
    baseRevision: store.revision,
    taskId: "t1",
    targetLaneId: "in-progress",
    targetIndex: 0,
    save: async () => {
      throw new Error("Disk full");
    },
  });

  assert.equal(result.success, false);
  assert.match(result.error, /Disk full/);
});

// ---------------------------------------------------------------------------
// 6. 编辑草稿会话 (TaskEditSession / LaneEditSession)
// ---------------------------------------------------------------------------

test("会话草稿: 字段修改驱动不可变快照更新与订阅通知", () => {
  const store = createMockStore({});
  const session = openTaskSession({
    mode: "create",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
    defaultLaneId: "to-plan",
  });

  let notifications = 0;
  session.subscribe(() => {
    notifications++;
  });

  const snap0 = session.getSnapshot();
  assert.equal(snap0.title, "");
  assert.equal(snap0.laneId, "to-plan");

  // 更新标题
  session.setTitle("新功能设计");
  assert.equal(notifications, 1);
  const snap1 = session.getSnapshot();
  assert.equal(snap1.title, "新功能设计");
  assert.notEqual(snap0, snap1);

  // 无变化时快照引用稳定
  session.setTitle("新功能设计");
  assert.equal(notifications, 1, "无变化时不触发多余通知");
  assert.equal(session.getSnapshot(), snap1, "无变化时快照引用保持稳定");

  // 更新描述与项目
  session.setDescription("详细说明");
  session.setProjectId("proj-x");
  const snap2 = session.getSnapshot();
  assert.equal(snap2.description, "详细说明");
  assert.equal(snap2.projectId, "proj-x");
});

test("会话子步骤: 增删改与完成状态、稳定 ID 生成与碰撞防护", () => {
  const store = createMockStore({});
  const mockGenerator = () => "sub_1"; // 第二次生成时故意碰撞

  const session = openTaskSession({
    mode: "create",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
    idGenerator: mockGenerator,
  });

  // 1. 新增子步骤
  const ok1 = session.addSubtask("检查网络配置");
  assert.equal(ok1, true);
  assert.equal(session.getSnapshot().subtasks.length, 1);
  assert.equal(session.getSnapshot().subtasks[0].id, "sub_1");
  assert.equal(session.getSnapshot().subtasks[0].title, "检查网络配置");
  assert.equal(session.getSnapshot().subtasks[0].completed, false);

  // 2. 空白子步骤拒绝新增并暴露错误
  const okEmpty = session.addSubtask("   ");
  assert.equal(okEmpty, false);
  assert.equal(session.getSnapshot().subtasks.length, 1);
  assert.match(session.getSnapshot().error ?? "", /子步骤内容不能为空/);

  // 3. 修改子步骤内容与勾选完成
  session.updateSubtask("sub_1", {
    completed: true,
    title: "检查网络配置 (已通过)",
  });
  const sub1 = session.getSnapshot().subtasks[0];
  assert.equal(sub1.id, "sub_1", "ID 必须稳定保留");
  assert.equal(sub1.completed, true);
  assert.equal(sub1.title, "检查网络配置 (已通过)");

  // 4. 第二次生成相同 ID 时须避让；删除旧步骤不改变新步骤的 ID
  session.addSubtask("验证证书");
  const secondId = session.getSnapshot().subtasks[1].id;
  assert.match(secondId, /^sub_1_/);
  assert.notEqual(secondId, "sub_1");
  session.removeSubtask("sub_1");
  assert.equal(session.getSnapshot().subtasks.length, 1);
  assert.equal(session.getSnapshot().subtasks[0].id, secondId);
});

test("会话并发与防护: 保存中拒绝草稿修改与重复提交，保存失败恢复可操作并保留草稿", async () => {
  let saveResolvers = [];
  const store = createMockStore({});
  const slowSave = (b, r) =>
    new Promise((resolve) => {
      saveResolvers.push(() => resolve(store.save(b, r)));
    });

  const session = openTaskSession({
    mode: "create",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: slowSave,
  });

  session.setTitle("初始任务草稿");
  session.addSubtask("步骤1");

  // 发起保存
  const savePromise1 = session.save();
  assert.equal(session.getSnapshot().isSaving, true, "保存中 isSaving 为 true");

  // 保存期间拒绝草稿修改
  session.setTitle("尝试在保存中修改");
  assert.equal(session.getSnapshot().title, "初始任务草稿", "保存中草稿被保护");

  // 保存期间拒绝重复提交
  const savePromise2 = session.save();
  const dupResult = await savePromise2;
  assert.equal(dupResult.success, false);
  assert.match(dupResult.error, /正在保存中/);

  // 完成第一次保存
  saveResolvers[0]();
  const result1 = await savePromise1;
  assert.equal(result1.success, true);
  assert.equal(session.getSnapshot().isSaving, false);

  // 验证保存失败恢复草稿:
  // 使用过期的 revision 再次保存（模拟冲突）
  const staleSession = openTaskSession({
    mode: "create",
    baseBoard: store.values,
    baseRevision: "rev-expired",
    save: (b, r) => store.save(b, r),
  });
  staleSession.setTitle("未同步的内容");
  const failResult = await staleSession.save();
  assert.equal(failResult.success, false);
  assert.match(failResult.error, /保存失败|冲突/);
  assert.equal(staleSession.getSnapshot().isSaving, false);
  assert.equal(
    staleSession.getSnapshot().title,
    "未同步的内容",
    "失败必须完整保留草稿",
  );
});

test("泳道会话: 快照展示删除限制，空白标题保存失败并保留错误", async () => {
  const store = createMockStore({
    tasks: [{ id: "t1", title: "Task", laneId: "to-plan", projectId: null }],
  });

  const session = openLaneSession({
    mode: "edit",
    laneId: "to-plan",
    baseBoard: store.values,
    baseRevision: store.revision,
    save: (b, r) => store.save(b, r),
  });

  const snap = session.getSnapshot();
  assert.equal(snap.title, "待规划");
  assert.equal(snap.canDelete, false, "有任务的泳道不能删除");
  assert.equal(snap.tasksInLaneCount, 1);

  session.setTitle("计划中");
  assert.equal(session.getSnapshot().title, "计划中");

  // 空白名称拦截
  session.setTitle("   ");
  const emptyRes = await session.save();
  assert.equal(emptyRes.success, false);
  assert.match(emptyRes.error, /泳道名称不能为空/);
  assert.match(session.getSnapshot().error ?? "", /泳道名称不能为空/);
});

// ---------------------------------------------------------------------------
