import test from "node:test";
import assert from "node:assert/strict";
import { act } from "./helpers/react-host-env.mjs";
import { createHost, mount, press, text } from "./helpers/kanban-host.mjs";
import { KanbanBoardSchema } from "../shared/kanban.ts";

let language = "en";
let windowEvents = new EventTarget();
globalThis.localStorage = { getItem: () => JSON.stringify({ language }) };
globalThis.window = windowEvents;
test.beforeEach(() => {
  windowEvents = new EventTarget();
  globalThis.window = windowEvents;
});
test.after(() => {
  delete globalThis.localStorage;
  delete globalThis.window;
});

const lanes = [
  { id: "todo", title: "Todo", isCompletionLane: false },
  { id: "doing", title: "Doing", isCompletionLane: false },
  { id: "done", title: "Done", isCompletionLane: true },
];
const issue = (number) => ({
  number,
  title: `Issue ${number}`,
  body: `Body ${number}\n- [ ] original step`,
  url: `https://github.com/example/repo/issues/${number}`,
  author: "alice",
  createdAt: "2026-10-14T02:30:00Z",
});
const page = (start = 1, count = 25, totalCount = 51) => ({
  repository: "example/repo",
  issues: Array.from({ length: count }, (_, i) => issue(start + i)),
  totalCount,
});
const texts = (root) => root.findAllByType("Text").map(text).join("\n");
const modal = (renderer) => renderer.root.findByType("Modal");
const control = (root, label) => {
  const node = root
    .findAllByType("Pressable")
    .find((n) => n.props.accessibilityLabel === label);
  assert.ok(node, `reachable control: ${label}`);
  return node;
};
async function click(root, label) {
  const node = control(root, label);
  assert.ok(!node.props.disabled, `${label} is enabled`);
  await act(async () => node.props.onPress({ stopPropagation() {} }));
}
async function choose(renderer, label, value) {
  const node = modal(renderer)
    .findAllByType("Select")
    .find((n) => n.props.label === label);
  assert.ok(node, `selector ${label}`);
  await act(async () => node.props.onValueChange(value));
}
async function setup(t, options = {}, workspace = "workspace-a") {
  t.mock.method(Date, "now", () => Date.parse("2026-10-16T00:00:00Z"));
  language = "en";
  const host = createHost({
    board: { lanes, tasks: [] },
    rpc: async () => page(),
    ...options,
  });
  const renderer = await mount(t, host, workspace);
  await press(renderer.root, "Import from GitHub");
  return { host, renderer };
}

test("看板入口到持久任务：选择泳道、25项批量导入、来源摘录和旧手动入口", async (t) => {
  const { host, renderer } = await setup(t);
  assert.equal(
    modal(renderer).findAllByType("Select")[0].props.value,
    "project-a",
  );
  const laneSelect = modal(renderer).findAllByType("Select")[1];
  assert.deepEqual(
    laneSelect.props.options.map((o) => o.value),
    ["todo", "doing"],
  );
  await choose(renderer, "Import to lane", "doing");
  await click(modal(renderer), "Select all on this page");
  assert.match(texts(modal(renderer)), /25 selected/);
  await press(modal(renderer), "Import");
  assert.equal(host.board.tasks.length, 25);
  assert.deepEqual(
    host.board.tasks.map((task) => task.issueNumber),
    Array.from({ length: 25 }, (_, i) => i + 1),
  );
  const first = host.board.tasks[0];
  assert.equal(first.title, "Issue 1");
  assert.equal(first.source, "github_issue");
  assert.equal(first.projectId, "project-a");
  assert.equal(first.laneId, "doing");
  assert.equal(first.externalUrl, issue(1).url);
  assert.deepEqual(first.subtasks, []);
  assert.equal(first.completed, false);
  assert.equal(first.completedAt, null);
  assert.match(
    first.description,
    /^Body 1\n- \[ \] original step\n\n---\nGitHub Issue #1 · alice\nCreated at /,
  );
  assert.match(first.description, /2026-10-14/);
  assert.doesNotMatch(first.description, /ago/);
  assert.equal(renderer.root.findAllByType("Modal").length, 0);
  assert.equal(host.notifications.length, 1);
  assert.doesNotMatch(texts(renderer.root), /alice|opened|Created at/);
  await press(renderer.root, "+ Add");
  assert.equal(modal(renderer).props.title, "Create Task");
});

test("分页与全仓库排序通过真实控件清空选择，泳道切换保留选择", async (t) => {
  const queries = [];
  const { renderer } = await setup(t, {
    rpc: async (q) => {
      queries.push(q);
      return page(
        q.page === 2 ? 26 : q.sort === "asc" ? 51 : 1,
        q.sort === "asc" ? 1 : 25,
      );
    },
  });
  await click(modal(renderer), "Select Issue #1");
  await click(modal(renderer), "Next page");
  assert.match(texts(modal(renderer)), /0 selected/);
  assert.match(texts(modal(renderer)), /Issue 26/);
  await click(modal(renderer), "Select Issue #26");
  await choose(renderer, "Import to lane", "doing");
  assert.match(texts(modal(renderer)), /1 selected/);
  await click(modal(renderer), "Oldest first");
  assert.deepEqual(queries.at(-1), {
    projectId: "project-a",
    page: 1,
    sort: "asc",
  });
  assert.match(texts(modal(renderer)), /0 selected/);
  assert.match(texts(modal(renderer)), /Issue 51/);
  await choose(renderer, "Project", "project-b");
  assert.equal(queries.at(-1).page, 1);
});

test("当前项目与编号去重：完成任务置灰、其他项目不阻止、删除后可重导", async (t) => {
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
  assert.doesNotMatch(texts(modal(renderer)), /Already imported/);
  await click(modal(renderer), "Select all on this page");
  assert.match(texts(modal(renderer)), /1 selected/);
  await act(async () =>
    host.replaceBoard({
      ...host.board,
      tasks: host.board.tasks.filter((task) => task.id !== "existing"),
    }),
  );
  assert.equal(
    control(modal(renderer), "Select Issue #1").props.disabled,
    false,
  );
  await click(modal(renderer), "Select Issue #1");
  await press(modal(renderer), "Import");
  assert.equal(
    host.board.tasks.filter((task) => task.projectId === "project-a").length,
    2,
  );
});

test("保存失败保留选择、重试后一次保存，保存中不重复提交", async (t) => {
  const { host, renderer } = await setup(t, { rpc: async () => page(1, 1, 1) });
  await click(modal(renderer), "Select Issue #1");
  host.failNextSave();
  await press(modal(renderer), "Import");
  assert.equal(host.board.tasks.length, 0);
  assert.match(texts(modal(renderer)), /1 selected/);
  assert.match(texts(modal(renderer)), /conflict|failed/i);
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
  const submit = modal(renderer)
    .findAllByType("Pressable")
    .find((n) =>
      n.findAllByType("Text").some((child) => text(child) === "Import"),
    );
  assert.equal(submit.props.disabled, true);
  assert.equal(
    control(modal(renderer), "Select Issue #1").props.disabled,
    true,
  );
  await act(async () => gate.resolve());
  assert.equal(host.board.tasks.length, 1);
});

test("多会话更新重新去重，目标泳道删除不回退到其他泳道", async (t) => {
  const { host, renderer } = await setup(t, { rpc: async () => page(1, 2, 2) });
  await click(modal(renderer), "Select all on this page");
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
  assert.equal(host.board.tasks.length, 0);
  await choose(renderer, "Import to lane", "todo");
  const peer = {
    id: "peer",
    title: "Peer",
    description: "",
    projectId: "project-a",
    laneId: "todo",
    source: "github_issue",
    issueNumber: 1,
    externalUrl: issue(1).url,
    completed: false,
    completedAt: null,
    subtasks: [],
  };
  await act(async () => host.replaceBoard({ ...host.board, tasks: [peer] }));
  assert.equal(
    control(modal(renderer), "Select Issue #1").props.disabled,
    true,
  );
  await press(modal(renderer), "Import");
  assert.deepEqual(
    host.board.tasks.map((task) => task.issueNumber),
    [1, 2],
  );
});

test("读取失败与空列表有明确状态，重试恢复，迟到的项目结果不覆盖新选择", async (t) => {
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
  assert.ok(
    modal(renderer)
      .findAllByType("Text")
      .some(
        (node) =>
          text(node) ===
          "Sign in to GitHub using gh on the Paseo daemon machine.",
      ),
  );
  await press(modal(renderer), "Retry");
  await choose(renderer, "Project", "project-b");
  assert.match(texts(modal(renderer)), /Issue 31/);
  await act(async () => old.resolve(page(1, 1, 1)));
  assert.doesNotMatch(texts(modal(renderer)), /Issue 1\n/);
  const empty = await setup(t, { rpc: async () => page(1, 0, 0) });
  assert.match(texts(modal(empty.renderer)), /No open issues/);
});

test("卡片外链与详情完整网址打开同一网页，详情锁定项目且内容仍可编辑", async (t) => {
  const { host, renderer } = await setup(t, { rpc: async () => page(1, 1, 1) });
  await click(modal(renderer), "Select Issue #1");
  await press(modal(renderer), "Import");
  await click(renderer.root, "Open Issue in browser");
  assert.deepEqual(host.externalUrls, [issue(1).url]);
  assert.equal(renderer.root.findAllByType("Modal").length, 0);
  const title = renderer.root
    .findAllByType("Text")
    .find((n) => text(n) === "Issue 1");
  let cardBody = title.parent;
  while (cardBody && !cardBody.props.onPanResponderGrant)
    cardBody = cardBody.parent;
  assert.ok(cardBody, "card has a reachable tap gesture");
  await act(async () =>
    cardBody.props.onPanResponderGrant({ nativeEvent: {} }, { x0: 0, y0: 0 }),
  );
  await act(async () => cardBody.props.onPanResponderRelease());
  assert.equal(
    modal(renderer)
      .findAllByType("Pressable")
      .some((n) =>
        n.findAllByType("Text").some((child) => text(child) === "Project B"),
      ),
    false,
  );
  assert.match(
    texts(modal(renderer)),
    /https:\/\/github.com\/example\/repo\/issues\/1/,
  );
  await press(modal(renderer), issue(1).url);
  assert.deepEqual(host.externalUrls, [issue(1).url, issue(1).url]);
  const input = modal(renderer)
    .findAllByType("TextInput")
    .find((n) => n.props.value === "Issue 1");
  await act(async () => input.props.onChangeText("Edited title"));
  await press(modal(renderer), "Save Changes");
  assert.equal(host.board.tasks[0].title, "Edited title");
  assert.equal(host.board.tasks[0].source, "github_issue");
  assert.equal(host.board.tasks[0].issueNumber, 1);
  assert.equal(host.board.tasks[0].externalUrl, issue(1).url);
  assert.equal(host.board.tasks[0].projectId, "project-a");
});

test("上游语言切换更新导入界面且保留页码、勾选；保存摘录不随语言重写", async (t) => {
  const { host, renderer } = await setup(t, {
    compact: true,
    rpc: async (query) =>
      query.page === 2 ? page(26, 1, 26) : page(1, 25, 26),
  });
  await click(modal(renderer), "Next page");
  await click(modal(renderer), "Select Issue #26");
  assert.match(texts(modal(renderer)), /Page 2 of 2/);
  await act(async () => {
    language = "zh-CN";
    windowEvents.dispatchEvent(new Event("focus"));
  });
  assert.match(texts(modal(renderer)), /已选择 1 项/);
  assert.match(texts(modal(renderer)), /第 2 页，共 2 页/);
  assert.equal(
    control(modal(renderer), "选择 Issue #26").props.accessibilityState.checked,
    true,
  );
  await press(modal(renderer), "导入");
  assert.deepEqual(
    host.board.tasks.map((task) => task.issueNumber),
    [26],
  );
  const description = host.board.tasks[0].description;
  assert.match(description, /创建于/);
  await act(async () => {
    language = "en";
    windowEvents.dispatchEvent(new Event("focus"));
  });
  assert.equal(host.board.tasks[0].description, description);
});

test("全部视图不擅自选择项目，显式选择后才读取仓库", async (t) => {
  let reads = 0;
  const { renderer } = await setup(
    t,
    {
      rpc: async () => {
        reads++;
        return page(1, 1, 1);
      },
    },
    undefined,
  );
  await press(modal(renderer), "Cancel");
  await press(renderer.root, "All");
  const initialReads = reads;
  await press(renderer.root, "Import from GitHub");
  assert.equal(modal(renderer).findAllByType("Select")[0].props.value, "");
  assert.match(texts(modal(renderer)), /Select a project/);
  assert.equal(reads, initialReads);
  await choose(renderer, "Project", "project-b");
  assert.equal(reads, initialReads + 1);
  assert.match(texts(modal(renderer)), /Issue 1/);
});

test("Project A 筛选下导入 Project B 后自动切换筛选，新任务可见而 A 任务隐藏", async (t) => {
  const { host, renderer } = await setup(t, {
    board: KanbanBoardSchema.parse({
      lanes,
      tasks: [
        {
          id: "a",
          title: "Only Project A",
          laneId: "todo",
          projectId: "project-a",
        },
        {
          id: "b",
          title: "Only Project B",
          laneId: "todo",
          projectId: "project-b",
        },
      ],
    }),
    rpc: async () => page(1, 1, 1),
  });
  await press(modal(renderer), "Cancel");
  assert.match(texts(renderer.root), /Only Project A/);
  assert.doesNotMatch(texts(renderer.root), /Only Project B/);
  await press(renderer.root, "Import from GitHub");
  assert.equal(
    modal(renderer).findAllByType("Select")[0].props.value,
    "project-a",
  );
  await choose(renderer, "Project", "project-b");
  await click(modal(renderer), "Select Issue #1");
  await press(modal(renderer), "Import");
  assert.equal(
    host.board.tasks.find((task) => task.issueNumber === 1).projectId,
    "project-b",
  );
  assert.match(texts(renderer.root), /Issue 1/);
  assert.match(texts(renderer.root), /Only Project B/);
  assert.doesNotMatch(texts(renderer.root), /Only Project A/);
});

test("Open Issues减少导致末页失效时，重试返回第一页并恢复可选列表", async (t) => {
  let shrunk = false;
  const queries = [];
  const { renderer } = await setup(t, {
    rpc: async (q) => {
      queries.push(q.page);
      if (q.page === 2) {
        shrunk = true;
        throw new Error("github_page");
      }
      return page(1, 25, shrunk ? 25 : 26);
    },
  });
  await click(modal(renderer), "Next page");
  await press(modal(renderer), "Retry");
  assert.match(texts(modal(renderer)), /Issue 1\n/);
  assert.deepEqual(queries, [1, 2, 1]);
  assert.equal(control(modal(renderer), "Next page").props.disabled, true);
});

test("保存冲突且宿主刷新失败时弹窗及选择仍保留，刷新重试后可导入", async (t) => {
  const { host, renderer } = await setup(t, { rpc: async () => page(1, 1, 1) });
  await choose(renderer, "Import to lane", "doing");
  await click(modal(renderer), "Select Issue #1");
  host.failNextSave();
  host.failNextReload();
  await press(modal(renderer), "Import");
  assert.equal(modal(renderer).props.title, "Import from GitHub");
  assert.match(texts(modal(renderer)), /1 selected/);
  assert.equal(modal(renderer).findAllByType("Select")[1].props.value, "doing");
  await press(modal(renderer), "Retry");
  await press(modal(renderer), "Import");
  assert.equal(host.board.tasks.length, 1);
  assert.equal(host.board.tasks[0].laneId, "doing");
});
