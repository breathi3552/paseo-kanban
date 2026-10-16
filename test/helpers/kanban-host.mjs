import assert from "node:assert/strict";
import {
  React,
  TestRenderer,
  act,
  loadClientModule,
  mockReactNative,
} from "./react-host-env.mjs";

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

export function text(node) {
  return node.children.filter((child) => typeof child === "string").join("");
}

export async function press(root, label) {
  const button = root
    .findAllByType("Pressable")
    .find((node) =>
      node.findAllByType("Text").some((child) => text(child) === label),
    );
  assert.ok(button, `button ${label} exists`);
  await act(async () => button.props.onPress({ stopPropagation() {} }));
}

export function createHost({
  projectsAvailable = true,
  board,
  rpc = async () => ({ repository: "example/repo", issues: [], totalCount: 0 }),
  compact = false,
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
    lanes: [
      { id: "todo", title: "Todo", isCompletionLane: false },
      { id: "done", title: "Finished", isCompletionLane: true },
    ],
    tasks: ["a", "b", null].map((project) => ({
      id: `task-${project ?? "unassigned"}`,
      title: `Task ${project?.toUpperCase() ?? "unassigned"}`,
      description: "",
      projectId: project && `project-${project}`,
      laneId: "todo",
      subtasks: [],
    })),
  };
  if (board) values = board;
  let failSave = false;
  let failReload = false;
  let pendingSave = null;
  const notifications = [];
  const externalUrls = [];
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
    useRpc: (contract) =>
      React.useCallback(
        async (input) =>
          contract.output.parse(await rpc(contract.input.parse(input))),
        [contract],
      ),
    openExternalUrl: async (url) => externalUrls.push(url),
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
        reload: async () => {
          settings = failReload
            ? { status: "error", error: "Settings read failed" }
            : { status: "ready", values, revision: String(revision) };
          failReload = false;
          settingsListeners.forEach((listener) => listener());
        },
        save: async (next, expectedRevision) => {
          if (pendingSave) await pendingSave;
          if (failSave) {
            failSave = false;
            return false;
          }
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
      useToast: () => ({
        show: (message) => notifications.push(message),
        error: (message) => notifications.push(message),
      }),
    },
    "@getpaseo/plugin/client/ui": {
      SettingsSelect: (props) => React.createElement("Select", props),
    },
  });
  const cleanup = contribute(client);
  return {
    surfaces,
    sidebars,
    panels,
    cleanup,
    get board() {
      return values;
    },
    notifications,
    externalUrls,
    failNextSave() {
      failSave = true;
    },
    failNextReload() {
      failReload = true;
    },
    holdSave(promise) {
      pendingSave = promise;
    },
    replaceBoard(next) {
      values = next;
      settings = { status: "ready", values, revision: String(++revision) };
      settingsListeners.forEach((listener) => listener());
    },
    open(workspaceId) {
      const Component = workspaceId
        ? panels.get("kanban").Component
        : surfaces.get("kanban").Component;
      return React.createElement(Component, {
        ...hostProps,
        layout: { ...hostProps.layout, compact },
        ...(workspaceId ? { context: "workspace", workspaceId } : {}),
      });
    },
    updateWorkspace(id, workspace) {
      workspaceSnapshot = { ...workspaceSnapshot, [id]: workspace };
      workspaceListeners.forEach((listener) => listener());
    },
  };
}

export async function mount(t, host, workspaceId) {
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
