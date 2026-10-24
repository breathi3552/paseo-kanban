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

test("派发至新普通工作区、新 worktree 及分页已有工作区，组装完整或精简任务消息并打开 Agent", async (t) => {
  // 1. New regular directory workspace with full markdown/steps/source
  const dirFixture = fixture();
  const dirRenderer = await mount(t, dirFixture.host);
  await press(dirRenderer.root, "Send to Agent");
  await press(modal(dirRenderer), "Send");
  assert.deepEqual(dirFixture.createdWorkspaces, [
    {
      title: "修复 登录页",
      source: { kind: "directory", path: "/projects/a" },
    },
  ]);
  assert.deepEqual(dirFixture.createdAgents[0].config, {
    provider: "claude/sonnet",
    modeId: "plan",
    thinkingOptionId: "high",
    featureValues: { sandbox: true },
  });
  assert.equal(
    dirFixture.createdAgents[0].prompt,
    "Please work on the following task.\n\n# 修复 登录页\n\n## Description\n\nOriginal **Markdown**\n\nKeep this paragraph.\n\n## Steps\n\n- [ ] Inspect\n- [x] 已完成检查\n\n## Source\n\nhttps://github.com/example/repo/issues/14",
  );
  assert.deepEqual(dirFixture.opened, [{ agentId: "agent-1" }]);

  // 2. New Git worktree workspace
  const wtFixture = fixture();
  const wtRenderer = await mount(t, wtFixture.host);
  await press(wtRenderer.root, "Send to Agent");
  await choose(wtRenderer, "Workspace", "new-worktree");
  await act(async () =>
    modal(wtRenderer)
      .findByProps({ accessibilityLabel: "Git branch name" })
      .props.onChangeText("fix/login"),
  );
  await press(modal(wtRenderer), "Send");
  assert.deepEqual(wtFixture.createdWorkspaces, [
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

  // 3. Existing workspace across paginated list, omitting empty sections
  const existingFixture = fixture({
    task: {
      source: "manual",
      issueNumber: null,
      externalUrl: null,
      description: " \n\t",
      subtasks: [],
    },
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
  const existingRenderer = await mount(t, existingFixture.host);
  await press(existingRenderer.root, "Send to Agent");
  await choose(existingRenderer, "Workspace", "later-workspace");
  await choose(existingRenderer, "Agent profile", "second");
  await press(modal(existingRenderer), "Send");
  assert.deepEqual(existingFixture.createdWorkspaces, []);
  assert.equal(existingFixture.createdAgents[0].workspaceId, "later-workspace");
  assert.equal(existingFixture.createdAgents[0].config.provider, "codex/gpt-5");
  assert.equal(
    existingFixture.createdAgents[0].prompt,
    "Please work on the following task.\n\n# 修复 登录页",
  );
});

test("手动任务切换项目仅在发送时持久化，GitHub 导入任务锁定原项目，无预设时整体禁用", async (t) => {
  const { host, createdWorkspaces } = fixture({
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
  await press(modal(renderer), "Cancel");
  assert.deepEqual(host.board, original);

  await press(renderer.root, "Send to Agent");
  await choose(renderer, "Project", "project-b");
  await press(modal(renderer), "Send");
  assert.equal(host.board.tasks[0].projectId, "project-b");
  assert.equal(createdWorkspaces[0].source.path, "/projects/b");

  const imported = fixture();
  const importedView = await mount(t, imported.host);
  await press(importedView.root, "Send to Agent");
  assert.equal(select(importedView, "Project").props.disabled, true);

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
});

test("prompt 自定义与清空跨会话持久保留，发送期间防重复提交并防关闭", async (t) => {
  const gate = Promise.withResolvers();
  const first = fixture({ agentGate: gate.promise });
  const renderer = await mount(t, first.host);
  await press(renderer.root, "Send to Agent");
  const instruction = "请先跟我讨论需求。";
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
  assert.equal(send.props.disabled, true);
  await act(async () => {
    gate.resolve();
    await pending;
  });
  assert.equal(first.createdAgents.length, 1);
  assert.ok(
    first.createdAgents[0].prompt.startsWith(`${instruction}\n\n# 修复 登录页`),
  );
  assert.deepEqual(first.host.notifications, ["Sent to Agent"]);

  // Blank prompt persists and omits the opening instruction
  language = "en";
  const second = fixture({
    settingsValues: structuredClone(first.host.settingsValues),
    task: {
      source: "manual",
      issueNumber: null,
      externalUrl: null,
      description: "",
      subtasks: [],
    },
  });
  const next = await mount(t, second.host);
  await press(next.root, "Send to Agent");
  assert.equal(
    modal(next).findByProps({ accessibilityLabel: "prompt" }).props.value,
    instruction,
  );
  await act(async () =>
    modal(next)
      .findByProps({ accessibilityLabel: "prompt" })
      .props.onChangeText("   "),
  );
  await press(modal(next), "Send");
  assert.equal(second.createdAgents[0].prompt, "# 修复 登录页");
});

test("缺少项目（含已删缺失项目占位）及非法 Git 分支名在保存前拦截并就地提示", async (t) => {
  const { host, createdWorkspaces, createdAgents } = fixture({
    task: {
      source: "manual",
      issueNumber: null,
      externalUrl: null,
      projectId: "deleted-placeholder-project",
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
  assert.equal(host.board.tasks[0].projectId, "deleted-placeholder-project");
  await act(async () => branch().props.onChangeText("fix/login"));
  await press(modal(renderer), "Send");
  assert.equal(createdAgents.length, 1);
  assert.equal(host.board.tasks[0].projectId, "project-a");
});

test("分阶段失败保留输入与已成功结果，不启动后续步骤或自动重试", async (t) => {
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
      assert.equal(select(renderer, "Project").props.value, "project-b");
      assert.equal(select(renderer, "Agent profile").props.value, "second");
      assert.match(host.notifications[0], /Sending failed/);
      assert.equal(
        host.board.tasks[0].projectId,
        ["save", "conflict"].includes(failure) ? "project-a" : "project-b",
      );
      assert.equal(
        createdWorkspaces.length,
        ["agent", "navigation"].includes(failure) ? 1 : 0,
      );
      assert.equal(createdAgents.length, failure === "navigation" ? 1 : 0);
      assert.deepEqual(opened, []);
    });
  }
});
