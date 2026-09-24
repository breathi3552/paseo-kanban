import test from "node:test";
import assert from "node:assert/strict";
import {
  React,
  TestRenderer,
  act,
  loadClientModule,
  mockReactNative,
} from "./helpers/react-host-env.mjs";

globalThis.localStorage = {
  getItem: () => JSON.stringify({ language: "en" }),
};
test.after(() => {
  delete globalThis.localStorage;
});

const hostProps = {
  host: { id: "host-1", label: "Test host" },
  layout: { compact: false, platform: "web" },
  theme: {
    colors: {
      foreground: "#eeeeee",
      foregroundMuted: "#aaaaaa",
      surface0: "#111111",
      surface1: "#222222",
      surface2: "#333333",
      border: "#444444",
      accent: "#0088ff",
      accentForeground: "#ffffff",
      statusDanger: "#ff0000",
      statusWarning: "#ffff00",
      statusSuccess: "#00ff00",
    },
  },
};

function text(node) {
  return node.children.filter((child) => typeof child === "string").join("");
}

function visibleTasks(root) {
  return root
    .findAllByType("Text")
    .map(text)
    .filter((s) => s.startsWith("Task ") && s !== "Task Kanban");
}

async function press(root, label) {
  const button = root
    .findAllByType("Pressable")
    .find((node) =>
      node.findAllByType("Text").some((child) => text(child) === label),
    );
  assert.ok(button, `button ${label} exists`);
  await act(async () => button.props.onPress());
}

function createHost({
  projectsAvailable = true,
  workspaces = {
    "workspace-a": { projectId: "project-a" },
    "workspace-b": { projectId: "project-b" },
  },
} = {}) {
  const projects = [
    { projectId: "project-a", projectDisplayName: "Project A" },
    { projectId: "project-b", projectDisplayName: "Project B" },
  ];
  let workspaceSnapshot = workspaces;
  const workspaceListeners = new Set();
  const settingsListeners = new Set();
  let revision = 1;
  let values = {
    lanes: [{ id: "todo", title: "Todo" }],
    tasks: ["a", "b", null].map((project) => ({
      id: `task-${project ?? "unassigned"}`,
      title: `Task ${project?.toUpperCase() ?? "unassigned"}`,
      description: "",
      projectId: project && `project-${project}`,
      laneId: "todo",
      subtasks: [],
    })),
  };
  let settings = { status: "ready", values, revision: String(revision) };
  const paseo = {
    projects: {
      list: async () => {
        if (!projectsAvailable) throw new Error("Projects unavailable");
        return { projects };
      },
      subscribe: () => () => {},
    },
  };
  const sdk = {
    usePaseo: () => paseo,
    useWorkspace: (id, selector) => {
      const snapshot = React.useSyncExternalStore(
        (listener) => {
          workspaceListeners.add(listener);
          return () => workspaceListeners.delete(listener);
        },
        () => workspaceSnapshot,
      );
      return snapshot[id] ? selector(snapshot[id]) : null;
    },
    useSettings: (contract) => {
      const snapshot = React.useSyncExternalStore(
        (listener) => {
          settingsListeners.add(listener);
          return () => settingsListeners.delete(listener);
        },
        () => settings,
      );
      return {
        ...snapshot,
        save: async (next, expectedRevision) => {
          if (expectedRevision !== String(revision)) return false;
          values = contract.schema.parse(next);
          settings = { status: "ready", values, revision: String(++revision) };
          settingsListeners.forEach((listener) => listener());
          return true;
        },
      };
    },
  };
  function Modal(props) {
    return React.createElement("Modal", props, props.children);
  }
  Modal.Content = "ModalContent";
  const surfaces = new Map();
  const sidebars = new Map();
  const panels = new Map();
  function register(map, contribution) {
    assert.equal(map.has(contribution.id), false, "no duplicate contributions");
    map.set(contribution.id, contribution);
    return () => map.delete(contribution.id);
  }
  const client = {
    addSurface(id, Component) {
      return register(surfaces, { id, Component });
    },
    addSidebarItem: (item) => register(sidebars, item),
    addWorkspacePanel: (panel) => register(panels, panel),
  };
  const { default: contribute } = loadClientModule("../index.client", {
    "@getpaseo/plugin/client": sdk,
    "@getpaseo/plugin/client/react-native": {
      Modal,
      TextInput: "TextInput",
      Icon: "Icon",
      ScrollView: mockReactNative.ScrollView,
    },
  });
  const cleanup = contribute(client);
  return {
    surfaces,
    sidebars,
    panels,
    cleanup,
    open(workspaceId) {
      const Component = workspaceId
        ? panels.get("kanban").Component
        : surfaces.get("kanban").Component;
      return React.createElement(Component, {
        ...hostProps,
        ...(workspaceId ? { context: "workspace", workspaceId } : {}),
      });
    },
    updateWorkspace(id, workspace) {
      workspaceSnapshot = { ...workspaceSnapshot, [id]: workspace };
      workspaceListeners.forEach((listener) => listener());
    },
  };
}

test("看板同时提供侧边栏和普通工作区标签页，卸载时清理注册", () => {
  const host = createHost();
  assert.equal(host.sidebars.get("kanban").surface, "kanban");
  assert.ok(host.surfaces.get("kanban").Component);
  assert.equal(host.panels.get("kanban")?.context, "workspace");
  assert.equal(
    host.panels.get("kanban").title,
    host.sidebars.get("kanban").title,
  );
  assert.equal(host.panels.get("kanban").icon, "PanelsTopLeft");
  host.cleanup();
  assert.equal(host.sidebars.size, 0);
  assert.equal(host.panels.size, 0);
  assert.equal(host.surfaces.size, 0);
});

async function mount(t, host, workspaceId) {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(host.open(workspaceId));
  });
  t.after(async () => {
    await act(async () => renderer.unmount());
    host.cleanup();
  });
  return renderer;
}

test("各入口筛选独立，重渲染保留手动选择，关闭重开恢复默认项目", async (t) => {
  const host = createHost();
  const a = await mount(t, host, "workspace-a");
  const b = await mount(t, host, "workspace-b");
  const sidebar = await mount(t, host);
  assert.deepEqual(visibleTasks(a.root), ["Task A"]);
  assert.deepEqual(visibleTasks(b.root), ["Task B"]);
  await press(a.root, "Project B");
  await press(b.root, "No Project");
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
});

test("缺失工作区上下文时静默展示全部，迟到的上下文不切换筛选，重开才应用", async (t) => {
  const host = createHost({ workspaces: {} });
  const panel = await mount(t, host, "workspace-a");
  assert.deepEqual(visibleTasks(panel.root), [
    "Task A",
    "Task B",
    "Task unassigned",
  ]);
  assert.equal(
    panel.root
      .findAllByType("Text")
      .some((node) => /unavailable|restricted|error/i.test(text(node))),
    false,
  );
  await act(async () =>
    host.updateWorkspace("workspace-a", { projectId: "project-a" }),
  );
  assert.deepEqual(visibleTasks(panel.root), [
    "Task A",
    "Task B",
    "Task unassigned",
  ]);
  await press(panel.root, "Project B");
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

test("项目名称读取失败仍按已知 ID 筛选，默认项目可通过 ID 重新选中", async (t) => {
  const host = createHost({ projectsAvailable: false });
  const panel = await mount(t, host, "workspace-a");
  assert.deepEqual(visibleTasks(panel.root), ["Task A"]);
  await press(panel.root, "All");
  await press(panel.root, "project-a");
  assert.deepEqual(visibleTasks(panel.root), ["Task A"]);
});

async function createTask(root, title) {
  await press(root, "+ New Task");
  const modal = root.findByType("Modal");
  await act(async () =>
    modal
      .findByProps({ placeholder: "Enter task title" })
      .props.onChangeText(title),
  );
  await press(modal, "Create");
}

test("工作区内新建任务跟随手动项目筛选，共享更新同步到其他入口", async (t) => {
  const host = createHost();
  const panel = await mount(t, host, "workspace-a");
  const peer = await mount(t, host, "workspace-b");
  const sidebar = await mount(t, host);
  await press(panel.root, "Project B");
  await createTask(panel.root, "Task new-B");
  assert.ok(visibleTasks(peer.root).includes("Task new-B"));
  assert.ok(visibleTasks(sidebar.root).includes("Task new-B"));
  await press(panel.root, "Project A");
  assert.deepEqual(visibleTasks(panel.root), ["Task A"]);
});

for (const filter of ["All", "No Project"]) {
  test(`筛选 ${filter} 时新任务默认不关联工作区所属项目`, async (t) => {
    const host = createHost();
    const panel = await mount(t, host, "workspace-a");
    await press(panel.root, filter);
    await createTask(panel.root, "Task new-unassigned");
    await press(panel.root, "No Project");
    assert.ok(visibleTasks(panel.root).includes("Task new-unassigned"));
    await press(panel.root, "Project A");
    assert.deepEqual(visibleTasks(panel.root), ["Task A"]);
  });
}
