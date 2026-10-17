import test from "node:test";
import assert from "node:assert/strict";
import { KanbanBoardSchema, updateTask } from "../shared/kanban.ts";
import { openTaskSession } from "../client/kanban-session.ts";

test("公开任务修改合同拒绝导入任务改绑项目，正常编辑保留三个来源属性", async () => {
  const board = KanbanBoardSchema.parse({
    tasks: [
      {
        id: "imported",
        title: "Issue",
        laneId: "to-plan",
        projectId: "p1",
        source: "github_issue",
        issueNumber: 42,
        externalUrl: "https://github.com/example/repo/issues/42",
      },
    ],
  });
  assert.throws(
    () => updateTask(board, "imported", { projectId: "p2" }),
    /project/i,
  );
  const edited = updateTask(board, "imported", {
    title: "Edited",
    laneId: "in-progress",
  });
  assert.equal(edited.tasks[0].issueNumber, 42);
  let saved;
  const session = openTaskSession({
    mode: "edit",
    baseBoard: board,
    baseRevision: "r1",
    taskId: "imported",
    save: async (next) => {
      saved = next;
      return true;
    },
  });
  session.setProjectId("p2");
  assert.equal(session.getSnapshot().projectId, "p1");
  const rejected = await session.save({
    title: "Renamed",
    projectId: "p2",
    laneId: "to-plan",
  });
  assert.equal(rejected.success, false);
  assert.equal(saved, undefined);
});
