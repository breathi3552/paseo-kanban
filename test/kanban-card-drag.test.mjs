import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { KanbanDragController } from "../client/kanban-drag.ts";

// Exercise the real TSX lifecycle without a native host. Layout events are explicit;
// unchanged layouts, just like React Native, are not re-emitted on every render.
const require = createRequire(import.meta.url);
function componentRenderer(file = "kanban-card", component = "KanbanCard", modules = {}) {
  const hooks = [];
  let cursor = 0;
  let effects = [];
  const react = {
    useRef(value) {
      const index = cursor++;
      return hooks[index] ??= { current: value };
    },
    useMemo(fn) { return fn(); },
    useState(value) { return [value, () => {}]; },
    Fragment: require("react").Fragment,
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = hooks[index];
      if (!deps || !previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        effects.push(() => {
          previous?.cleanup?.();
          hooks[index] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const native = {
    View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView",
    StyleSheet: { create: (styles) => styles },
    PanResponder: { create: (handlers) => ({ panHandlers: handlers }) },
  };
  const source = ts.transpileModule(readFileSync(new URL(`../client/${file}.tsx`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function("require", "exports", source)((id) => {
    if (id in modules) return modules[id];
    if (id === "react") return react;
    if (id === "react-native") return native;
    if (id === "@getpaseo/plugin/client/react-native") return { Icon: "Icon" };
    return require(id);
  }, exports);
  return {
    render(props) {
      cursor = 0;
      effects = [];
      const tree = exports[component](props);
      effects.forEach((effect) => effect());
      return tree;
    },
    unmount() { hooks.forEach((hook) => hook.cleanup?.()); },
  };
}

test("card rerenders must retain geometry: slot follows pointer and release matches slot", async () => {
  const requests = [];
  const controller = new KanbanDragController({
    lanes: ["lane"],
    onReorderTask: (...args) => requests.push(args),
  });
  controller.registerContainerBounds({ x: 0, y: 0, width: 300, height: 600 });
  controller.registerLaneLayout("lane", { x: 0, y: 0, width: 300, height: 600 });
  controller.setLaneCardOrder("lane", ["1", "2", "3"]);
  const cards = ["1", "2", "3"].map((id) => ({ id, renderer: componentRenderer() }));
  let cleanups = 0;
  function renderCards() {
    return cards.map(({ id, renderer }) => renderer.render({
      task: { id, laneId: "lane", title: id, subtasks: [] },
      projectDisplayName: null, theme: { colors: {} }, layout: { compact: false },
      isDraggingThis: controller.isTaskDragging(id), isDragLocked: controller.isDragLocked,
      onPress() {}, onDragStart: controller.startGesture, onDragMove: controller.moveGesture,
      onDragRelease: controller.releaseGesture, onDragCancel: controller.cancelGesture,
      onLayoutCard: (taskId, rect) => controller.registerCardLayout("lane", taskId, rect),
      onUnmountCard: (taskId) => {
        cleanups++;
        controller.unregisterCardLayout("lane", taskId);
      },
    }));
  }
  renderCards().forEach((tree, index) => tree.props.onLayout({
    nativeEvent: { layout: { x: 0, y: index * 80, width: 280, height: 64 } },
  }));
  renderCards();
  assert.equal(cleanups, 0, "a changed callback is not an unmount");
  controller.startGesture("1", "lane", 100, 20);
  const draggingTree = renderCards()[0]; // Feedback rerender; no layout change for the other cards.
  assert.equal(draggingTree.props.style.position, "absolute", "source must not consume a second slot");
  assert.equal(draggingTree.props.style.opacity, 0, "only the floating preview is visible");
  controller.moveGesture(100, 20);
  assert.equal(controller.getFeedback().targetIndex, 0, "lifting the first card must keep the first slot");
  controller.moveGesture(100, 150);
  assert.equal(controller.getFeedback().targetIndex, 1, "pointer between 2 and 3 must select the middle slot");
  controller.moveGesture(100, 300);
  assert.equal(controller.getFeedback().targetIndex, 2, "pointer below 3 must select the last slot");
  controller.moveGesture(100, 20);
  await controller.releaseGesture(100, 20);
  assert.deepEqual(requests, [["1", "lane", 0]], "release must use the same slot as the preview");
  assert.equal(renderCards()[0].props.style, undefined, "release restores the source card");
  cards.forEach(({ renderer }) => renderer.unmount());
  assert.equal(cleanups, 3, "real unmounts still unregister geometry");
});

test("board renders the slot against the remaining cards, not the dragged card", () => {
  const board = { lanes: [{ id: "lane", title: "Lane" }], tasks: ["1", "2", "3"].map((id) => ({
    id, laneId: "lane", title: id, subtasks: [], projectId: null,
  })) };
  const drag = {
    feedback: { isDragging: true, draggingTaskId: "1", targetIndex: 0, draggedCardHeight: 96 },
    isLaneHovered: () => true, isTaskDragging: (id) => id === "1", setLaneCardOrder() {},
  };
  const renderer = componentRenderer("kanban-board", "KanbanBoardView", {
    "@getpaseo/plugin/client": { useSettings: () => ({ status: "ready", values: board }) },
    "../shared/kanban": {},
    "./use-projects": { useProjects: () => ({ projects: [] }), getProjectDisplayName: () => null },
    "./kanban-card": { KanbanCard: "Card", KanbanDropSpacer: "Slot", KanbanCardPreview: "Preview" },
    "./kanban-drag": { useKanbanDrag: () => drag },
    "./task-modal": {}, "./lane-modal": {}, "./kanban-session": {},
  });
  function collect(node, result = []) {
    if (Array.isArray(node)) node.forEach((child) => collect(child, result));
    else if (node?.props) {
      if (node.type === "Slot") {
        result.push("slot");
        assert.equal(node.props.height, drag.feedback.draggedCardHeight, "slot must match the dragged card height");
      }
      if (node.type === "Card" && !node.props.isDraggingThis) result.push(node.props.task.id);
      collect(node.props.children, result);
    }
    return result;
  }
  for (const compact of [false, true]) {
    for (const draggedId of ["1", "2", "3"]) {
      drag.feedback.draggingTaskId = draggedId;
      drag.isTaskDragging = (id) => id === draggedId;
      for (const index of [0, 1, 2]) {
        drag.feedback.targetIndex = index;
        const expected = ["1", "2", "3"].filter((id) => id !== draggedId);
        expected.splice(index, 0, "slot");
        assert.deepEqual(collect(renderer.render({ theme: { colors: {} }, layout: { compact } })), expected);
      }
    }
  }
});
