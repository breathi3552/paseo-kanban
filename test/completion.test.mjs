import test from "node:test";
import assert from "node:assert/strict";
import * as kanban from "../shared/kanban.ts";
import * as sessions from "../client/kanban-session.ts";
import { KanbanDragController } from "../client/kanban-drag.ts";
import {
  board,
  task,
  completionLanes,
} from "./helpers/completion-fixtures.mjs";

const ids = (tasks) => tasks.map((t) => t.id);
const find = (b, id) => b.tasks.find((t) => t.id === id);

test("completion: initialization, add and rename retain exactly one rightmost completion lane", () => {
  const initial = kanban.KanbanBoardSchema.parse({});
  assert.deepEqual(
    initial.lanes.map((l) => l.isCompletionLane),
    [false, false, true],
  );
  const added = kanban.addLane(initial, {
    id: "qa",
    title: "QA",
    isCompletionLane: true,
  });
  assert.deepEqual(
    added.lanes.map((l) => l.id),
    ["to-plan", "in-progress", "qa", "done"],
  );
  assert.equal(added.lanes.filter((l) => l.isCompletionLane).length, 1);
  const renamed = kanban.updateLane(added, "done", {
    title: "Shipped",
    isCompletionLane: false,
  });
  assert.equal(renamed.lanes.at(-1).title, "Shipped");
  assert.equal(renamed.lanes.at(-1).isCompletionLane, true);
  assert.equal(initial.lanes.at(-1).title, "已完成");
});

for (const [name, lanes] of [
  [
    "missing completion role",
    completionLanes.map((l) => ({ ...l, isCompletionLane: false })),
  ],
  [
    "duplicate completion role",
    completionLanes.map((l) => ({ ...l, isCompletionLane: l.id !== "todo" })),
  ],
  ["completion role not rightmost", [completionLanes[2], completionLanes[0]]],
  ["no ordinary lane", [completionLanes[2]]],
]) {
  test(`completion: schema rejects ${name}`, () => {
    assert.equal(
      kanban.KanbanBoardSchema.safeParse({ lanes, tasks: [] }).success,
      false,
    );
  });
}

test("completion: schema permits deleted ordinary references only for completed tasks", () => {
  const restored = board([task("legacy", "deleted", { completed: true })]);
  assert.equal(restored.tasks[0].laneId, "deleted");
  assert.throws(
    () => board([task("active", "deleted")]),
    /references non-existent lane/,
  );
  for (const completed of [false, true]) {
    assert.equal(
      kanban.KanbanBoardSchema.safeParse({
        lanes: completionLanes,
        tasks: [task("bad", "done", { completed })],
      }).success,
      false,
    );
  }
});

test("completion: schema rejects invalid status and completion timestamps", () => {
  for (const patch of [
    { completed: "yes" },
    { completed: true, completedAt: -1 },
    { completed: true, completedAt: 1.5 },
    { completed: true, completedAt: "yesterday" },
    { completed: false, completedAt: 1000 },
  ]) {
    assert.equal(
      kanban.KanbanBoardSchema.safeParse({
        lanes: completionLanes,
        tasks: [task("bad", "todo", patch)],
      }).success,
      false,
    );
  }
});

test("completion: lane deletion protects completion, last ordinary and active tasks, but allows completed references", () => {
  const initial = board([
    task("finished", "review", { completed: true, completedAt: 1000 }),
  ]);
  assert.throws(() => kanban.deleteLane(initial, "done"), /completion lane/i);
  const removed = kanban.deleteLane(initial, "review");
  assert.equal(find(removed, "finished").laneId, "review");
  assert.deepEqual(
    removed.lanes.map((l) => l.id),
    ["todo", "done"],
  );
  assert.throws(
    () => kanban.deleteLane(removed, "todo"),
    /last.*ordinary lane/i,
  );
  assert.throws(
    () => kanban.deleteLane(board([task("active", "review")]), "review"),
    /contains tasks/,
  );
});

test("completion: direct creation and detail assignment to completion lane are rejected", () => {
  const initial = board([task("a")]);
  assert.throws(
    () => kanban.addTask(initial, { id: "b", title: "Task b", laneId: "done" }),
    /completion lane/i,
  );
  assert.throws(
    () => kanban.updateTask(initial, "a", { laneId: "done" }),
    /completion lane/i,
  );
});

test("completion: completing preserves ownership, data and array order; repeated completion does not refresh time", () => {
  const original = task("a", "todo", {
    description: "Keep",
    projectId: "project-a",
    subtasks: [{ id: "s", title: "Open", completed: false }],
  });
  const initial = board([original, task("b")]);
  const completed = kanban.setTaskCompleted(initial, "a", true, 1000);
  assert.deepEqual(find(completed, "a"), {
    ...original,
    completed: true,
    completedAt: 1000,
  });
  assert.deepEqual(ids(completed.tasks), ["a", "b"]);
  assert.equal(kanban.setTaskCompleted(completed, "a", true, 5000), completed);
  assert.equal(find(initial, "a").completed, false);
  assert.equal(kanban.setTaskCompleted(initial, "a", false, 5000), initial);
  assert.throws(
    () => kanban.setTaskCompleted(initial, "missing", true, 1000),
    /not found/,
  );
});

test("completion: checkbox reopen appends to owner and recompletion uses the new time", () => {
  const initial = board([
    task("a", "todo", { completed: true, completedAt: 1000 }),
    task("b"),
    task("c", "review"),
  ]);
  const reopened = kanban.setTaskCompleted(initial, "a", false, 2000);
  assert.deepEqual(ids(kanban.getLaneTasks(reopened, "todo")), ["b", "a"]);
  assert.equal(find(reopened, "a").completedAt, null);
  const again = kanban.setTaskCompleted(reopened, "a", true, 3000);
  assert.equal(find(again, "a").completedAt, 3000);
});

test("completion: missing owner reopens in current rightmost ordinary lane, even after inserting a new lane", () => {
  let initial = board([
    task("a", "removed", { completed: true }),
    task("b", "review"),
  ]);
  initial = kanban.addLane(initial, { id: "qa", title: "QA" });
  initial = kanban.addTask(initial, { id: "c", title: "Task c", laneId: "qa" });
  const restored = kanban.setTaskCompleted(initial, "a", false, 2000);
  assert.equal(find(restored, "a").laneId, "qa");
  assert.deepEqual(ids(kanban.getLaneTasks(restored, "qa")), ["c", "a"]);
});

test("completion: time projection is descending and stable for equal/unknown times, with project filtering", () => {
  const initial = board([
    task("active"),
    task("old", "todo", { completed: true, completedAt: 1000, projectId: "a" }),
    task("legacy1", "review", { completed: true }),
    task("latest", "review", {
      completed: true,
      completedAt: 2000,
      projectId: "a",
    }),
    task("tie", "todo", { completed: true, completedAt: 2000, projectId: "b" }),
    task("legacy2", "todo", { completed: true }),
  ]);
  assert.deepEqual(ids(kanban.getLaneTasks(initial, "done")), [
    "latest",
    "tie",
    "old",
    "legacy1",
    "legacy2",
  ]);
  assert.deepEqual(
    ids(
      kanban.getLaneTasks(initial, "done", { type: "project", projectId: "a" }),
    ),
    ["latest", "old"],
  );
  assert.deepEqual(ids(kanban.getLaneTasks(initial, "done", "unassigned")), [
    "legacy1",
    "legacy2",
  ]);
  assert.deepEqual(ids(kanban.getLaneTasks(initial, "todo")), ["active"]);
  assert.deepEqual(ids(initial.tasks), [
    "active",
    "old",
    "legacy1",
    "latest",
    "tie",
    "legacy2",
  ]);
});

test("completion: drag into completion preserves owner and ignores insertion index; internal reorder is unchanged", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 2500 });
  const initial = board([
    task("a"),
    task("previous", "review", { completed: true, completedAt: 1000 }),
  ]);
  const moved = kanban.reorderTask(initial, "a", "done", 99);
  assert.equal(find(moved, "a").laneId, "todo");
  assert.equal(find(moved, "a").completedAt, 2500);
  assert.deepEqual(ids(kanban.getLaneTasks(moved, "done")), ["a", "previous"]);
  t.mock.timers.setTime(3000);
  assert.equal(kanban.reorderTask(moved, "a", "done", 1), moved);
});

test("completion: drag out uses visible slots and ignores completed ordinary references as anchors", () => {
  const initial = board([
    task("a", "todo", { completed: true, completedAt: 1000, projectId: "p" }),
    task("hidden", "review", { projectId: "other" }),
    task("finished", "review", { completed: true, completedAt: 500 }),
    task("b", "review", { projectId: "p" }),
    task("c", "review", { projectId: "p" }),
  ]);
  const moved = kanban.reorderTask(initial, "a", "review", 1, "p");
  assert.deepEqual(ids(kanban.getLaneTasks(moved, "review")), [
    "hidden",
    "b",
    "a",
    "c",
  ]);
  assert.equal(find(moved, "a").completed, false);
  assert.equal(find(moved, "a").completedAt, null);
  assert.deepEqual(find(moved, "finished"), find(initial, "finished"));
  const backToOwner = kanban.reorderTask(initial, "a", "todo", 0, "p");
  assert.equal(
    find(backToOwner, "a").completed,
    false,
    "same stored owner still needs to reopen",
  );
});

test("completion: detail changes preserve status/time and permit unchanged deleted ownership", () => {
  const initial = board([
    task("a", "todo", { completed: true, completedAt: 1000 }),
  ]);
  const edited = kanban.updateTask(initial, "a", {
    title: "Edited",
    laneId: "review",
    subtasks: [{ id: "s", title: "Step", completed: true }],
  });
  assert.equal(find(edited, "a").completed, true);
  assert.equal(find(edited, "a").completedAt, 1000);
  assert.equal(find(edited, "a").laneId, "review");
  assert.equal(
    find(kanban.setTaskCompleted(edited, "a", false, 2000), "a").laneId,
    "review",
  );
  const orphan = board([
    task("o", "removed", { completed: true, completedAt: 1000 }),
  ]);
  assert.equal(
    find(
      kanban.updateTask(orphan, "o", { title: "Edited", laneId: "removed" }),
      "o",
    ).completedAt,
    1000,
  );
  assert.throws(
    () => kanban.updateTask(orphan, "o", { laneId: "another-missing" }),
    /does not exist/,
  );
});

test("completion: settings v2 migrates renamed done without loss and preserves unknown historical ordering", () => {
  assert.equal(kanban.kanbanSettings.version, 2);
  const legacy = {
    lanes: [
      { id: "todo", title: "Todo" },
      { id: "done", title: "Shipped" },
      { id: "review", title: "Review" },
    ],
    tasks: [
      task("old1", "done", {
        description: "Keep",
        projectId: "p",
        subtasks: [{ id: "s", title: "Step", completed: true }],
      }),
      task("active"),
      task("old2", "done"),
    ],
  };
  const migrated = kanban.kanbanSettings.migrate(legacy, 1);
  assert.deepEqual(
    migrated.lanes.map((l) => l.id),
    ["todo", "review", "done"],
  );
  assert.equal(migrated.lanes.at(-1).title, "Shipped");
  assert.deepEqual(find(migrated, "old1"), {
    ...legacy.tasks[0],
    laneId: "review",
    completed: true,
    completedAt: null,
  });
  assert.deepEqual(ids(kanban.getLaneTasks(migrated, "done")), [
    "old1",
    "old2",
  ]);
  assert.equal(find(migrated, "active").completed, false);
  assert.deepEqual(kanban.kanbanSettings.migrate(migrated, 2), migrated);
  const added = kanban.setTaskCompleted(migrated, "active", true, 1000);
  assert.deepEqual(ids(kanban.getLaneTasks(added, "done")), [
    "active",
    "old1",
    "old2",
  ]);
  assert.equal(legacy.lanes[1].title, "Shipped");
});

test("completion: migration creates missing system lane and an ordinary lane for done-only boards", () => {
  const missing = kanban.kanbanSettings.migrate(
    { lanes: [{ id: "todo", title: "Custom" }], tasks: [task("a")] },
    1,
  );
  assert.deepEqual(
    missing.lanes.map((l) => l.id),
    ["todo", "done"],
  );
  assert.equal(find(missing, "a").completed, false);
  const alone = kanban.kanbanSettings.migrate(
    { lanes: [{ id: "done", title: "Shipped" }], tasks: [task("old", "done")] },
    1,
  );
  assert.deepEqual(
    alone.lanes.map((l) => l.id),
    ["to-plan", "done"],
  );
  assert.equal(find(alone, "old").laneId, "to-plan");
  assert.equal(find(alone, "old").completed, true);
  assert.throws(() =>
    kanban.kanbanSettings.migrate(
      { lanes: [{ id: "todo", title: "Todo" }], tasks: [task("bad", "ghost")] },
      1,
    ),
  );
});

test("completion session: atomic completion uses caller revision and no-op avoids writes", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const initial = board([task("a")]);
  const writes = [];
  const result = await sessions.executeTaskCompletion({
    baseBoard: initial,
    baseRevision: "rev-1",
    taskId: "a",
    completed: true,
    save: async (next, revision) => {
      writes.push({ next, revision });
      return true;
    },
  });
  assert.equal(result.success, true);
  assert.equal(writes[0].revision, "rev-1");
  assert.deepEqual(find(writes[0].next, "a"), {
    ...task("a"),
    completed: true,
    completedAt: 1000,
  });
  const repeated = await sessions.executeTaskCompletion({
    baseBoard: writes[0].next,
    baseRevision: "rev-2",
    taskId: "a",
    completed: true,
    save: async () => {
      assert.fail("repeated completion must not save");
    },
  });
  assert.deepEqual(repeated, { success: true, unchanged: true });
});

test("completion session: conflict, exception and invalid task retain source data and return errors", async () => {
  for (const language of ["zh", "en"]) {
    for (const save of [
      async () => false,
      async () => {
        throw new Error("offline");
      },
    ]) {
      const initial = board([task("a")]);
      const result = await sessions.executeTaskCompletion({
        baseBoard: initial,
        baseRevision: "old",
        taskId: "a",
        completed: true,
        save,
        language,
      });
      assert.equal(result.success, false);
      assert.ok(result.error);
      assert.equal(find(initial, "a").completed, false);
      assert.equal(find(initial, "a").completedAt, null);
    }
  }
  const result = await sessions.executeTaskCompletion({
    baseBoard: board(),
    baseRevision: "r",
    taskId: "missing",
    completed: true,
    save: async () => assert.fail("invalid task must not save"),
  });
  assert.equal(result.success, false);
});

test("completion sessions: lane protections count active tasks and ordinary lanes", () => {
  const initial = board([
    task("a", "review", { completed: true, completedAt: 1000 }),
  ]);
  const open = (b, laneId) =>
    sessions.openLaneSession({
      mode: "edit",
      baseBoard: b,
      baseRevision: "r",
      laneId,
      save: async () => true,
    });
  assert.equal(open(initial, "done").canDelete, false);
  assert.equal(open(initial, "done").getSnapshot().isCompletionLane, true);
  assert.equal(open(initial, "review").canDelete, true);
  assert.equal(open(initial, "review").tasksInLaneCount, 0);
  assert.equal(
    open(kanban.deleteLane(initial, "review"), "todo").canDelete,
    false,
  );
});

test("completion sessions: detail options exclude completion lane and saving deleted ownership retains completion", async () => {
  const initial = board([
    task("a", "deleted", { completed: true, completedAt: 1000 }),
  ]);
  let saved;
  const session = sessions.openTaskSession({
    mode: "edit",
    baseBoard: initial,
    baseRevision: "r",
    taskId: "a",
    save: async (next) => {
      saved = next;
      return true;
    },
  });
  assert.deepEqual(
    session.getSnapshot().lanes.map((l) => l.id),
    ["todo", "review"],
  );
  session.setTitle("Edited");
  assert.equal((await session.save()).success, true);
  assert.equal(find(saved, "a").laneId, "deleted");
  assert.equal(find(saved, "a").completedAt, 1000);
  const moved = sessions.openTaskSession({
    mode: "edit",
    baseBoard: saved,
    baseRevision: "next",
    taskId: "a",
    save: async (next) => {
      saved = next;
      return true;
    },
  });
  moved.setLaneId("review");
  assert.equal((await moved.save()).success, true);
  assert.equal(find(saved, "a").completed, true);
  assert.equal(find(saved, "a").completedAt, 1000);
  assert.equal(find(saved, "a").laneId, "review");
});

test("completion sessions: internal completion reorder skips persistence and cross-lane drag saves conversion", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 2000 });
  let saved;
  const initial = board([
    task("a", "todo", { completed: true, completedAt: 1000 }),
    task("b", "review"),
  ]);
  const inside = await sessions.executeTaskReorder({
    baseBoard: initial,
    baseRevision: "r",
    taskId: "a",
    targetLaneId: "done",
    targetIndex: 0,
    save: async () => assert.fail("internal completion reorder must not save"),
  });
  assert.deepEqual(inside, { success: true, unchanged: true });
  const outside = await sessions.executeTaskReorder({
    baseBoard: initial,
    baseRevision: "r",
    taskId: "a",
    targetLaneId: "review",
    targetIndex: 0,
    save: async (next) => {
      saved = next;
      return true;
    },
  });
  assert.equal(outside.success, true);
  assert.deepEqual(ids(kanban.getLaneTasks(saved, "review")), ["a", "b"]);
  assert.equal(find(saved, "a").completed, false);
});

function dragController(t, requests) {
  const controller = new KanbanDragController({
    lanes: completionLanes,
    onReorderTask: (...args) => requests.push(args),
  });
  t.after(() => controller.teardown());
  controller.registerContainerBounds({ x: 0, y: 0, width: 940, height: 600 });
  for (const [index, lane] of completionLanes.entries()) {
    controller.registerLaneLayout(lane.id, {
      x: index * 320,
      y: 0,
      width: 300,
      height: 600,
    });
    controller.setLaneCardOrder(lane.id, [lane.id + "1", lane.id + "2"]);
    controller.registerCardLayout(lane.id, lane.id + "1", {
      x: 0,
      y: 0,
      width: 280,
      height: 60,
    });
    controller.registerCardLayout(lane.id, lane.id + "2", {
      x: 0,
      y: 100,
      width: 280,
      height: 60,
    });
  }
  return controller;
}

test("completion drag: internal completion lane has no valid hover or persisted drop", async (t) => {
  const requests = [];
  const controller = dragController(t, requests);
  controller.startGesture("done1", "done", 700, 20);
  controller.moveGesture(700, 200);
  assert.equal(controller.getFeedback().hoveredLaneId, null);
  const drop = await controller.beginDropAnimation({ x: 700, y: 200 });
  assert.equal(drop.isDrop, false);
  await controller.reportDropComplete(drop.operationId);
  assert.deepEqual(requests, []);
});

test("completion drag: drag in targets the top slot irrespective of pointer depth", async (t) => {
  const requests = [];
  const controller = dragController(t, requests);
  controller.startGesture("todo1", "todo", 50, 20);
  controller.moveGesture(700, 400);
  assert.equal(controller.getFeedback().targetIndex, 0);
  await controller.releaseGesture(700, 400);
  assert.deepEqual(requests, [["todo1", "done", 0]]);
});

test("completion drag: drag out targets an ordinary slot and cancelled animation never submits", async (t) => {
  const requests = [];
  const controller = dragController(t, requests);
  controller.startGesture("done1", "done", 700, 20);
  controller.moveGesture(400, 130);
  assert.equal(controller.getFeedback().targetIndex, 1);
  const cancelled = await controller.beginDropAnimation({ x: 400, y: 130 });
  controller.abortDrop(cancelled.operationId);
  assert.deepEqual(requests, []);
  controller.startGesture("done1", "done", 700, 20);
  await controller.releaseGesture(400, 130);
  assert.deepEqual(requests, [["done1", "review", 1]]);
});
