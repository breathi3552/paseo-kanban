import test from "node:test";
import assert from "node:assert/strict";
import {
  React,
  TestRenderer,
  act,
  loadClientModule,
} from "./helpers/react-host-env.mjs";
import { createHost, mount, text, press } from "./helpers/kanban-host.mjs";

let language = "en";
globalThis.localStorage = { getItem: () => JSON.stringify({ language }) };
test.after(() => {
  delete globalThis.localStorage;
});

async function mountProjects(t) {
  const requests = [];
  let listener;
  let state;
  const paseo = {
    projects: {
      list: () => {
        const request = Promise.withResolvers();
        requests.push(request);
        return request.promise;
      },
      subscribe: (callback) => {
        listener = callback;
        return () => {
          listener = null;
        };
      },
    },
  };
  const { useProjects } = loadClientModule("use-projects", {
    "@getpaseo/plugin/client": { usePaseo: () => paseo },
  });
  function Consumer() {
    state = useProjects();
    return null;
  }
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Consumer));
  });
  t.after(async () => {
    await act(async () => renderer.unmount());
    assert.equal(listener, null, "卸载后取消宿主订阅");
  });
  return {
    requests,
    refresh: () => listener(),
    get state() {
      return state;
    },
  };
}

const initialProjects = [{ projectId: "p1", projectDisplayName: "项目1" }];
const updatedProjects = [
  { projectId: "p1", projectDisplayName: "项目1已更新" },
];

test("宿主项目加载与订阅: 失败保留列表，恢复后更新名称并清除错误", async (t) => {
  const host = await mountProjects(t);
  assert.equal(host.state.isLoading, true);
  assert.deepEqual(host.state.projects, []);

  await act(async () =>
    host.requests.shift().resolve({ projects: initialProjects }),
  );
  assert.equal(host.state.isLoading, false);
  assert.equal(host.state.resolveProjectName("p1"), "项目1");

  await act(async () => {
    host.refresh();
    host.requests.shift().reject(new Error("503 Service Unavailable"));
  });
  assert.deepEqual(host.state.projects, initialProjects);
  assert.equal(host.state.isError, true);
  assert.equal(host.state.error, "503 Service Unavailable");

  await act(async () => {
    host.refresh();
    host.requests.shift().resolve({ projects: updatedProjects });
  });
  assert.deepEqual(host.state.projects, updatedProjects);
  assert.equal(host.state.resolveProjectName("p1"), "项目1已更新");
  assert.equal(host.state.isError, false);
  assert.equal(host.state.error, null);
});

test("订阅请求乱序: 较早请求的成功或失败都不能覆盖最新项目结果", async (t) => {
  for (const outcome of ["成功", "失败"]) {
    const host = await mountProjects(t);
    const oldRequest = host.requests.shift();
    await act(async () => {
      host.refresh();
      host.requests.shift().resolve({ projects: updatedProjects });
    });
    await act(async () => {
      if (outcome === "成功") oldRequest.resolve({ projects: initialProjects });
      else oldRequest.reject(new Error("Old network timeout"));
    });
    assert.deepEqual(host.state.projects, updatedProjects, `旧请求${outcome}`);
    assert.equal(host.state.resolveProjectName("p1"), "项目1已更新");
    assert.equal(host.state.error, null, `旧请求${outcome}`);
  }
});

test("卡片关联项目缺失时回退显示原 ID，宿主恢复后更新为真实名称", async (t) => {
  const projectListeners = new Set();
  let currentProjects = [
    { projectId: "project-a", projectDisplayName: "Project A" },
  ];
  const host = createHost({
    paseo: {
      projects: {
        list: async () => ({ projects: currentProjects }),
        subscribe: (listener) => {
          projectListeners.add(listener);
          return () => projectListeners.delete(listener);
        },
      },
    },
    board: {
      lanes: [{ id: "todo", title: "Todo", isCompletionLane: false }],
      tasks: [
        {
          id: "task-missing",
          title: "Task With Missing Project",
          projectId: "project-missing",
          laneId: "todo",
          subtasks: [],
        },
      ],
    },
  });

  const renderer = await mount(t, host);
  const cardTextsBefore = renderer.root.findAllByType("Text").map(text);
  assert.ok(
    cardTextsBefore.includes("project-missing"),
    "卡片显示缺失项目的原 ID",
  );

  currentProjects = [
    { projectId: "project-missing", projectDisplayName: "Recovered Project" },
  ];
  await act(async () => {
    projectListeners.forEach((l) => l());
  });

  const cardTextsAfter = renderer.root.findAllByType("Text").map(text);
  assert.ok(
    cardTextsAfter.includes("Recovered Project"),
    "恢复后卡片显示真实项目名称",
  );
  assert.equal(
    cardTextsAfter.includes("project-missing"),
    false,
    "原 ID 不再显示",
  );
});

test("任务详情保留任务原关联项目，即使缺失也不清空，且不混入看板保留的无关项目 ID", async (t) => {
  const host = createHost({
    projectItems: [
      { projectId: "project-real", projectDisplayName: "Real Project" },
    ],
    workspaces: {
      "workspace-board": { projectId: "missing-board-project" },
    },
    board: {
      lanes: [{ id: "todo", title: "Todo", isCompletionLane: false }],
      tasks: [
        {
          id: "task-missing",
          title: "Task Missing Project",
          projectId: "missing-task-project",
          laneId: "todo",
          subtasks: [],
        },
      ],
    },
  });

  const renderer = await mount(t, host, "workspace-board");

  // Show all projects so task-missing is visible while board still has initialProjectId = missing-board-project
  const boardFilter = renderer.root.findAllByType("Select")[0];
  assert.ok(boardFilter, "board filter select exists");
  await act(async () => boardFilter.props.onValueChange("all"));

  // Open context menu and edit details
  const e = { preventDefault() {}, stopPropagation() {} };
  const card = renderer.root.findByProps({
    accessibilityLabel: "Task actions: Task Missing Project",
  });
  assert.ok(card, "card exists");
  await act(async () => card.props.onContextMenu(e));

  const editButton = renderer.root
    .findAllByProps({ accessibilityRole: "menuitem" })
    .find((n) => n.props.accessibilityLabel === "Edit details");
  assert.ok(editButton, "Edit details button exists");
  await act(async () => editButton.props.onPress());

  const modal = renderer.root.findByType("Modal");
  assert.ok(modal, "task modal opened");

  // Find the project Select inside TaskModal
  const selects = modal.findAllByType("Select");
  const projectSelect = selects.find(
    (s) =>
      s.props.label === "Project" || s.props.value === "missing-task-project",
  );
  assert.ok(projectSelect, "project select found in modal");
  assert.equal(
    projectSelect.props.value,
    "missing-task-project",
    "草稿关联保留原缺失项目 ID",
  );

  const optionValues = projectSelect.props.options.map((opt) => opt.value);
  assert.ok(
    optionValues.includes("missing-task-project"),
    "包含任务原关联缺失项目",
  );
  assert.equal(
    optionValues.includes("missing-board-project"),
    false,
    "不混入看板入口保留的无关项目 ID",
  );
});

test("项目选项按中英文当前语言显示名称排序，包含缺失 ID 回退", async (t) => {
  // 1. English sorting
  const enProjects = [
    { projectId: "p-z", projectDisplayName: "Zeta" },
    { projectId: "p-a", projectDisplayName: "Alpha" },
    { projectId: "p-m", projectDisplayName: "Beta" },
  ];
  const hostEn = createHost({
    projectItems: enProjects,
    workspaces: {
      "workspace-delta": { projectId: "Delta-missing" },
    },
    board: {
      lanes: [{ id: "todo", title: "Todo", isCompletionLane: false }],
      tasks: [
        {
          id: "task-delta",
          title: "Task Delta",
          projectId: "Delta-missing",
          laneId: "todo",
          subtasks: [],
        },
      ],
    },
  });

  const rendererEn = await mount(t, hostEn, "workspace-delta");
  const filterSelectEn = rendererEn.root.findAllByType("Select")[0];
  assert.ok(filterSelectEn, "English filter select exists");

  // Options after 'all' and 'unassigned'
  const filterProjectLabelsEn = filterSelectEn.props.options
    .slice(2)
    .map((opt) => opt.label);
  const expectedEnLabels = [
    ...enProjects.map((p) => p.projectDisplayName),
    "Delta-missing",
  ].sort((a, b) => a.localeCompare(b, "en"));
  assert.deepEqual(filterProjectLabelsEn, expectedEnLabels);

  // 2. Chinese sorting
  const zhProjects = [
    { projectId: "p-sh", projectDisplayName: "上海" },
    { projectId: "p-bj", projectDisplayName: "北京" },
    { projectId: "p-gz", projectDisplayName: "广州" },
  ];
  const hostZh = createHost({
    projectItems: zhProjects,
    board: {
      lanes: [{ id: "todo", title: "Todo", isCompletionLane: false }],
      tasks: [
        {
          id: "task-zh",
          title: "任务中文",
          projectId: "missing-id",
          laneId: "todo",
          subtasks: [],
        },
      ],
    },
  });

  // Temporarily switch language to zh-CN
  language = "zh-CN";
  const rendererZh = await mount(t, hostZh);
  const filterSelectZh = rendererZh.root.findAllByType("Select")[0];
  assert.ok(filterSelectZh, "Chinese filter select exists");

  const filterProjectLabelsZh = filterSelectZh.props.options
    .slice(2)
    .map((opt) => opt.label);
  const expectedZhLabels = [
    ...zhProjects.map((p) => p.projectDisplayName),
  ].sort((a, b) => a.localeCompare(b, "zh-CN"));
  assert.deepEqual(
    filterProjectLabelsZh,
    expectedZhLabels,
    "中文界面下按中文显示名称排序",
  );
  language = "en";
});

test("任务传递入口验证缺失项目占位不能作为有效目标创建工作区或发送任务", async (t) => {
  const createdWorkspaces = [];
  const createdAgents = [];
  const host = createHost({
    projectItems: [
      {
        projectId: "real-project",
        projectDisplayName: "Real Project",
        projectRootPath: "/path/to/real",
        projectKind: "directory",
      },
    ],
    paseo: {
      workspaces: {
        list: async () => ({
          entries: [],
          pageInfo: { nextCursor: null, hasMore: false },
        }),
        create: async (req) => {
          createdWorkspaces.push(req);
          return {
            id: "ws-new",
            agents: {
              create: async (agentReq) => {
                createdAgents.push(agentReq);
                return { id: "agent-1" };
              },
            },
          };
        },
      },
      agents: {
        create: async (req) => {
          createdAgents.push(req);
          return { agent: { id: "agent-new" } };
        },
        start: async () => {},
      },
      config: {
        get: async () => ({
          config: {
            agentProfiles: [
              {
                id: "profile-1",
                name: "Default Profile",
                provider: "claude",
                model: "sonnet",
              },
            ],
          },
        }),
      },
    },
    navigation: { openAgent() {} },
    board: {
      lanes: [
        { id: "todo", title: "Todo", isCompletionLane: false },
        { id: "done", title: "Done", isCompletionLane: true },
      ],
      tasks: [
        {
          id: "task-missing-target",
          title: "Task With Missing Project Target",
          description: "",
          projectId: "deleted-placeholder-project",
          laneId: "todo",
          subtasks: [],
        },
      ],
    },
  });

  const renderer = await mount(t, host);

  // Click the send button on the card
  await press(renderer.root, "Send to Agent");

  const modal = renderer.root.findByType("Modal");
  assert.ok(modal, "agent dispatch modal opened");

  // Attempt to submit directly with the missing project placeholder
  await press(modal, "Send");

  // Should show error and block workspace/agent creation
  const modalTexts = modal.findAllByType("Text").map(text);
  assert.ok(
    modalTexts.includes("Select a project."),
    "缺失项目占位被拒绝并提示选择真实项目",
  );
  assert.deepEqual(createdWorkspaces, [], "未创建工作区");
  assert.deepEqual(createdAgents, [], "未启动 Agent");

  // Select the real project and send
  const projectSelect = modal
    .findAllByType("Select")
    .find((s) => s.props.label === "Project");
  assert.ok(projectSelect, "project select found in dispatch modal");

  // Verify missing placeholder is not even offered as a valid option
  const optionValues = projectSelect.props.options.map((opt) => opt.value);
  assert.equal(
    optionValues.includes("deleted-placeholder-project"),
    false,
    "缺失占位不在任务传递项目候选列表中",
  );

  // Select real project
  await act(async () => projectSelect.props.onValueChange("real-project"));
  await press(modal, "Send");

  assert.equal(createdWorkspaces.length, 1, "选择真实项目后成功创建工作区");
  assert.equal(createdAgents.length, 1, "成功启动 Agent");
});
