import { KanbanBoardSchema } from "../../shared/kanban.ts";

export const completionLanes = [
  { id: "todo", title: "Todo", isCompletionLane: false },
  { id: "review", title: "Review", isCompletionLane: false },
  { id: "done", title: "Finished", isCompletionLane: true },
];

export function task(id, laneId = "todo", patch = {}) {
  return {
    id,
    title: `Task ${id}`,
    description: "",
    laneId,
    projectId: null,
    subtasks: [],
    completed: false,
    completedAt: null,
    ...patch,
  };
}

export function board(tasks = [], lanes = completionLanes) {
  return KanbanBoardSchema.parse({ lanes, tasks });
}
