import test from "node:test";
import assert from "node:assert/strict";
import { KanbanBoardSchema, updateTask } from "../shared/kanban.ts";

test("公开任务修改合同拒绝导入任务改绑项目", () => {
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
});
