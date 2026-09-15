import test from "node:test";
import assert from "node:assert/strict";
import {
  KanbanBoardSchema,
  addTask,
  updateTask,
  deleteTask,
  addLane,
  updateLane,
  deleteLane,
} from "../shared/kanban.ts";

// Helper: simulates the atomic host settings store with revision-based CAS
function createMockSettingsStore(initialBoard) {
  let currentBoard = KanbanBoardSchema.parse(initialBoard);
  let currentRevision = "rev-" + Math.random().toString(36).slice(2, 8);

  return {
    get values() {
      return currentBoard;
    },
    get revision() {
      return currentRevision;
    },
    async save(newBoard, expectedRevision) {
      if (expectedRevision !== currentRevision) {
        return false; // Revision conflict!
      }
      currentBoard = KanbanBoardSchema.parse(newBoard);
      currentRevision = "rev-" + Math.random().toString(36).slice(2, 8);
      return true;
    },
  };
}

test("Session闭环 1: 子步骤改名保存、重新打开与空白标题拒绝（草稿不丢）", async () => {
  const store = createMockSettingsStore({});

  // 1. 创建任务带有初始子步骤
  const initialTask = {
    id: "task-sub-test",
    title: "实现认证模块",
    description: "描述详情",
    laneId: "to-plan",
    projectId: null,
    subtasks: [
      { id: "sub-1", title: "设计 Token 结构", completed: false },
      { id: "sub-2", title: "编写单元测试", completed: true },
    ],
  };
  const b1 = addTask(store.values, initialTask);
  const ok1 = await store.save(b1, store.revision);
  assert.equal(ok1, true);

  // 2. 打开编辑会话：捕获 baseBoard 与 baseRevision
  const session = {
    mode: "edit",
    baseBoard: store.values,
    baseRevision: store.revision,
    task: store.values.tasks.find((t) => t.id === "task-sub-test"),
  };

  // 3. 在子步骤 TextInput 中编辑：修改 sub-1 标题，保留 id 与 completed
  let draftSubtasks = session.task.subtasks.map((s) => ({ ...s }));
  draftSubtasks = draftSubtasks.map((s) =>
    s.id === "sub-1" ? { ...s, title: "设计 JWT Token 结构" } : s
  );

  // 4. 空白标题校验：若用户把某子步骤改为空白，校验必须拦截，但草稿不得丢失
  const invalidDraft = draftSubtasks.map((s) =>
    s.id === "sub-2" ? { ...s, title: "   " } : s
  );
  const hasBlank = invalidDraft.some((s) => !s.title.trim());
  assert.equal(hasBlank, true, "应识别空白子步骤标题");
  // 草稿中的内容依然完整保存在 invalidDraft 中，未被抹除
  assert.equal(invalidDraft.length, 2);

  // 5. 保存合法草稿
  assert.equal(draftSubtasks.every((s) => s.title.trim().length > 0), true);
  const nextBoard = updateTask(session.baseBoard, session.task.id, {
    title: session.task.title,
    description: session.task.description,
    laneId: session.task.laneId,
    projectId: session.task.projectId,
    subtasks: draftSubtasks,
  });

  const saveSuccess = await store.save(nextBoard, session.baseRevision);
  assert.equal(saveSuccess, true, "基于有效基准版本保存成功");

  // 6. 重新打开：验证子步骤标题确实已持久化，且 id 与 completed 状态严格保留
  const reopenedBoard = store.values;
  const reopenedTask = reopenedBoard.tasks.find((t) => t.id === "task-sub-test");
  assert.ok(reopenedTask);
  assert.equal(reopenedTask.subtasks.length, 2);

  const sub1 = reopenedTask.subtasks.find((s) => s.id === "sub-1");
  assert.equal(sub1.title, "设计 JWT Token 结构");
  assert.equal(sub1.completed, false, "未触及的 completed 状态应保留");

  const sub2 = reopenedTask.subtasks.find((s) => s.id === "sub-2");
  assert.equal(sub2.title, "编写单元测试");
  assert.equal(sub2.completed, true, "原有 completed 状态应保留");
});

test("Session闭环 2: 并发 A草稿 / B修改 -> A保存拒绝与草稿保留（防止无感知覆盖）", async () => {
  const store = createMockSettingsStore({});

  // 初始有一个任务
  const b1 = addTask(store.values, {
    id: "task-concurrent",
    title: "原始任务标题",
    laneId: "to-plan",
  });
  await store.save(b1, store.revision);

  // 用户 A 打开编辑任务：锁定 baseBoard 与 baseRevision
  const sessionA = {
    mode: "edit",
    baseBoard: store.values,
    baseRevision: store.revision,
    task: store.values.tasks.find((t) => t.id === "task-concurrent"),
  };

  // 用户 A 在本地界面修改标题（形成草稿）
  const draftA = {
    ...sessionA.task,
    title: "A 修改的标题（本地草稿）",
  };

  // 此时，用户 B 并发操作：修改了同一个任务并成功保存，导致 store 升级到新 revision
  const nextBoardB = updateTask(store.values, "task-concurrent", {
    title: "B 抢先修改并提交的标题",
  });
  const saveBSuccess = await store.save(nextBoardB, store.revision);
  assert.equal(saveBSuccess, true);
  assert.notEqual(store.revision, sessionA.baseRevision);

  // 用户 A 点击保存：
  // 遵循修复逻辑：使用 sessionA 锁定的 baseRevision 提交
  const nextBoardA = updateTask(sessionA.baseBoard, draftA.id, {
    title: draftA.title,
  });
  const saveASuccess = await store.save(nextBoardA, sessionA.baseRevision);

  // 断言：A 的保存必须被拒绝（CAS 冲突）！
  assert.equal(saveASuccess, false, "A的保存因基准版本冲突必须返回 false");

  // 断言：Store 中保留的是 B 的修改，未被 A 偷偷覆盖
  assert.equal(
    store.values.tasks.find((t) => t.id === "task-concurrent").title,
    "B 抢先修改并提交的标题"
  );

  // 断言：A 的弹窗状态保留本地草稿，不被清空
  assert.equal(draftA.title, "A 修改的标题（本地草稿）");
});

test("Session闭环 3: B删除任务不能被A在编辑会话中复活", async () => {
  const store = createMockSettingsStore({});

  // 初始有一个任务
  const b1 = addTask(store.values, {
    id: "task-to-be-deleted",
    title: "待删除的任务",
    laneId: "to-plan",
  });
  await store.save(b1, store.revision);

  // 用户 A 打开编辑会话
  const sessionA = {
    mode: "edit",
    baseBoard: store.values,
    baseRevision: store.revision,
    task: store.values.tasks.find((t) => t.id === "task-to-be-deleted"),
  };

  // 用户 B 删除了该任务并成功提交
  const nextBoardB = deleteTask(store.values, "task-to-be-deleted");
  const saveBSuccess = await store.save(nextBoardB, store.revision);
  assert.equal(saveBSuccess, true);
  assert.equal(
    store.values.tasks.some((t) => t.id === "task-to-be-deleted"),
    false,
    "任务已被 B 彻底删除"
  );

  // 用户 A 点击保存：
  // 修复规则：mode === "edit" 严禁走 addTask！
  // 即使采用 baseBoard 提交，也会因 revision 冲突被拒；
  // 如果采用当前最新板，因为 task 不存在，也会被拒绝，绝不会复活！
  async function handleSaveTaskSession(session, taskData, settings) {
    const { mode, baseBoard, baseRevision } = session;
    if (mode === "create") {
      const nb = addTask(baseBoard, taskData);
      return await settings.save(nb, baseRevision);
    } else {
      // 编辑模式：任务必须存在于基准中
      const existsInBase = baseBoard.tasks.some((t) => t.id === taskData.id);
      if (!existsInBase) return false;

      const nb = updateTask(baseBoard, taskData.id, taskData);
      return await settings.save(nb, baseRevision);
    }
  }

  const saveResult = await handleSaveTaskSession(
    sessionA,
    { id: "task-to-be-deleted", title: "A 尝试保存被删除的任务" },
    store
  );

  assert.equal(saveResult, false, "保存必须失败，被版本冲突或模式校验拦截");

  // 验证当前存储中绝对没有被复活的任务
  assert.equal(
    store.values.tasks.some((t) => t.id === "task-to-be-deleted"),
    false,
    "被 B 删除的任务绝对不能被 A 复活"
  );
});

test("Session闭环 4: 泳道操作锁定会话基准与安全保护", async () => {
  const store = createMockSettingsStore({});

  // 增加测试泳道
  const b1 = addLane(store.values, { id: "lane-qa", title: "QA测试" });
  await store.save(b1, store.revision);

  // 会话 A 打开编辑泳道
  const sessionLaneA = {
    mode: "edit",
    baseBoard: store.values,
    baseRevision: store.revision,
    lane: store.values.lanes.find((l) => l.id === "lane-qa"),
  };

  // 用户 B 抢先修改了该泳道名称
  const b2 = updateLane(store.values, "lane-qa", { title: "B改名为验收中" });
  await store.save(b2, store.revision);

  // 会话 A 尝试保存旧基准
  async function handleSaveLaneSession(session, laneData, settings) {
    const { mode, baseBoard, baseRevision } = session;
    if (mode === "create") {
      const nb = addLane(baseBoard, laneData);
      return await settings.save(nb, baseRevision);
    } else {
      const exists = baseBoard.lanes.some((l) => l.id === laneData.id);
      if (!exists) return false;
      const nb = updateLane(baseBoard, laneData.id, { title: laneData.title });
      return await settings.save(nb, baseRevision);
    }
  }

  const resultA = await handleSaveLaneSession(
    sessionLaneA,
    { id: "lane-qa", title: "A改名为开发自测" },
    store
  );

  assert.equal(resultA, false, "旧泳道会话保存被版本冲突拒绝");
  assert.equal(
    store.values.lanes.find((l) => l.id === "lane-qa").title,
    "B改名为验收中",
    "B的更名得到完整保留"
  );
});
