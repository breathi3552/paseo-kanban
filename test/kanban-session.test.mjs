import test from "node:test";
import assert from "node:assert/strict";
import { KanbanBoardSchema } from "../shared/kanban.ts";
import {
  openTaskSession,
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
  edit.addSubtask("   ");
  assert.match(edit.getSnapshot().error, /子步骤内容不能为空/);
  edit.addSubtask("部署服务");
  edit.removeSubtask("sub-b");
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

test("打开时锁定的版本过期后拒绝任务草稿，不覆盖外部修改或删除", async () => {
  for (const [name, update] of [
    [
      "任务修改",
      (board) => ({ ...board, tasks: [{ ...task, title: "外部标题" }] }),
    ],
    ["任务删除", (board) => ({ ...board, tasks: [] })],
    ["任务创建", (board) => board],
  ]) {
    const store = createMockStore({ tasks: [task] });
    const session = openTaskSession({
      ...store.options(),
      mode: name === "任务创建" ? "create" : "edit",
      taskId: "t1",
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

test("子步骤标题改为空白时保存失败，保留输入且不覆盖持久内容", async () => {
  const store = createMockStore({
    tasks: [{ ...task, subtasks: [{ id: "s1", title: "检查配置" }] }],
  });
  const initial = structuredClone(store.values);
  const session = openTaskSession({
    ...store.options(),
    mode: "edit",
    taskId: "t1",
  });
  session.updateSubtask("s1", { title: "  " });
  const result = await session.save();
  assert.equal(result.success, false);
  assert.match(session.getSnapshot().error, /第 1 个子步骤标题不能为空/);
  assert.equal(session.getSnapshot().subtasks[0].title, "  ");
  assert.equal(store.writes, 0);
  assert.deepEqual(store.values, initial);
});

test("项目筛选下仅自身可见时原位落下不产生持久化写入", async () => {
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
  const initial = structuredClone(store.values);
  const result = await executeTaskReorder({
    ...store.options(),
    taskId: "t1",
    targetLaneId: "to-plan",
    targetIndex: 0,
    filter: "proj-a",
  });
  assert.deepEqual(result, { success: true, unchanged: true });
  assert.deepEqual(store.values, initial);
  assert.equal(store.writes, 0);
});

test("保存期间保护草稿并拒绝重复提交，失败保留完整草稿后可重试成功", async () => {
  const store = createMockStore();
  const firstSave = Promise.withResolvers();
  let failNextSave = true;
  const session = openTaskSession({
    ...store.options(),
    mode: "create",
    idGenerator: () => "s1",
    save: (board, revision) => {
      if (failNextSave) {
        failNextSave = false;
        return firstSave.promise;
      }
      return store.save(board, revision);
    },
  });
  session.setTitle("初始草稿");
  session.setDescription("完整任务描述");
  session.setLaneId("in-progress");
  session.setProjectId("proj-1");
  session.addSubtask("步骤1");
  const draft = session.getSnapshot();
  const pending = session.save();
  assert.equal(session.getSnapshot().isSaving, true);
  session.setTitle("保存中修改");
  const duplicate = await session.save();
  assert.equal(duplicate.success, false);
  assert.match(duplicate.error, /正在保存中/);

  firstSave.resolve(false);
  const failed = await pending;
  assert.equal(failed.success, false);
  assert.equal(failed.kind, "operation");
  assert.match(session.getSnapshot().error, /保存失败/);
  assert.deepEqual(session.getSnapshot(), {
    ...draft,
    error: failed.error,
    isSaving: false,
  });
  assert.deepEqual(store.values.tasks, []);

  assert.deepEqual(await session.save(), { success: true });
  assert.deepEqual(store.values.tasks, [
    {
      id: store.values.tasks[0].id,
      title: "初始草稿",
      description: "完整任务描述",
      laneId: "in-progress",
      projectId: "proj-1",
      subtasks: [{ id: "s1", title: "步骤1", completed: false }],
      completed: false,
      completedAt: null,
      source: "manual",
      issueNumber: null,
      externalUrl: null,
    },
  ]);
});
