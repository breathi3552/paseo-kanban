import test from "node:test";
import assert from "node:assert/strict";
import { act } from "./helpers/react-host-env.mjs";
import {
  createHost,
  mount,
  press,
  text,
  chooseProject,
  findDialog,
} from "./helpers/kanban-host.mjs";

let language = "en";
globalThis.localStorage = {
  getItem: () => JSON.stringify({ language }),
};
test.beforeEach(() => {
  language = "en";
});
test.after(() => {
  delete globalThis.localStorage;
});

function visibleTasks(root) {
  return root
    .findAllByType("Text")
    .map(text)
    .filter((s) => s.startsWith("Task ") && s !== "Task Kanban");
}

test("看板同时提供侧边栏和工作区标签页，各入口筛选独立，卸载清理注册", async (t) => {
  const host = createHost();
  assert.equal(host.sidebars.get("kanban").surface, "kanban");
  assert.ok(host.surfaces.get("kanban").Component);
  assert.equal(host.panels.get("kanban")?.context, "workspace");
  assert.equal(
    host.panels.get("kanban").title,
    host.sidebars.get("kanban").title,
  );

  const a = await mount(t, host, "workspace-a");
  const b = await mount(t, host, "workspace-b");
  const sidebar = await mount(t, host);
  assert.deepEqual(visibleTasks(a.root), ["Task A"]);
  assert.deepEqual(visibleTasks(b.root), ["Task B"]);
  await chooseProject(a.root, "Project B");
  await chooseProject(b.root, "No Project");
  assert.deepEqual(visibleTasks(a.root), ["Task B"]);
  assert.deepEqual(visibleTasks(b.root), ["Task unassigned"]);
  assert.deepEqual(visibleTasks(sidebar.root), [
    "Task A",
    "Task B",
    "Task unassigned",
  ]);
  await act(async () => a.update(host.open("workspace-a")));
  assert.deepEqual(visibleTasks(a.root), ["Task B"]);
  await act(async () => a.unmount());
  const reopened = await mount(t, host, "workspace-a");
  assert.deepEqual(visibleTasks(reopened.root), ["Task A"]);

  host.cleanup();
  assert.equal(host.sidebars.size, 0);
  assert.equal(host.panels.size, 0);
  assert.equal(host.surfaces.size, 0);
});

test("缺失工作区上下文时静默展示全部且迟到上下文不打断当前筛选，重开后才应用", async (t) => {
  const host = createHost({ workspaces: {} });
  const panel = await mount(t, host, "workspace-a");
  assert.deepEqual(visibleTasks(panel.root), [
    "Task A",
    "Task B",
    "Task unassigned",
  ]);
  await act(async () =>
    host.updateWorkspace("workspace-a", { projectId: "project-a" }),
  );
  assert.deepEqual(visibleTasks(panel.root), [
    "Task A",
    "Task B",
    "Task unassigned",
  ]);
  await chooseProject(panel.root, "Project B");
  await act(async () =>
    host.updateWorkspace("workspace-a", {
      projectId: "project-a",
      name: "Renamed",
    }),
  );
  assert.deepEqual(visibleTasks(panel.root), ["Task B"]);
  await act(async () => panel.unmount());
  const reopened = await mount(t, host, "workspace-a");
  assert.deepEqual(visibleTasks(reopened.root), ["Task A"]);
});

test("新任务关联跟随当前项目筛选（All/No Project 默认无关联），并跨入口同步", async (t) => {
  const host = createHost();
  const panel = await mount(t, host, "workspace-a");
  const peer = await mount(t, host, "workspace-b");
  const sidebar = await mount(t, host);
  for (const [filter, title, association, visibleInPeer] of [
    ["Project B", "Task new-B", "Project B", true],
    ["All Projects", "Task new-all", "No Project", false],
    ["No Project", "Task new-unassigned", "No Project", false],
  ]) {
    await chooseProject(panel.root, filter);
    await press(panel.root, "+ Add");
    const modal = findDialog(panel.root);
    await act(async () =>
      modal
        .findByProps({ placeholder: "Enter task title" })
        .props.onChangeText(title),
    );
    await press(modal, "Create");
    assert.ok(visibleTasks(sidebar.root).includes(title));
    assert.equal(visibleTasks(peer.root).includes(title), visibleInPeer);
    await chooseProject(panel.root, association);
    assert.ok(visibleTasks(panel.root).includes(title));
  }
});

test("关联项目缺失时卡片与详情回退显示原 ID（不混入无关占位），宿主恢复后更新真实名称且支持中英文排序", async (t) => {
  const projectListeners = new Set();
  let currentProjects = [
    { projectId: "p-z", projectDisplayName: "Zeta" },
    { projectId: "p-a", projectDisplayName: "Alpha" },
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
  const boardFilter = renderer.root.findAllByType("Select")[0];
  assert.deepEqual(
    boardFilter.props.options.slice(2).map((opt) => opt.label),
    ["Alpha", "missing-board-project", "Zeta"],
  );
  await act(async () => boardFilter.props.onValueChange("all"));

  assert.ok(
    renderer.root
      .findAllByType("Text")
      .map(text)
      .includes("missing-task-project"),
  );

  // Open task details and verify missing task project is preserved without leaking board-level missing project
  const card = renderer.root.findByProps({
    accessibilityLabel: "Task actions: Task Missing Project",
  });
  await act(async () =>
    card.props.onContextMenu({
      preventDefault() {},
      stopPropagation() {},
    }),
  );
  await press(renderer.root, "Edit details");
  const modal = findDialog(renderer.root);
  const projectSelect = modal.findByType("Select");
  assert.equal(projectSelect.props.value, "missing-task-project");
  const modalOptionValues = projectSelect.props.options.map((opt) => opt.value);
  assert.ok(modalOptionValues.includes("missing-task-project"));
  assert.equal(modalOptionValues.includes("missing-board-project"), false);
  await press(modal, "Cancel");

  // Host recovers the missing project name
  currentProjects = [
    ...currentProjects,
    {
      projectId: "missing-task-project",
      projectDisplayName: "Recovered Project",
    },
  ];
  await act(async () => {
    projectListeners.forEach((l) => l());
  });
  const cardTextsAfter = renderer.root.findAllByType("Text").map(text);
  assert.ok(cardTextsAfter.includes("Recovered Project"));
  assert.equal(cardTextsAfter.includes("missing-task-project"), false);
});
