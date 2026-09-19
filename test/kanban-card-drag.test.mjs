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
    useSyncExternalStore(subscribe, getSnapshot) { return getSnapshot(); },
    memo(fn) { return fn; },
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
  function resolveModule(id) {
    if (id in modules) return modules[id];
    if (id === "react") return react;
    if (id === "react-native") return native;
    if (id === "@getpaseo/plugin/client/react-native") return { Icon: "Icon" };
    if (id.startsWith("./")) {
      const subFile = id.slice(2);
      try {
        const subSource = ts.transpileModule(readFileSync(new URL(`../client/${subFile}.tsx`, import.meta.url), "utf8"), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
        }).outputText;
        const subExports = {};
        new Function("require", "exports", subSource)(resolveModule, subExports);
        return subExports;
      } catch {
        // Fall back to require
      }
    }
    return require(id);
  }
  new Function("require", "exports", source)(resolveModule, exports);
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
      projectDisplayName: null,
      theme: { colors: {} },
      layout: { compact: false },
      binding: {
        isDragging: controller.isTaskDragging(id),
        cardPanHandlers: {},
        handlePanHandlers: {},
        onLayout: (rect) => controller.registerCardLayout("lane", id, rect),
        onUnmount: () => {
          cleanups++;
          controller.unregisterCardLayout("lane", id);
        },
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
    isLaneHovered: () => true,
    isTaskDragging: (id) => id === "1",
    bindLane: (laneId) => ({
      isHovered: true,
      targetIndex: drag.feedback.targetIndex,
      isTaskDragging: (id) => drag.isTaskDragging(id),
      draggedCardHeight: drag.feedback.draggedCardHeight,
      registerLaneLayout: () => {},
      registerCardsViewport: () => {},
      handleLaneScroll: () => {},
      setDropSpacerY: () => {},
      setLaneCardOrder: () => {},
      bindCard: (taskId) => ({
        isDragging: drag.isTaskDragging(taskId),
        cardPanHandlers: {},
        handlePanHandlers: {},
        onLayout: () => {},
        onUnmount: () => {},
      }),
    }),
  };
  const renderer = componentRenderer("kanban-board", "KanbanBoardView", {
    "@getpaseo/plugin/client": { useSettings: () => ({ status: "ready", values: board }) },
    "../shared/kanban": { filterTasksByProject: (tasks) => tasks },
    "./use-projects": { useProjects: () => ({ projects: [] }), getProjectDisplayName: () => null },
    "./kanban-card": { KanbanCard: "Card", KanbanDropSpacer: "Slot", KanbanCardPreview: "Preview" },
    "./kanban-drag": { useKanbanDrag: () => drag },
    "./task-modal": {}, "./lane-modal": {}, "./kanban-session": {},
  });
  function collect(node, result = []) {
    if (Array.isArray(node)) node.forEach((child) => collect(child, result));
    else if (typeof node?.type === "function") {
      collect(node.type(node.props), result);
    } else if (node?.props) {
      if (node.type === "Slot") {
        result.push("slot");
        assert.equal(node.props.height, drag.feedback.draggedCardHeight, "slot must match the dragged card height");
      }
      if (node.type === "Card" && !node.props.binding?.isDragging) result.push(node.props.task.id);
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

test("long press grabs the card immediately, seamlessly continues dragging on move, and getDropSlotPosition targets the dashed slot", async () => {
  const controller = new KanbanDragController({ lanes: ["lane-a"] });
  controller.registerContainerBounds({ x: 10, y: 20, width: 300, height: 600 });
  controller.registerLaneLayout("lane-a", { x: 10, y: 20, width: 300, height: 600 });
  controller.registerCardsViewportLayout("lane-a", { x: 10, y: 40, width: 280, height: 500 });
  controller.setLaneCardOrder("lane-a", ["c1", "c2", "c3"]);
  controller.registerCardLayout("lane-a", "c1", { x: 0, y: 0, width: 280, height: 60 });
  controller.registerCardLayout("lane-a", "c2", { x: 0, y: 68, width: 280, height: 60 });
  controller.registerCardLayout("lane-a", "c3", { x: 0, y: 136, width: 280, height: 60 });

  let clicked = false;
  const nativePanResponder = {
    create: (handlers) => ({ panHandlers: handlers }),
  };
  const binding1 = controller.bindCard("lane-a", "card-1", () => { clicked = true; }, nativePanResponder);

  const renderer = componentRenderer();
  const tree = renderer.render({
    task: { id: "card-1", laneId: "lane-a", title: "Test", subtasks: [] },
    projectDisplayName: null,
    theme: { colors: {} },
    layout: { compact: false },
    binding: binding1,
  });

  // 1. Press down (grant gesture responder)
  tree.props.onPanResponderGrant({ nativeEvent: {} }, { x0: 120, y0: 240 });

  // 2. Wait 280ms to trigger long press grab
  await new Promise((resolve) => setTimeout(resolve, 280));

  assert.equal(controller.getFeedback().isDragging, true, "Long press must trigger dragging");
  assert.equal(controller.getFeedback().draggingTaskId, "card-1");

  // 3. User moves pointer AFTER grabbing: must seamlessly continue dragging without releasing!
  tree.props.onPanResponderMove({ nativeEvent: {} }, { dx: 10, dy: 20, moveX: 130, moveY: 260 });
  assert.equal(controller.getFeedback().pointerX, 130);
  assert.equal(controller.getFeedback().pointerY, 260);

  // 4. Release gesture: must trigger release at current coordinates
  await tree.props.onPanResponderRelease({ nativeEvent: {} }, { moveX: 130, moveY: 260 });
  assert.equal(controller.getFeedback().isDragging, false, "Release must finish dragging");
  assert.equal(clicked, false, "Long press and drag must not trigger click onPress");

  // 5. Verify quick tap opens modal (< 260ms and < 5px)
  await new Promise((resolve) => setTimeout(resolve, 180));
  let clickCount = 0;
  const binding2 = controller.bindCard("lane-a", "card-2", () => { clickCount++; }, nativePanResponder);
  const clickTree = renderer.render({
    task: { id: "card-2", laneId: "lane-a", title: "Test 2", subtasks: [] },
    projectDisplayName: null,
    theme: { colors: {} },
    layout: { compact: false },
    binding: binding2,
  });
  clickTree.props.onPanResponderGrant({ nativeEvent: {} }, { x0: 50, y0: 50 });
  await clickTree.props.onPanResponderRelease({ nativeEvent: {} }, { moveX: 50, moveY: 50 });
  assert.equal(clickCount, 1, "Quick tap must open task details");

  // Verify getDropSlotPosition accurately locates the dashed box in the lane
  // Top slot (index 0)
  const slot0 = controller.getDropSlotPosition("lane-a", 0);
  assert.deepEqual(slot0, { x: 20, y: 60 }, "Slot 0 should be at top of cards list");

  // Middle slot (index 1)
  const slot1 = controller.getDropSlotPosition("lane-a", 1);
  assert.deepEqual(slot1, { x: 20, y: 128 }, "Slot 1 should match card 2 top");

  // Bottom slot (index 3)
  const slot3 = controller.getDropSlotPosition("lane-a", 3);
  assert.deepEqual(slot3, { x: 20, y: 264 }, "Slot 3 should follow card 3 bottom with gap");

  renderer.unmount();
});
