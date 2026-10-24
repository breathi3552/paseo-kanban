import test from "node:test";
import assert from "node:assert/strict";
import { KanbanBoardSchema } from "../shared/kanban.ts";
import { loadClientModule } from "./helpers/react-host-env.mjs";

const { openTaskSession } = loadClientModule("session/kanban-session");

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

test("任务草稿从创建到编辑：持久化完整字段与子步骤，拒绝空白子步骤", async () => {
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
  edit.updateSubtask("sub-a", { title: "  " });
  assert.equal((await edit.save()).success, false);
  assert.match(edit.getSnapshot().error, /第 1 个子步骤标题不能为空/);

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
});

test("保存期间保护草稿并拒绝过期版本或重复提交，失败保留草稿可重试", async () => {
  const store = createMockStore({ tasks: [task] });
  const initialTasks = structuredClone(store.values.tasks);
  const firstSave = Promise.withResolvers();
  let interceptFirst = true;
  const session = openTaskSession({
    ...store.options(),
    mode: "edit",
    taskId: "t1",
    save: (board, revision) => {
      if (interceptFirst) {
        interceptFirst = false;
        return firstSave.promise;
      }
      return store.save(board, revision);
    },
  });
  session.setTitle("初始草稿");
  const pending = session.save();
  session.setTitle("保存中修改");
  const duplicate = await session.save();
  assert.equal(duplicate.success, false);
  assert.match(duplicate.error, /正在保存中/);

  firstSave.resolve(false);
  const failed = await pending;
  assert.equal(failed.success, false);
  assert.equal(session.getSnapshot().title, "初始草稿");
  assert.deepEqual(store.values.tasks, initialTasks);

  assert.deepEqual(await session.save(), { success: true });
  assert.equal(store.values.tasks[0].title, "初始草稿");
});
