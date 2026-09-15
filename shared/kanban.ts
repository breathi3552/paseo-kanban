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
    lanes: z.array(LaneSchema).default([...DEFAULT_LANES]),
    tasks: z.array(TaskSchema).default([]),
  })
  .superRefine((board, ctx) => {
    if (board.lanes.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Kanban board must have at least one lane",
        path: ["lanes"],
      });
    }

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
  lane: { id: string; title: string }
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
  patch: { title: string }
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
      `Cannot delete lane "${laneId}" because it contains tasks. Move or delete tasks first.`
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
  }
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
  }
): KanbanBoard {
  let found = false;
  if (patch.title !== undefined && !patch.title.trim()) {
    throw new Error("Task title cannot be empty");
  }
  if (patch.laneId !== undefined && !board.lanes.some((l) => l.id === patch.laneId)) {
    throw new Error(`Target lane "${patch.laneId}" does not exist`);
  }

  const nextTasks = board.tasks.map((task) => {
    if (task.id === taskId) {
      found = true;
      return {
        ...task,
        title: patch.title !== undefined ? patch.title.trim() : task.title,
        description: patch.description !== undefined ? patch.description : task.description,
        laneId: patch.laneId !== undefined ? patch.laneId : task.laneId,
        projectId: patch.projectId !== undefined ? patch.projectId : task.projectId,
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

export function moveTask(
  board: KanbanBoard,
  taskId: string,
  targetLaneId: string
): KanbanBoard {
  return updateTask(board, taskId, { laneId: targetLaneId });
}

export function addSubtask(
  board: KanbanBoard,
  taskId: string,
  subtask: { id: string; title: string; completed?: boolean }
): KanbanBoard {
  const trimmedSubtaskId = subtask.id.trim();
  const trimmedSubtaskTitle = subtask.title.trim();
  if (!trimmedSubtaskId) {
    throw new Error("Subtask ID cannot be empty");
  }
  if (!trimmedSubtaskTitle) {
    throw new Error("Subtask title cannot be empty");
  }

  let taskFound = false;
  const nextTasks = board.tasks.map((task) => {
    if (task.id === taskId) {
      taskFound = true;
      if (task.subtasks.some((s) => s.id === trimmedSubtaskId)) {
        throw new Error(
          `Subtask with ID "${trimmedSubtaskId}" already exists in task "${taskId}"`
        );
      }
      return {
        ...task,
        subtasks: [
          ...task.subtasks,
          {
            id: trimmedSubtaskId,
            title: trimmedSubtaskTitle,
            completed: subtask.completed ?? false,
          },
        ],
      };
    }
    return task;
  });

  if (!taskFound) {
    throw new Error(`Task "${taskId}" not found`);
  }

  return KanbanBoardSchema.parse({
    lanes: board.lanes,
    tasks: nextTasks,
  });
}

export function updateSubtask(
  board: KanbanBoard,
  taskId: string,
  subtaskId: string,
  patch: { title?: string; completed?: boolean }
): KanbanBoard {
  if (patch.title !== undefined && !patch.title.trim()) {
    throw new Error("Subtask title cannot be empty");
  }

  let taskFound = false;
  let subtaskFound = false;

  const nextTasks = board.tasks.map((task) => {
    if (task.id === taskId) {
      taskFound = true;
      const nextSubtasks = task.subtasks.map((s) => {
        if (s.id === subtaskId) {
          subtaskFound = true;
          return {
            ...s,
            title: patch.title !== undefined ? patch.title.trim() : s.title,
            completed: patch.completed !== undefined ? patch.completed : s.completed,
          };
        }
        return s;
      });
      return { ...task, subtasks: nextSubtasks };
    }
    return task;
  });

  if (!taskFound) {
    throw new Error(`Task "${taskId}" not found`);
  }
  if (!subtaskFound) {
    throw new Error(`Subtask "${subtaskId}" not found in task "${taskId}"`);
  }

  return KanbanBoardSchema.parse({
    lanes: board.lanes,
    tasks: nextTasks,
  });
}

export function deleteSubtask(
  board: KanbanBoard,
  taskId: string,
  subtaskId: string
): KanbanBoard {
  let taskFound = false;
  let subtaskFound = false;

  const nextTasks = board.tasks.map((task) => {
    if (task.id === taskId) {
      taskFound = true;
      const nextSubtasks = task.subtasks.filter((s) => {
        if (s.id === subtaskId) {
          subtaskFound = true;
          return false;
        }
        return true;
      });
      return { ...task, subtasks: nextSubtasks };
    }
    return task;
  });

  if (!taskFound) {
    throw new Error(`Task "${taskId}" not found`);
  }
  if (!subtaskFound) {
    throw new Error(`Subtask "${subtaskId}" not found in task "${taskId}"`);
  }

  return KanbanBoardSchema.parse({
    lanes: board.lanes,
    tasks: nextTasks,
  });
}
