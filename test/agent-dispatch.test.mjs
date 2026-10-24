import test from "node:test";
import assert from "node:assert/strict";
import { act, loadClientModule } from "./helpers/react-host-env.mjs";
import { createHost, mount, press, text } from "./helpers/kanban-host.mjs";
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

const task = {
  id: "task-a",
  title: "修复 登录页",
  description: "Original **Markdown**\n\nKeep this paragraph.",
  laneId: "todo",
  projectId: "project-a",
  source: "github_issue",
  issueNumber: 14,
  subtasks: [
    { id: "s1", title: "Inspect", completed: false },
    { id: "s2", title: "已完成检查", completed: true },
  ],
  externalUrl: "https://github.com/example/repo/issues/14",
};
const projects = [
  {
    projectId: "project-a",
    projectDisplayName: "Project A",
    projectRootPath: "/projects/a",
    projectKind: "git",
  },
  {
    projectId: "project-b",
    projectDisplayName: "Project B",
    projectRootPath: "/projects/b",
    projectKind: "directory",
  },
];
const profiles = [
  {
    id: "first",
    name: "Development",
    provider: "claude",
    model: "sonnet",
    modeId: "plan",
    thinkingOptionId: "high",
    featureValues: { sandbox: true },
    notes: "Host metadata",
  },
  { id: "second", name: "Review", provider: "codex", model: "gpt-5" },
];
function fixture({
  task: taskChanges,
  failAt,
  workspacePages,
  agentGate,
  ...options
} = {}) {
  const handlers = new Map();
  const { default: contribute } = loadClientModule("../index.server");
  contribute({
    registerSettings() {},
    handle: (contract, handler) => handlers.set(contract.name, handler),
  });
  const createdWorkspaces = [],
    createdAgents = [],
    opened = [];
  const workspace = (id) => ({
    id,
    agents: {
      create: async (request) => {
        if (agentGate) await agentGate;
        if (failAt === "agent") {
          failAt = null;
          throw new Error("Agent creation failed");
        }
        createdAgents.push({ workspaceId: id, ...request });
        return { id: `agent-${createdAgents.length}` };
      },
    },
  });
  const host = createHost({
    rpc: async (input, name) => {
      assert.ok(handlers.has(name), `registered daemon RPC: ${name}`);
      return handlers.get(name)(input, {});
    },
    projectItems: projects,
    board: KanbanBoardSchema.parse({
      lanes: [
        { id: "todo", title: "Todo" },
        { id: "done", title: "Done", isCompletionLane: true },
      ],
      tasks: [{ ...task, ...taskChanges }],
    }),
    navigation: {
      openAgent: (target) => {
        if (failAt === "navigation") {
          failAt = null;
          throw new Error("Navigation failed");
        }
        opened.push(target);
      },
    },
    paseo: {
      config: { get: async () => ({ config: { agentProfiles: profiles } }) },
      workspaces: {
        list: async ({ page } = {}) => {
          const index = Number(page?.cursor ?? 0);
          return workspacePages
            ? {
                entries: workspacePages[index],
                pageInfo: {
                  nextCursor:
                    index + 1 < workspacePages.length
                      ? String(index + 1)
                      : null,
                  hasMore: index + 1 < workspacePages.length,
                },
              }
            : {
                entries: [
                  {
                    id: "workspace-a",
                    projectId: "project-a",
                    name: "Existing A",
                    workspaceDirectory: "/projects/a",
                  },
                  {
                    id: "workspace-b",
                    projectId: "project-b",
                    name: "Existing B",
                    workspaceDirectory: "/projects/b",
                  },
                ],
                pageInfo: { nextCursor: null, hasMore: false },
              };
        },
        create: async (request) => {
          if (failAt === "workspace") {
            failAt = null;
            throw new Error("Workspace creation failed");
          }
          createdWorkspaces.push(request);
          return workspace("new-workspace");
        },
        ref: workspace,
      },
    },
    ...options,
  });
  return { host, createdWorkspaces, createdAgents, opened };
}
const modal = (renderer) => renderer.root.findByType("Modal");
const select = (renderer, label) =>
  modal(renderer)
    .findAllByType("Select")
    .find((n) => n.props.label === label);
async function choose(renderer, label, value) {
  const control = select(renderer, label);
  assert.ok(control, `selector ${label} exists`);
  assert.ok(!control.props.disabled, `${label} is enabled`);
  assert.ok(
    control.props.options.some((o) => o.value === value),
    `${value} is selectable`,
  );
  await act(async () => control.props.onValueChange(value));
}

test("等待 Agent 创建时显示发送中反馈，禁止重复提交，完成后打开聊天", async (t) => {
  const gate = Promise.withResolvers();
  const { host, createdAgents, opened } = fixture({ agentGate: gate.promise });
  const renderer = await mount(t, host);
  await press(renderer.root, "Send to Agent");
  const send = modal(renderer)
    .findAllByType("Pressable")
    .find((node) =>
      node.findAllByType("Text").some((child) => text(child) === "Send"),
    );
  let pending;
  await act(async () => {
    pending = send.props.onPress();
  });
  assert.ok(
    modal(renderer).findAllByType("Text").map(text).includes("Sending…"),
  );
  assert.equal(modal(renderer).findAllByType("ActivityIndicator").length, 1);
  assert.equal(send.props.disabled, true);
  await act(async () => {
    send.props.onPress();
    modal(renderer).props.onOpenChange(false);
  });
  assert.equal(renderer.root.findAllByType("Modal").length, 1);
  await act(async () => {
    gate.resolve();
    await pending;
  });
  assert.equal(createdAgents.length, 1);
  assert.deepEqual(opened, [{ agentId: "agent-1" }]);
  assert.equal(renderer.root.findAllByType("Modal").length, 0);
});

test("派发期间切换语言，完成后按当前语言仅通知一次 prompt 已保存", async (t) => {
  const gate = Promise.withResolvers();
  const { host, createdAgents, opened } = fixture({ agentGate: gate.promise });
  const renderer = await mount(t, host);
  await press(renderer.root, "Send to Agent");
  const instruction = "Discuss the task before making changes.";
  await act(async () =>
    modal(renderer)
      .findByProps({ accessibilityLabel: "prompt" })
      .props.onChangeText(instruction),
  );
  const send = modal(renderer)
    .findAllByType("Pressable")
    .find((node) =>
      node.findAllByType("Text").some((child) => text(child) === "Send"),
    );
  let pending;
  await act(async () => {
    pending = send.props.onPress();
  });
  assert.equal(host.settingsValues["agent-dispatch"].prompt, instruction);
  assert.deepEqual(host.notifications, []);
  await act(async () => {
    language = "zh";
    windowEvents.dispatchEvent(new Event("focus"));
  });
  assert.ok(
    modal(renderer).findAllByType("Text").map(text).includes("发送中…"),
  );
  await act(async () => {
    gate.resolve();
    await pending;
  });
  assert.equal(createdAgents.length, 1);
  assert.ok(
    createdAgents[0].prompt.startsWith(`${instruction}\n\n# 修复 登录页`),
  );
  assert.deepEqual(opened, [{ agentId: "agent-1" }]);
  assert.equal(renderer.root.findAllByType("Modal").length, 0);
  assert.deepEqual(host.notifications, ["prompt 已保存"]);
  await act(async () => windowEvents.dispatchEvent(new Event("focus")));
  assert.deepEqual(host.notifications, ["prompt 已保存"]);
});

test("卡片发送到新普通工作区：宿主预设、完整任务消息和新聊天贯通", async (t) => {
  const { host, createdWorkspaces, createdAgents, opened } = fixture();
  const before = structuredClone(host.board);
  const renderer = await mount(t, host);
  await press(renderer.root, "Send to Agent");
  assert.equal(modal(renderer).props.title, "Send to Agent");
  assert.equal(select(renderer, "Project").props.value, "project-a");
  const workspaceSelect = select(renderer, "Workspace");
  assert.equal(
    workspaceSelect.props.options.find(
      (o) => o.value === workspaceSelect.props.value,
    ).label,
    "New regular workspace",
  );
  assert.equal(select(renderer, "Agent profile").props.value, "first");
  assert.deepEqual(
    select(renderer, "Agent profile").props.options.map((o) => o.label),
    ["Development", "Review"],
  );
  assert.ok(
    modal(renderer)
      .findAllByType("Text")
      .map(text)
      .includes("Manage Agent profiles on the Agent page in Paseo settings."),
  );
  assert.equal(
    modal(renderer)
      .findAllByType("TextInput")
      .filter((node) => node.props.accessibilityLabel !== "prompt").length,
    0,
    "new workspace name is not an input",
  );
  await press(modal(renderer), "Send");
  assert.deepEqual(createdWorkspaces, [
    {
      title: "修复 登录页",
      source: { kind: "directory", path: "/projects/a" },
    },
  ]);
  assert.equal(createdAgents.length, 1);
  assert.equal(createdAgents[0].workspaceId, "new-workspace");
  assert.deepEqual(createdAgents[0].config, {
    provider: "claude/sonnet",
    modeId: "plan",
    thinkingOptionId: "high",
    featureValues: { sandbox: true },
  });
  assert.equal(
    createdAgents[0].prompt,
    "Please work on the following task.\n\n# 修复 登录页\n\n## Description\n\nOriginal **Markdown**\n\nKeep this paragraph.\n\n## Steps\n\n- [ ] Inspect\n- [x] 已完成检查\n\n## Source\n\nhttps://github.com/example/repo/issues/14",
  );
  assert.deepEqual(opened, [{ agentId: "agent-1" }]);
  assert.deepEqual(
    host.board,
    before,
    "unchanged project needs no board write or agent linkage",
  );
  assert.equal(renderer.root.findAllByType("Modal").length, 0);
});

test("新建 worktree 使用独立分支名和任务显示名称，起点交由宿主解析", async (t) => {
  const { host, createdWorkspaces, createdAgents } = fixture();
  const renderer = await mount(t, host);
  await press(renderer.root, "Send to Agent");
  const option = select(renderer, "Workspace").props.options.find(
    (o) => o.label === "New worktree",
  );
  assert.ok(option, "Git project offers a worktree");
  await choose(renderer, "Workspace", option.value);
  await act(async () =>
    modal(renderer)
      .findByProps({ accessibilityLabel: "Git branch name" })
      .props.onChangeText("fix/login"),
  );
  assert.equal(
    createdWorkspaces.length,
    0,
    "selection does not create a workspace",
  );
  await press(modal(renderer), "Send");
  assert.deepEqual(createdWorkspaces, [
    {
      title: "修复 登录页",
      source: {
        kind: "worktree",
        cwd: "/projects/a",
        action: "branch-off",
        branchName: "fix/login",
      },
    },
  ]);
  assert.equal(createdAgents[0].workspaceId, "new-workspace");
});

test("已有工作区仍新建 Agent，空章节省略且不改变工作区名称", async (t) => {
  const { host, createdWorkspaces, createdAgents, opened } = fixture({
    task: {
      source: "manual",
      issueNumber: null,
      externalUrl: null,
      description: " \n\t",
      subtasks: [],
    },
  });
  const renderer = await mount(t, host);
  await press(renderer.root, "Send to Agent");
  const existing = select(renderer, "Workspace").props.options.filter((o) =>
    o.label.startsWith("Existing"),
  );
  assert.deepEqual(
    existing,
    [{ label: "Existing A", value: "workspace-a" }],
    "only selected project's workspaces",
  );
  await choose(renderer, "Workspace", "workspace-a");
  assert.equal(
    modal(renderer)
      .findAllByType("TextInput")
      .filter((node) => node.props.accessibilityLabel !== "prompt").length,
    0,
    "existing workspace selection does not repeat its name in an input",
  );
  await choose(renderer, "Agent profile", "second");
  await press(modal(renderer), "Send");
  assert.deepEqual(createdWorkspaces, []);
  assert.equal(createdAgents.length, 1);
  assert.equal(createdAgents[0].workspaceId, "workspace-a");
  assert.equal(createdAgents[0].config.provider, "codex/gpt-5");
  assert.equal(
    createdAgents[0].prompt,
    "Please work on the following task.\n\n# 修复 登录页",
  );
  assert.deepEqual(opened, [{ agentId: "agent-1" }]);
});

test("手动任务切换项目只在发送时保存，取消无副作用，普通目录不提供 worktree", async (t) => {
  const { host, createdWorkspaces, createdAgents } = fixture({
    task: { source: "manual", issueNumber: null, externalUrl: null },
  });
  const original = structuredClone(host.board);
  const renderer = await mount(t, host);
  await press(renderer.root, "Send to Agent");
  await choose(renderer, "Project", "project-b");
  assert.deepEqual(
    select(renderer, "Workspace").props.options.map((o) => o.label),
    ["Existing B", "New regular workspace"],
  );
  assert.deepEqual(host.board, original, "choosing does not save");
  await press(modal(renderer), "Cancel");
  assert.deepEqual(host.board, original);
  assert.deepEqual(createdWorkspaces, []);
  assert.deepEqual(createdAgents, []);
  await press(renderer.root, "Send to Agent");
  assert.equal(select(renderer, "Project").props.value, "project-a");
  await choose(renderer, "Workspace", "workspace-a");
  await choose(renderer, "Project", "project-b");
  assert.equal(
    select(renderer, "Workspace").props.value,
    "new-directory",
    "project change resets workspace choice",
  );
  await press(modal(renderer), "Send");
  assert.deepEqual(host.board.tasks, [
    { ...original.tasks[0], projectId: "project-b" },
  ]);
  assert.deepEqual(createdWorkspaces, [
    {
      title: "修复 登录页",
      source: { kind: "directory", path: "/projects/b" },
    },
  ]);
  assert.equal(createdAgents[0].workspaceId, "new-workspace");
});

test("导入任务固定原项目，无预设时表单禁用并保留管理提示及关闭入口", async (t) => {
  const { host, createdWorkspaces, createdAgents } = fixture();
  const renderer = await mount(t, host);
  await press(renderer.root, "Send to Agent");
  assert.equal(
    select(renderer, "Project").props.disabled,
    true,
    "GitHub project is read-only",
  );
  assert.equal(select(renderer, "Project").props.value, "project-a");
  await act(async () => modal(renderer).props.onOpenChange(false));
  assert.equal(renderer.root.findAllByType("Modal").length, 0);
  assert.deepEqual(createdWorkspaces, []);
  assert.deepEqual(createdAgents, []);

  const empty = fixture({
    paseo: {
      config: { get: async () => ({ config: { agentProfiles: [] } }) },
      workspaces: {
        list: async () => ({
          entries: [],
          pageInfo: { nextCursor: null, hasMore: false },
        }),
      },
    },
  });
  const emptyView = await mount(t, empty.host);
  await press(emptyView.root, "Send to Agent");
  assert.ok(
    modal(emptyView)
      .findAllByType("Select")
      .every((n) => n.props.disabled),
  );
  const send = modal(emptyView)
    .findAllByType("Pressable")
    .find((n) => n.findAllByType("Text").some((c) => text(c) === "Send"));
  assert.equal(send.props.disabled, true);
  assert.ok(
    modal(emptyView)
      .findAllByType("Text")
      .map(text)
      .includes("Manage Agent profiles on the Agent page in Paseo settings."),
  );
  await press(modal(emptyView), "Cancel");
  assert.equal(emptyView.root.findAllByType("Modal").length, 0);
});

test("缺少项目及空白或非法 Git 分支就地提示，修正后才能发送", async (t) => {
  const { host, createdWorkspaces, createdAgents } = fixture({
    task: {
      source: "manual",
      issueNumber: null,
      externalUrl: null,
      projectId: null,
    },
  });
  const renderer = await mount(t, host);
  await press(renderer.root, "Send to Agent");
  await press(modal(renderer), "Send");
  assert.ok(
    modal(renderer)
      .findAllByType("Text")
      .map(text)
      .includes("Select a project."),
  );
  assert.deepEqual(createdWorkspaces, []);
  await choose(renderer, "Project", "project-a");
  await choose(renderer, "Workspace", "new-worktree");
  await press(modal(renderer), "Send");
  assert.ok(
    modal(renderer)
      .findAllByType("Text")
      .map(text)
      .includes("Enter a valid Git branch name."),
  );
  const branch = () =>
    modal(renderer).findByProps({ accessibilityLabel: "Git branch name" });
  await act(async () => branch().props.onChangeText("bad branch name"));
  await press(modal(renderer), "Send");
  assert.ok(
    modal(renderer)
      .findAllByType("Text")
      .map(text)
      .includes("Enter a valid Git branch name."),
  );
  assert.equal(
    branch().props.value,
    "bad branch name",
    "no automatic renaming",
  );
  assert.deepEqual(createdWorkspaces, []);
  assert.deepEqual(createdAgents, []);
  assert.equal(
    host.board.tasks[0].projectId,
    null,
    "validation happens before saving",
  );
  assert.deepEqual(host.notifications, [], "field errors stay in the form");
  await act(async () => branch().props.onChangeText("fix/login"));
  await press(modal(renderer), "Send");
  assert.equal(createdAgents.length, 1);
  assert.equal(host.board.tasks[0].projectId, "project-a");
});

test("分阶段失败保留输入与已成功结果，不启动后续 Agent 或自动重试", async (t) => {
  for (const failure of [
    "save",
    "conflict",
    "workspace",
    "agent",
    "navigation",
  ]) {
    await t.test(failure, async (t) => {
      const { host, createdWorkspaces, createdAgents, opened } = fixture({
        failAt: failure,
        task: { source: "manual", issueNumber: null, externalUrl: null },
      });
      const renderer = await mount(t, host);
      await press(renderer.root, "Send to Agent");
      await choose(renderer, "Project", "project-b");
      await choose(renderer, "Agent profile", "second");
      if (failure === "save") host.failNextSave(new Error("Save failed"));
      if (failure === "conflict")
        await act(async () =>
          host.replaceBoard({
            ...host.board,
            tasks: [{ ...host.board.tasks[0], description: "Concurrent edit" }],
          }),
        );
      await press(modal(renderer), "Send");
      assert.equal(
        select(renderer, "Project").props.value,
        "project-b",
        "project input retained",
      );
      assert.equal(
        select(renderer, "Agent profile").props.value,
        "second",
        "preset input retained",
      );
      assert.equal(host.notifications.length, 1, "one host error Toast");
      assert.match(host.notifications[0], /Sending failed/);
      assert.equal(
        host.board.tasks[0].projectId,
        ["save", "conflict"].includes(failure) ? "project-a" : "project-b",
        "successful save is retained",
      );
      if (failure === "conflict")
        assert.equal(host.board.tasks[0].description, "Concurrent edit");
      assert.equal(
        createdWorkspaces.length,
        ["agent", "navigation"].includes(failure) ? 1 : 0,
        "successful workspace is retained",
      );
      assert.equal(createdAgents.length, failure === "navigation" ? 1 : 0);
      assert.deepEqual(opened, []);
      if (failure !== "conflict") {
        await press(modal(renderer), "Send");
        assert.equal(host.board.tasks[0].projectId, "project-b");
        assert.equal(
          createdWorkspaces.length,
          ["agent", "navigation"].includes(failure) ? 2 : 1,
        );
        assert.equal(createdAgents.length, failure === "navigation" ? 2 : 1);
        assert.deepEqual(opened, [
          { agentId: failure === "navigation" ? "agent-2" : "agent-1" },
        ]);
        assert.equal(renderer.root.findAllByType("Modal").length, 0);
      }
    });
  }
});

test("中文窄屏从卡片发送原文任务，提示词仅翻译章节名称", async (t) => {
  language = "zh";
  const { host, createdAgents } = fixture({ compact: true });
  const renderer = await mount(t, host);
  await press(renderer.root, "发送到 Agent");
  assert.equal(modal(renderer).props.title, "发送到 Agent");
  assert.equal(select(renderer, "Agent 配置").props.value, "first");
  assert.ok(
    modal(renderer)
      .findAllByType("Text")
      .map(text)
      .includes("前往 Paseo 设置中的 Agent 页面管理 Agent 配置。"),
  );
  await press(modal(renderer), "发送");
  assert.equal(
    createdAgents[0].prompt,
    "请处理以下任务。\n\n# 修复 登录页\n\n## 描述\n\nOriginal **Markdown**\n\nKeep this paragraph.\n\n## 子步骤\n\n- [ ] Inspect\n- [x] 已完成检查\n\n## 来源\n\nhttps://github.com/example/repo/issues/14",
  );
});

test("prompt 跨重开、任务、项目与入口持久保留，不把旧任务正文带到新任务", async (t) => {
  const first = fixture();
  const renderer = await mount(t, first.host);
  await press(renderer.root, "Send to Agent");
  const input = () =>
    modal(renderer).findByProps({ accessibilityLabel: "prompt" });
  assert.equal(input().props.multiline, true);
  assert.equal(input().props.value, "Please work on the following task.");
  const instruction = "请先跟我讨论需求。\n不要直接修改代码。";
  await act(async () => input().props.onChangeText(instruction));
  await press(modal(renderer), "Send");
  assert.ok(
    first.createdAgents[0].prompt.startsWith(
      `${instruction}\n\n# 修复 登录页\n\n## Description`,
    ),
  );
  assert.ok(first.createdAgents[0].prompt.endsWith(task.externalUrl));
  assert.equal(
    first.host.notifications.length,
    1,
    "edited prompt has one persisted-save notification",
  );

  language = "zh";
  const second = fixture({
    settingsValues: structuredClone(first.host.settingsValues),
    compact: true,
    task: {
      source: "manual",
      issueNumber: null,
      externalUrl: null,
      projectId: "project-b",
      title: "另一个任务",
      description: "新的正文",
      subtasks: [],
    },
  });
  const next = await mount(t, second.host, "workspace-b");
  await press(next.root, "发送到 Agent");
  const nextInput = () =>
    modal(next).findByProps({ accessibilityLabel: "prompt" });
  assert.equal(
    nextInput().props.value,
    instruction,
    "saved text survives a fresh client and language change",
  );
  await act(async () => nextInput().props.onChangeText("取消时不保存"));
  await press(modal(next), "取消");
  await press(next.root, "发送到 Agent");
  assert.equal(nextInput().props.value, instruction);
  await press(modal(next), "发送");
  assert.equal(
    second.createdAgents[0].prompt,
    `${instruction}\n\n# 另一个任务\n\n## 描述\n\n新的正文`,
  );

  const concurrent = fixture({
    settingsValues: structuredClone(second.host.settingsValues),
  });
  const windowA = await mount(t, concurrent.host);
  const windowB = await mount(t, concurrent.host, "workspace-a");
  await press(windowA.root, "发送到 Agent");
  await press(windowB.root, "发送到 Agent");
  await act(async () =>
    modal(windowA)
      .findByProps({ accessibilityLabel: "prompt" })
      .props.onChangeText("窗口 A 的最新指令"),
  );
  await act(async () =>
    modal(windowB)
      .findByProps({ accessibilityLabel: "prompt" })
      .props.onChangeText("窗口 B 先保存的指令"),
  );
  await press(modal(windowB), "发送");
  assert.equal(
    concurrent.host.settingsValues["agent-dispatch"].prompt,
    "窗口 B 先保存的指令",
  );
  await press(modal(windowA), "发送");
  assert.equal(
    concurrent.host.settingsValues["agent-dispatch"].prompt,
    "窗口 A 的最新指令",
  );
  assert.ok(
    concurrent.createdAgents[1].prompt.startsWith(
      "窗口 A 的最新指令\n\n# 修复 登录页",
    ),
  );
});

test("清空或只留空白的 prompt 会持久保存，只发送任务内容而不恢复默认开场句", async (t) => {
  for (const value of ["", " \n\t"]) {
    await t.test(JSON.stringify(value), async (t) => {
      const options = {
        task: {
          source: "manual",
          issueNumber: null,
          externalUrl: null,
          description: "",
          subtasks: [],
        },
      };
      const first = fixture(options);
      const renderer = await mount(t, first.host);
      await press(renderer.root, "Send to Agent");
      await act(async () =>
        modal(renderer)
          .findByProps({ accessibilityLabel: "prompt" })
          .props.onChangeText(value),
      );
      await press(modal(renderer), "Send");
      assert.equal(first.createdAgents[0].prompt, "# 修复 登录页");
      const second = fixture({
        ...options,
        settingsValues: structuredClone(first.host.settingsValues),
      });
      const next = await mount(t, second.host);
      await press(next.root, "Send to Agent");
      assert.equal(
        modal(next).findByProps({ accessibilityLabel: "prompt" }).props.value,
        value,
      );
      await press(modal(next), "Send");
      assert.equal(second.createdAgents[0].prompt, "# 修复 登录页");
    });
  }
});

test("prompt 先通过校验再保存；保存失败保留输入并停止派发，重试后正常发送", async (t) => {
  language = "zh";
  const { host, createdWorkspaces, createdAgents, opened } = fixture();
  const renderer = await mount(t, host);
  await press(renderer.root, "发送到 Agent");
  const input = () =>
    modal(renderer).findByProps({ accessibilityLabel: "prompt" });
  assert.equal(input().props.value, "请处理以下任务。");
  const instruction = "先讨论需求，不要开工。";
  await act(async () => input().props.onChangeText(instruction));
  await choose(renderer, "工作区", "new-worktree");
  const branch = () =>
    modal(renderer).findByProps({ accessibilityLabel: "Git 分支名称" });
  await act(async () => branch().props.onChangeText("bad branch"));
  await press(modal(renderer), "发送");
  assert.equal(host.settingsValues["agent-dispatch"].prompt, null);
  assert.deepEqual(host.notifications, []);

  await act(async () => branch().props.onChangeText("discuss/requirements"));
  host.failNextSave();
  await press(modal(renderer), "发送");
  assert.equal(host.settingsValues["agent-dispatch"].prompt, null);
  assert.equal(input().props.value, instruction);
  assert.equal(input().props.editable, true);
  assert.equal(modal(renderer).findAllByType("ActivityIndicator").length, 0);
  assert.equal(host.notifications.length, 1);
  assert.match(host.notifications[0], /发送失败/);
  assert.deepEqual(createdWorkspaces, []);
  assert.deepEqual(createdAgents, []);
  assert.deepEqual(opened, []);

  await press(modal(renderer), "发送");
  assert.equal(host.settingsValues["agent-dispatch"].prompt, instruction);
  assert.equal(createdWorkspaces.length, 1);
  assert.ok(
    createdAgents[0].prompt.startsWith(`${instruction}\n\n# 修复 登录页`),
  );
  assert.deepEqual(opened, [{ agentId: "agent-1" }]);
});

test("创建 Agent 失败结束发送中反馈，但已保存的 prompt 在下次发送仍保留", async (t) => {
  language = "zh";
  const gate = Promise.withResolvers();
  const { host, createdAgents, opened } = fixture({ agentGate: gate.promise });
  const renderer = await mount(t, host);
  await press(renderer.root, "发送到 Agent");
  const instruction = "请先和我讨论需求，不要修改代码。";
  const input = () =>
    modal(renderer).findByProps({ accessibilityLabel: "prompt" });
  await act(async () => input().props.onChangeText(instruction));
  const send = modal(renderer)
    .findAllByType("Pressable")
    .find((node) =>
      node.findAllByType("Text").some((child) => text(child) === "发送"),
    );
  let pending;
  await act(async () => {
    pending = send.props.onPress();
  });
  assert.ok(
    modal(renderer).findAllByType("Text").map(text).includes("发送中…"),
  );
  assert.equal(modal(renderer).findAllByType("ActivityIndicator").length, 1);
  assert.equal(input().props.editable, false);
  assert.equal(host.settingsValues["agent-dispatch"].prompt, instruction);
  await act(async () => {
    gate.reject(new Error("Agent unavailable"));
    await pending;
  });
  assert.equal(modal(renderer).findAllByType("ActivityIndicator").length, 0);
  assert.equal(input().props.editable, true);
  assert.equal(input().props.value, instruction);
  assert.match(host.notifications.at(-1), /发送失败/);
  assert.deepEqual(createdAgents, []);
  assert.deepEqual(opened, []);
  await press(modal(renderer), "取消");

  language = "en";
  const next = fixture({
    settingsValues: structuredClone(host.settingsValues),
  });
  const nextView = await mount(t, next.host);
  await press(nextView.root, "Send to Agent");
  assert.equal(
    modal(nextView).findByProps({ accessibilityLabel: "prompt" }).props.value,
    instruction,
  );
  await press(modal(nextView), "Send");
  assert.ok(
    next.createdAgents[0].prompt.startsWith(`${instruction}\n\n# 修复 登录页`),
  );
});

test("项目已有工作区跨宿主分页时仍可选择并在其中新建 Agent", async (t) => {
  const { host, createdWorkspaces, createdAgents } = fixture({
    workspacePages: [
      [
        {
          id: "other-project",
          projectId: "project-b",
          name: "Other project",
          workspaceDirectory: "/projects/b",
        },
      ],
      [
        {
          id: "later-workspace",
          projectId: "project-a",
          name: "Later workspace",
          workspaceDirectory: "/projects/a/later",
        },
      ],
    ],
  });
  const renderer = await mount(t, host);
  await press(renderer.root, "Send to Agent");
  await choose(renderer, "Workspace", "later-workspace");
  await press(modal(renderer), "Send");
  assert.deepEqual(createdWorkspaces, []);
  assert.equal(createdAgents[0].workspaceId, "later-workspace");
});
