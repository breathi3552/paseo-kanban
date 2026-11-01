import { findDialog, findDialogs } from "./helpers/kanban-host.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { act } from "./helpers/react-host-env.mjs";
import {
  createHost,
  mount,
  press,
  text,
  chooseProject,
} from "./helpers/kanban-host.mjs";
import { KanbanBoardSchema } from "../shared/kanban.ts";

let language = "en";
let windowEvents;
globalThis.localStorage = { getItem: () => JSON.stringify({ language }) };
test.beforeEach(() => {
  language = "en";
  windowEvents = new EventTarget();
  globalThis.window = windowEvents;
});
test.after(() => {
  delete globalThis.window;
  delete globalThis.localStorage;
});

const lanes = [
  { id: "todo", title: "Todo", isCompletionLane: false },
  { id: "doing", title: "Doing", isCompletionLane: false },
  { id: "done", title: "Finished", isCompletionLane: true },
];
const issue = (number) => ({
  number,
  title: `Issue ${number}`,
  body: `Body ${number}\n- [ ] original step`,
  url: `https://github.com/example/repo/issues/${number}`,
  author: "alice",
  createdAt: new Date(Date.UTC(2026, 9, 14, 12, 0, number)).toISOString(),
});
const page = (start, count = 25, totalCount = 51) => ({
  repository: "example/repo",
  totalCount,
  issues: Array.from({ length: count }, (_, i) => issue(start + i)),
});
const modal = (renderer) => findDialog(renderer.root);
const texts = (root) => root.findAllByType("Text").map(text).join("\n");
function control(root, label) {
  const node = root
    .findAllByType("Pressable")
    .find((n) => n.props.accessibilityLabel === label);
  assert.ok(node, `control ${label} exists`);
  return node;
}
async function click(root, label) {
  const node = control(root, label);
  assert.ok(!node.props.disabled, `${label} is enabled`);
  await act(async () => node.props.onPress({ stopPropagation() {} }));
}
async function choose(renderer, label, value) {
  const select = modal(renderer)
    .findAllByType("Select")
    .find((n) => n.props.label === label);
  assert.ok(select, `selector ${label} exists`);
  assert.ok(
    select.props.options.some((o) => o.value === value),
    `${value} is selectable`,
  );
  await act(async () => select.props.onValueChange(value));
}
async function setup(t, options = {}, workspaceId = "workspace-a") {
  const host = createHost({
    board: KanbanBoardSchema.parse({ lanes, tasks: [] }),
    rpc: async () => page(1),
    ...options,
  });
  const renderer = await mount(t, host, workspaceId);
  await press(renderer.root, "Import from GitHub");
  return { host, renderer };
}

test("全部视图需显式选择项目才拉取仓库，批量导入生成来源摘录并自动切换至导入项目筛选", async (t) => {
  let reads = 0;
  const { host, renderer } = await setup(
    t,
    {
      board: KanbanBoardSchema.parse({
        lanes,
        tasks: [
          {
            id: "a",
            title: "Only Project A",
            laneId: "todo",
            projectId: "project-a",
          },
        ],
      }),
      rpc: async () => {
        reads++;
        return page(1, 25, 25);
      },
    },
    null,
  );
  assert.equal(modal(renderer).findAllByType("Select")[0].props.value, "");
  assert.equal(reads, 0);
  await press(modal(renderer), "Cancel");

  await chooseProject(renderer.root, "Project A");
  await press(renderer.root, "Import from GitHub");
  await choose(renderer, "Project", "project-b");
  assert.equal(reads, 2);
  await choose(renderer, "Import to lane", "doing");
  await click(modal(renderer), "Select all on this page");
  await press(modal(renderer), "Import");

  const importedTasks = host.board.tasks.filter(
    (task) => task.projectId === "project-b",
  );
  assert.equal(importedTasks.length, 25);
  assert.equal(importedTasks[0].laneId, "doing");
  assert.equal(importedTasks[0].source, "github_issue");
  assert.match(
    importedTasks[0].description,
    /^Body 1\n- \[ \] original step\n\n---\nGitHub Issue #1 · alice\nCreated at /,
  );
  assert.equal(findDialogs(renderer.root).length, 0);
  assert.match(texts(renderer.root), /Issue 1/);
  assert.doesNotMatch(texts(renderer.root), /Only Project A/);
});

test("分页与排序切换清空已选，泳道切换保留已选，末页失效重试返回第一页", async (t) => {
  let shrunk = false;
  const queries = [];
  const { renderer } = await setup(t, {
    rpc: async (q) => {
      queries.push(q);
      if (q.page === 2 && shrunk) throw new Error("github_page");
      return page(q.page === 2 ? 26 : 1, 25, shrunk ? 25 : 51);
    },
  });
  await click(modal(renderer), "Select Issue #1");
  await choose(renderer, "Import to lane", "doing");
  assert.match(texts(modal(renderer)), /1 selected/);

  await click(modal(renderer), "Next page");
  assert.match(texts(modal(renderer)), /0 selected/);
  await click(modal(renderer), "Select Issue #26");
  await click(modal(renderer), "Oldest first");
  assert.equal(queries.at(-1).sort, "asc");
  assert.equal(queries.at(-1).page, 1);
  assert.match(texts(modal(renderer)), /0 selected/);

  shrunk = true;
  await click(modal(renderer), "Next page");
  await press(modal(renderer), "Retry");
  assert.equal(queries.at(-1).page, 1);
  assert.match(texts(modal(renderer)), /Issue 1\n/);
});

test("同项目按编号去重（含完成任务与多会话同步），目标泳道被删阻止提交", async (t) => {
  const imported = (id, projectId, n, completed) => ({
    id,
    title: id,
    description: "",
    laneId: "todo",
    projectId,
    subtasks: [],
    completed,
    completedAt: completed ? 1 : null,
    source: "github_issue",
    issueNumber: n,
    externalUrl: issue(n).url,
  });
  const { host, renderer } = await setup(t, {
    board: {
      lanes,
      tasks: [
        imported("existing", "project-a", 1, true),
        imported("other", "project-b", 2, false),
      ],
    },
    rpc: async () => page(1, 2, 2),
  });
  assert.equal(
    control(modal(renderer), "Select Issue #1").props.disabled,
    true,
  );
  assert.equal(
    control(modal(renderer), "Select Issue #2").props.disabled,
    false,
  );
  await click(modal(renderer), "Select all on this page");
  assert.match(texts(modal(renderer)), /1 selected/);

  // External deletion of target lane blocks import until valid lane chosen
  await choose(renderer, "Import to lane", "doing");
  await act(async () =>
    host.replaceBoard({
      lanes: host.board.lanes.filter((l) => l.id !== "doing"),
      tasks: [],
    }),
  );
  assert.equal(
    modal(renderer)
      .findAllByType("Pressable")
      .find((n) =>
        n.findAllByType("Text").some((child) => text(child) === "Import"),
      ).props.disabled,
    true,
  );
  await choose(renderer, "Import to lane", "todo");
  await click(modal(renderer), "Select Issue #1");
  await press(modal(renderer), "Import");
  assert.equal(host.board.tasks.length, 2);
});

test("保存失败或冲突保留勾选，保存中防重与防关闭，重试后正常导入", async (t) => {
  const { host, renderer } = await setup(t, { rpc: async () => page(1, 1, 1) });
  await click(modal(renderer), "Select Issue #1");
  host.failNextSave();
  await press(modal(renderer), "Import");
  assert.equal(host.board.tasks.length, 0);
  assert.match(texts(modal(renderer)), /1 selected/);

  const gate = Promise.withResolvers();
  host.holdSave(gate.promise);
  await act(async () => {
    void modal(renderer)
      .findAllByType("Pressable")
      .find((n) =>
        n.findAllByType("Text").some((child) => text(child) === "Import"),
      )
      .props.onPress();
  });
  await act(async () =>
    renderer.root.findByType("WebDialogPortal").props.onDismiss(),
  );
  assert.equal(findDialogs(renderer.root).length, 1);
  await act(async () => gate.resolve());
  assert.equal(host.board.tasks.length, 1);
  assert.equal(findDialogs(renderer.root).length, 0);
});

test("读取失败与空列表显示明确状态，重试可恢复，慢请求结果不覆盖新选择的项目", async (t) => {
  const old = Promise.withResolvers();
  let calls = 0;
  const { renderer } = await setup(t, {
    rpc: async (q) => {
      calls++;
      if (calls === 1) throw new Error("github_auth");
      if (q.projectId === "project-a") return old.promise;
      return page(31, 1, 1);
    },
  });
  assert.match(
    texts(modal(renderer)),
    /Sign in to GitHub using gh on the Paseo daemon machine/,
  );
  await press(modal(renderer), "Retry");
  await choose(renderer, "Project", "project-b");
  assert.match(texts(modal(renderer)), /Issue 31/);
  await act(async () => old.resolve(page(1, 1, 1)));
  assert.doesNotMatch(texts(modal(renderer)), /Issue 1\n/);
  const empty = await setup(t, { rpc: async () => page(1, 0, 0) });
  assert.match(texts(modal(empty.renderer)), /No open issues/);
});
