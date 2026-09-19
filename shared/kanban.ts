import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const DEFAULT_LANES = [
  { id: "to-plan", title: "待规划" },
  { id: "in-progress", title: "执行中" },
  { id: "done", title: "已完成" },
] as const;

export const SubtaskSchema = z.object({
  id: z.string().trim().min(1, "Subtask ID cannot be empty"),
  title: z.string().trim().min(1, "Subtask title cannot be empty"),
  completed: z.boolean().default(false),
});

export const TaskSchema = z.object({
  id: z.string().trim().min(1, "Task ID cannot be empty"),
  title: z.string().trim().min(1, "Task title cannot be empty"),
  description: z.string().default(""),
  laneId: z.string().trim().min(1, "Task lane ID cannot be empty"),
  projectId: z.string().trim().min(1).nullable().default(null),
  subtasks: z.array(SubtaskSchema).default([]),
});

export const LaneSchema = z.object({
  id: z.string().trim().min(1, "Lane ID cannot be empty"),
  title: z.string().trim().min(1, "Lane title cannot be empty"),
});

export const KanbanBoardSchema = z
  .object({
    lanes: z
      .array(LaneSchema)
      .min(1, "Kanban board must have at least one lane")
      .default([...DEFAULT_LANES]),
    tasks: z.array(TaskSchema).default([]),
  })
  .superRefine((board, ctx) => {
    const laneIds = new Set<string>();
    for (let i = 0; i < board.lanes.length; i++) {
      const lane = board.lanes[i];
      if (laneIds.has(lane.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate lane ID: "${lane.id}"`,
          path: ["lanes", i, "id"],
        });
      }
      laneIds.add(lane.id);
    }

    const taskIds = new Set<string>();
    for (let i = 0; i < board.tasks.length; i++) {
      const task = board.tasks[i];
      if (taskIds.has(task.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate task ID: "${task.id}"`,
          path: ["tasks", i, "id"],
        });
      }
      taskIds.add(task.id);

      if (!laneIds.has(task.laneId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Task "${task.id}" references non-existent lane "${task.laneId}"`,
          path: ["tasks", i, "laneId"],
        });
      }

      const subtaskIds = new Set<string>();
      for (let j = 0; j < task.subtasks.length; j++) {
        const subtask = task.subtasks[j];
        if (subtaskIds.has(subtask.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate subtask ID "${subtask.id}" in task "${task.id}"`,
            path: ["tasks", i, "subtasks", j, "id"],
          });
        }
        subtaskIds.add(subtask.id);
      }
    }
  });

export type KanbanSubtask = z.infer<typeof SubtaskSchema>;
export type KanbanTask = z.infer<typeof TaskSchema>;
export type KanbanLane = z.infer<typeof LaneSchema>;
export type KanbanBoard = z.infer<typeof KanbanBoardSchema>;

export type ProjectFilter =
  | { type: "all" }
  | { type: "unassigned" }
  | { type: "project"; projectId: string };

export function isTaskMatchingFilter(
  task: KanbanTask,
  filter?: ProjectFilter | string | null,
): boolean {
  if (!filter) return true;
  if (typeof filter === "string") {
    if (filter === "all") return true;
    if (filter === "unassigned") return task.projectId === null;
    return task.projectId === filter;
  }
  if (filter.type === "all") return true;
  if (filter.type === "unassigned") return task.projectId === null;
  return task.projectId === filter.projectId;
}

export function filterTasksByProject(
  tasks: KanbanTask[],
  filter?: ProjectFilter | string | null,
): KanbanTask[] {
  if (
    !filter ||
    filter === "all" ||
    (typeof filter === "object" && filter.type === "all")
  ) {
    return tasks;
  }
  return tasks.filter((t) => isTaskMatchingFilter(t, filter));
}

export const kanbanSettings = defineSettings({
  id: "kanban",
  scope: "host",
  version: 1,
  schema: KanbanBoardSchema,
});

// ---------------------------------------------------------------------------
// Pure State Transition Functions
// ---------------------------------------------------------------------------

export function addLane(
  board: KanbanBoard,
  lane: { id: string; title: string },
): KanbanBoard {
  const trimmedId = lane.id.trim();
  const trimmedTitle = lane.title.trim();
  if (!trimmedId) {
    throw new Error("Lane ID cannot be empty");
  }
  if (!trimmedTitle) {
    throw new Error("Lane title cannot be empty");
  }
  if (board.lanes.some((l) => l.id === trimmedId)) {
    throw new Error(`Lane with ID "${trimmedId}" already exists`);
  }

  const nextLanes = [...board.lanes, { id: trimmedId, title: trimmedTitle }];
  return KanbanBoardSchema.parse({
    lanes: nextLanes,
    tasks: board.tasks,
  });
}

export function updateLane(
  board: KanbanBoard,
  laneId: string,
  patch: { title: string },
): KanbanBoard {
  const trimmedTitle = patch.title.trim();
  if (!trimmedTitle) {
    throw new Error("Lane title cannot be empty");
  }

  let found = false;
  const nextLanes = board.lanes.map((lane) => {
    if (lane.id === laneId) {
      found = true;
      return { ...lane, title: trimmedTitle };
    }
    return lane;
  });

  if (!found) {
    throw new Error(`Lane "${laneId}" not found`);
  }

  return KanbanBoardSchema.parse({
    lanes: nextLanes,
    tasks: board.tasks,
  });
}

export function deleteLane(board: KanbanBoard, laneId: string): KanbanBoard {
  const laneIndex = board.lanes.findIndex((l) => l.id === laneId);
  if (laneIndex === -1) {
    throw new Error(`Lane "${laneId}" not found`);
  }

  if (board.lanes.length <= 1) {
    throw new Error("Cannot delete the last remaining lane");
  }

  const hasTasks = board.tasks.some((t) => t.laneId === laneId);
  if (hasTasks) {
    throw new Error(
      `Cannot delete lane "${laneId}" because it contains tasks. Move or delete tasks first.`,
    );
  }

  const nextLanes = board.lanes.filter((l) => l.id !== laneId);
  return KanbanBoardSchema.parse({
    lanes: nextLanes,
    tasks: board.tasks,
  });
}

export function addTask(
  board: KanbanBoard,
  task: {
    id: string;
    title: string;
    description?: string;
    laneId: string;
    projectId?: string | null;
    subtasks?: Array<{ id: string; title: string; completed?: boolean }>;
  },
): KanbanBoard {
  const trimmedId = task.id.trim();
  const trimmedTitle = task.title.trim();
  if (!trimmedId) {
    throw new Error("Task ID cannot be empty");
  }
  if (!trimmedTitle) {
    throw new Error("Task title cannot be empty");
  }
  if (board.tasks.some((t) => t.id === trimmedId)) {
    throw new Error(`Task with ID "${trimmedId}" already exists`);
  }
  if (!board.lanes.some((l) => l.id === task.laneId)) {
    throw new Error(`Lane "${task.laneId}" does not exist`);
  }

  const newTask: KanbanTask = {
    id: trimmedId,
    title: trimmedTitle,
    description: task.description ?? "",
    laneId: task.laneId,
    projectId: task.projectId ?? null,
    subtasks: (task.subtasks ?? []).map((s) => ({
      id: s.id.trim(),
      title: s.title.trim(),
      completed: s.completed ?? false,
    })),
  };

  return KanbanBoardSchema.parse({
    lanes: board.lanes,
    tasks: [...board.tasks, newTask],
  });
}

export function updateTask(
  board: KanbanBoard,
  taskId: string,
  patch: {
    title?: string;
    description?: string;
    laneId?: string;
    projectId?: string | null;
    subtasks?: KanbanSubtask[];
  },
): KanbanBoard {
  let found = false;
  if (patch.title !== undefined && !patch.title.trim()) {
    throw new Error("Task title cannot be empty");
  }
  if (
    patch.laneId !== undefined &&
    !board.lanes.some((l) => l.id === patch.laneId)
  ) {
    throw new Error(`Target lane "${patch.laneId}" does not exist`);
  }

  const nextTasks = board.tasks.map((task) => {
    if (task.id === taskId) {
      found = true;
      return {
        ...task,
        title: patch.title !== undefined ? patch.title.trim() : task.title,
        description:
          patch.description !== undefined
            ? patch.description
            : task.description,
        laneId: patch.laneId !== undefined ? patch.laneId : task.laneId,
        projectId:
          patch.projectId !== undefined ? patch.projectId : task.projectId,
        subtasks: patch.subtasks !== undefined ? patch.subtasks : task.subtasks,
      };
    }
    return task;
  });

  if (!found) {
    throw new Error(`Task "${taskId}" not found`);
  }

  return KanbanBoardSchema.parse({
    lanes: board.lanes,
    tasks: nextTasks,
  });
}

export function deleteTask(board: KanbanBoard, taskId: string): KanbanBoard {
  const nextTasks = board.tasks.filter((t) => t.id !== taskId);
  if (nextTasks.length === board.tasks.length) {
    throw new Error(`Task "${taskId}" not found`);
  }

  return KanbanBoardSchema.parse({
    lanes: board.lanes,
    tasks: nextTasks,
  });
}

export function reorderTask(
  board: KanbanBoard,
  taskId: string,
  targetLaneId: string,
  targetIndex?: number,
  visibleTaskIdsOrFilter?: string[] | ProjectFilter | string,
): KanbanBoard {
  const taskToMove = board.tasks.find((t) => t.id === taskId);
  if (!taskToMove) {
    throw new Error(`Task with ID "${taskId}" not found`);
  }
  if (!board.lanes.some((l) => l.id === targetLaneId)) {
    throw new Error(`Target lane "${targetLaneId}" does not exist`);
  }

  if (targetIndex !== undefined) {
    if (
      typeof targetIndex !== "number" ||
      !Number.isFinite(targetIndex) ||
      !Number.isInteger(targetIndex)
    ) {
      throw new Error("Target index must be a finite integer");
    }
  }

  const isSameLane = taskToMove.laneId === targetLaneId;
  const remainingTasks = board.tasks.filter((t) => t.id !== taskId);
  const targetLaneTasks = remainingTasks.filter(
    (t) => t.laneId === targetLaneId,
  );

  // Determine visibility predicate
  let isTaskVisible: (t: KanbanTask) => boolean;
  let isFilterActive = false;

  if (Array.isArray(visibleTaskIdsOrFilter)) {
    const idSet = new Set(visibleTaskIdsOrFilter);
    isTaskVisible = (t: KanbanTask) => idSet.has(t.id);
    isFilterActive = true;
  } else if (visibleTaskIdsOrFilter) {
    isTaskVisible = (t: KanbanTask) =>
      isTaskMatchingFilter(t, visibleTaskIdsOrFilter);
    isFilterActive =
      typeof visibleTaskIdsOrFilter === "string"
        ? visibleTaskIdsOrFilter !== "all"
        : visibleTaskIdsOrFilter.type !== "all";
  } else {
    isTaskVisible = () => true;
    isFilterActive = false;
  }

  // Check same-lane self-only visible no-op rule:
  // "同泳道只有被拖任务可见时，唯一可见槽位代表原位，不为了无可见锚点而改变该任务与隐藏任务的位置。明确原位操作不产生无意义写入。"
  if (isSameLane && isFilterActive) {
    const visibleTargetTasks = targetLaneTasks.filter(isTaskVisible);
    if (visibleTargetTasks.length === 0) {
      return board;
    }
  }

  const updatedTask: KanbanTask = {
    ...taskToMove,
    laneId: targetLaneId,
  };

  let insertionGlobalIndex: number;

  if (targetLaneTasks.length === 0) {
    const targetLaneIdx = board.lanes.findIndex((l) => l.id === targetLaneId);
    let insertAfterTask: KanbanTask | undefined;
    for (let i = targetLaneIdx - 1; i >= 0; i--) {
      const prevLaneId = board.lanes[i].id;
      const prevLaneTasks = remainingTasks.filter(
        (t) => t.laneId === prevLaneId,
      );
      if (prevLaneTasks.length > 0) {
        insertAfterTask = prevLaneTasks[prevLaneTasks.length - 1];
        break;
      }
    }
    if (insertAfterTask) {
      insertionGlobalIndex = remainingTasks.indexOf(insertAfterTask) + 1;
    } else {
      let insertBeforeTask: KanbanTask | undefined;
      for (let i = targetLaneIdx + 1; i < board.lanes.length; i++) {
        const nextLaneId = board.lanes[i].id;
        const nextLaneTasks = remainingTasks.filter(
          (t) => t.laneId === nextLaneId,
        );
        if (nextLaneTasks.length > 0) {
          insertBeforeTask = nextLaneTasks[0];
          break;
        }
      }
      if (insertBeforeTask) {
        insertionGlobalIndex = remainingTasks.indexOf(insertBeforeTask);
      } else {
        insertionGlobalIndex = remainingTasks.length;
      }
    }
  } else {
    let referenceTask: KanbanTask;
    let insertBefore = true;

    if (isFilterActive) {
      const visibleTargetTasks = targetLaneTasks.filter(isTaskVisible);
      if (visibleTargetTasks.length === 0) {
        // Cross-lane move to a lane with hidden tasks but NO visible tasks:
        // Append to the end of target lane's existing tasks!
        referenceTask = targetLaneTasks[targetLaneTasks.length - 1];
        insertBefore = false;
      } else {
        const clampedVisibleIdx = Math.max(
          0,
          Math.min(
            targetIndex ?? visibleTargetTasks.length,
            visibleTargetTasks.length,
          ),
        );
        if (clampedVisibleIdx >= visibleTargetTasks.length) {
          referenceTask = visibleTargetTasks[visibleTargetTasks.length - 1];
          insertBefore = false;
        } else {
          referenceTask = visibleTargetTasks[clampedVisibleIdx];
          insertBefore = true;
        }
      }
    } else {
      const clampedLaneIdx = Math.max(
        0,
        Math.min(targetIndex ?? targetLaneTasks.length, targetLaneTasks.length),
      );
      if (clampedLaneIdx >= targetLaneTasks.length) {
        referenceTask = targetLaneTasks[targetLaneTasks.length - 1];
        insertBefore = false;
      } else {
        referenceTask = targetLaneTasks[clampedLaneIdx];
        insertBefore = true;
      }
    }

    const refGlobalIdx = remainingTasks.indexOf(referenceTask);
    insertionGlobalIndex = insertBefore ? refGlobalIdx : refGlobalIdx + 1;
  }

  const nextTasks = [
    ...remainingTasks.slice(0, insertionGlobalIndex),
    updatedTask,
    ...remainingTasks.slice(insertionGlobalIndex),
  ];

  if (
    nextTasks.length === board.tasks.length &&
    nextTasks.every(
      (t, idx) =>
        t.id === board.tasks[idx].id && t.laneId === board.tasks[idx].laneId,
    )
  ) {
    return board;
  }

  return KanbanBoardSchema.parse({
    lanes: board.lanes,
    tasks: nextTasks,
  });
}
