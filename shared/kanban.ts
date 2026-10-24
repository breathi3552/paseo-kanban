import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import type { GitHubIssue } from "./github-import";

export const DEFAULT_LANES = [
  { id: "to-plan", title: "待规划", isCompletionLane: false },
  { id: "in-progress", title: "执行中", isCompletionLane: false },
  { id: "done", title: "已完成", isCompletionLane: true },
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
  completed: z.boolean().default(false),
  completedAt: z.number().int().nonnegative().nullable().default(null),
  source: z.enum(["manual", "github_issue"]).default("manual"),
  issueNumber: z.number().int().positive().nullable().default(null),
  externalUrl: z.string().url().nullable().default(null),
});

export const LaneSchema = z.object({
  id: z.string().trim().min(1, "Lane ID cannot be empty"),
  title: z.string().trim().min(1, "Lane title cannot be empty"),
  isCompletionLane: z.boolean().default(false),
});

const BoardShapeSchema = z.object({
  lanes: z
    .array(LaneSchema)
    .min(1, "Kanban board must have at least one lane")
    .default([...DEFAULT_LANES]),
  tasks: z.array(TaskSchema).default([]),
});

function validateBoardReferences(
  board: {
    lanes: { id: string }[];
    tasks: {
      id: string;
      laneId: string;
      completed?: boolean;
      subtasks: { id: string }[];
    }[];
  },
  ctx: z.RefinementCtx,
) {
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

    if (!task.completed && !laneIds.has(task.laneId)) {
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
}

export const KanbanBoardSchema = BoardShapeSchema.superRefine((board, ctx) => {
  validateBoardReferences(board, ctx);
  const completionLanes = board.lanes.filter((lane) => lane.isCompletionLane);
  if (completionLanes.length !== 1) {
    ctx.addIssue({
      code: "custom",
      message: "Kanban board must have exactly one completion lane",
      path: ["lanes"],
    });
  }
  if (board.lanes.every((lane) => lane.isCompletionLane)) {
    ctx.addIssue({
      code: "custom",
      message: "Kanban board must have at least one ordinary lane",
      path: ["lanes"],
    });
  }
  if (!board.lanes.at(-1)?.isCompletionLane) {
    ctx.addIssue({
      code: "custom",
      message: "Completion lane must be rightmost",
      path: ["lanes"],
    });
  }
  for (const [i, task] of board.tasks.entries()) {
    if (
      task.source === "github_issue" &&
      (!task.projectId || !task.issueNumber || !task.externalUrl)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Imported tasks require a project, Issue number and URL",
        path: ["tasks", i],
      });
    }
    if (
      task.source === "manual" &&
      (task.issueNumber !== null || task.externalUrl !== null)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Manual tasks cannot have Issue attributes",
        path: ["tasks", i],
      });
    }
    if (completionLanes.some((lane) => lane.id === task.laneId)) {
      ctx.addIssue({
        code: "custom",
        message: "Tasks cannot belong to the completion lane",
        path: ["tasks", i, "laneId"],
      });
    }
    if (!task.completed && task.completedAt !== null) {
      ctx.addIssue({
        code: "custom",
        message: "Incomplete tasks cannot have a completion time",
        path: ["tasks", i, "completedAt"],
      });
    }
  }
});

const LegacyBoardSchema = BoardShapeSchema.extend({
  lanes: z
    .array(LaneSchema.omit({ isCompletionLane: true }))
    .min(1)
    .default(DEFAULT_LANES.map(({ id, title }) => ({ id, title }))),
  tasks: z
    .array(TaskSchema.omit({ completed: true, completedAt: true }))
    .default([]),
}).superRefine(validateBoardReferences);

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

export function getLaneTasks(
  board: KanbanBoard,
  laneId: string,
  filter?: ProjectFilter | string | null,
): KanbanTask[] {
  const lane = board.lanes.find((candidate) => candidate.id === laneId);
  if (!lane) return [];
  const tasks = filterTasksByProject(
    board.tasks.filter((task) =>
      lane.isCompletionLane
        ? task.completed
        : !task.completed && task.laneId === laneId,
    ),
    filter,
  );
  return lane.isCompletionLane
    ? tasks.sort((a, b) => (b.completedAt ?? -1) - (a.completedAt ?? -1))
    : tasks;
}

function migrateKanbanBoard(values: unknown, fromVersion: number): KanbanBoard {
  if (fromVersion >= 2) return KanbanBoardSchema.parse(values);
  const legacy = LegacyBoardSchema.parse(values);
  const ordinaryLanes = legacy.lanes.filter((lane) => lane.id !== "done");
  if (ordinaryLanes.length === 0)
    ordinaryLanes.push({ id: "to-plan", title: "待规划" });
  const completionLane = legacy.lanes.find((lane) => lane.id === "done") ?? {
    id: "done",
    title: "已完成",
  };
  const fallbackLaneId = ordinaryLanes[ordinaryLanes.length - 1].id;
  return KanbanBoardSchema.parse({
    lanes: [
      ...ordinaryLanes.map((lane) => ({ ...lane, isCompletionLane: false })),
      { ...completionLane, isCompletionLane: true },
    ],
    tasks: legacy.tasks.map((task) => ({
      ...task,
      laneId: task.laneId === "done" ? fallbackLaneId : task.laneId,
      completed: task.laneId === "done",
      completedAt: null,
    })),
  });
}

export const kanbanSettings = defineSettings({
  id: "kanban",
  scope: "host",
  version: 3,
  schema: KanbanBoardSchema,
  migrate: migrateKanbanBoard,
});

// ---------------------------------------------------------------------------
// Pure State Transition Functions
// ---------------------------------------------------------------------------

export class LaneTitleError extends Error {
  readonly reason: "empty" | "duplicate";
  constructor(reason: "empty" | "duplicate") {
    super(
      reason === "empty"
        ? "Lane title cannot be empty"
        : "Lane title already exists",
    );
    this.reason = reason;
  }
}

function requireLaneTitle(board: KanbanBoard, title: string, laneId?: string) {
  const trimmed = title.trim();
  if (!trimmed) throw new LaneTitleError("empty");
  if (
    board.lanes.some((lane) => lane.id !== laneId && lane.title === trimmed)
  ) {
    throw new LaneTitleError("duplicate");
  }
  return trimmed;
}

export function addLane(
  board: KanbanBoard,
  lane: { id: string; title: string },
): KanbanBoard {
  const trimmedId = lane.id.trim();
  const trimmedTitle = requireLaneTitle(board, lane.title);
  if (!trimmedId) {
    throw new Error("Lane ID cannot be empty");
  }
  if (board.lanes.some((l) => l.id === trimmedId)) {
    throw new Error(`Lane with ID "${trimmedId}" already exists`);
  }

  const nextLanes = [
    ...board.lanes.slice(0, -1),
    { id: trimmedId, title: trimmedTitle, isCompletionLane: false },
    board.lanes[board.lanes.length - 1],
  ];
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
  const trimmedTitle = requireLaneTitle(board, patch.title, laneId);

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

export function reorderLanes(
  board: KanbanBoard,
  ordinaryLaneIds: string[],
): KanbanBoard {
  const ordinary = board.lanes.filter((lane) => !lane.isCompletionLane);
  if (
    ordinaryLaneIds.length !== ordinary.length ||
    new Set(ordinaryLaneIds).size !== ordinary.length ||
    ordinaryLaneIds.some((id) => !ordinary.some((lane) => lane.id === id))
  ) {
    throw new Error("Order must contain every ordinary lane exactly once");
  }
  return KanbanBoardSchema.parse({
    lanes: [
      ...ordinaryLaneIds.map((id) => ordinary.find((lane) => lane.id === id)!),
      board.lanes.at(-1)!,
    ],
    tasks: board.tasks,
  });
}

export function deleteLane(board: KanbanBoard, laneId: string): KanbanBoard {
  const laneIndex = board.lanes.findIndex((l) => l.id === laneId);
  if (laneIndex === -1) {
    throw new Error(`Lane "${laneId}" not found`);
  }

  if (board.lanes[laneIndex].isCompletionLane) {
    throw new Error("Cannot delete the completion lane");
  }
  if (board.lanes.filter((lane) => !lane.isCompletionLane).length <= 1) {
    throw new Error("Cannot delete the last remaining ordinary lane");
  }

  const nextLanes = board.lanes.filter((l) => l.id !== laneId);
  return KanbanBoardSchema.parse({
    lanes: nextLanes,
    tasks: board.tasks.filter(
      (task) => task.completed || task.laneId !== laneId,
    ),
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
  if (
    board.lanes.some((lane) => lane.id === task.laneId && lane.isCompletionLane)
  ) {
    throw new Error("Cannot create tasks in the completion lane");
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
    completed: false,
    completedAt: null,
    source: "manual",
    issueNumber: null,
    externalUrl: null,
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
  const currentTask = board.tasks.find((task) => task.id === taskId);
  if (
    currentTask?.source === "github_issue" &&
    patch.projectId !== undefined &&
    patch.projectId !== currentTask.projectId
  ) {
    throw new Error("Imported task project cannot be changed");
  }
  if (
    patch.laneId !== undefined &&
    !board.lanes.some((l) => l.id === patch.laneId) &&
    !(currentTask?.completed && patch.laneId === currentTask.laneId)
  ) {
    throw new Error(`Target lane "${patch.laneId}" does not exist`);
  }
  if (
    board.lanes.some(
      (lane) => lane.id === patch.laneId && lane.isCompletionLane,
    )
  ) {
    throw new Error("Cannot assign tasks to the completion lane");
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

function formatIssueDescription(issue: GitHubIssue, language?: string): string {
  const isZh =
    typeof language === "string" && language.toLowerCase().startsWith("zh");
  const absolute = new Date(issue.createdAt)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " +00:00");
  const created = isZh ? `创建于 ${absolute}` : `Created at ${absolute}`;
  return `${issue.body}\n\n---\nGitHub Issue #${issue.number} · ${issue.author}\n${created}`;
}

export function importGitHubTasks(
  board: KanbanBoard,
  input: {
    projectId: string;
    laneId: string;
    issues: GitHubIssue[];
    language?: string;
  },
): KanbanBoard {
  if (
    !input.projectId ||
    !board.lanes.some(
      (lane) => lane.id === input.laneId && !lane.isCompletionLane,
    )
  )
    throw new Error("import_target");
  if (input.issues.length === 0 || input.issues.length > 25)
    throw new Error("import_selection");
  const numbers = new Set(
    board.tasks
      .filter((task) => task.projectId === input.projectId)
      .map((task) => task.issueNumber),
  );
  const tasks = input.issues.map((issue) => {
    if (numbers.has(issue.number)) throw new Error("import_duplicate");
    numbers.add(issue.number);
    return {
      id: `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
      title: issue.title,
      description: formatIssueDescription(issue, input.language),
      laneId: input.laneId,
      projectId: input.projectId,
      subtasks: [],
      completed: false,
      completedAt: null,
      source: "github_issue" as const,
      issueNumber: issue.number,
      externalUrl: issue.url,
    };
  });
  return KanbanBoardSchema.parse({
    ...board,
    tasks: [...board.tasks, ...tasks],
  });
}

export function setTaskCompleted(
  board: KanbanBoard,
  taskId: string,
  completed: boolean,
  now: number = Date.now(),
): KanbanBoard {
  const task = board.tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error(`Task with ID "${taskId}" not found`);
  if (task.completed === completed) return board;
  if (!completed) {
    const owner =
      board.lanes.find(
        (lane) => !lane.isCompletionLane && lane.id === task.laneId,
      ) ?? board.lanes.filter((lane) => !lane.isCompletionLane).at(-1);
    if (!owner) throw new Error("No ordinary lane available");
    return reorderTask(board, taskId, owner.id);
  }
  return KanbanBoardSchema.parse({
    ...board,
    tasks: board.tasks.map((candidate) =>
      candidate.id === taskId
        ? { ...candidate, completed: true, completedAt: now }
        : candidate,
    ),
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

  if (
    board.lanes.some(
      (lane) => lane.id === targetLaneId && lane.isCompletionLane,
    )
  ) {
    return setTaskCompleted(board, taskId, true);
  }

  const isSameLane =
    !taskToMove.completed && taskToMove.laneId === targetLaneId;
  const remainingTasks = board.tasks.filter((t) => t.id !== taskId);
  const targetLaneTasks = remainingTasks.filter(
    (t) => !t.completed && t.laneId === targetLaneId,
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
    completed: false,
    completedAt: null,
  };

  let insertionGlobalIndex: number;

  if (targetLaneTasks.length === 0) {
    const targetLaneIdx = board.lanes.findIndex((l) => l.id === targetLaneId);
    let insertAfterTask: KanbanTask | undefined;
    for (let i = targetLaneIdx - 1; i >= 0; i--) {
      const prevLaneId = board.lanes[i].id;
      const prevLaneTasks = remainingTasks.filter(
        (t) => !t.completed && t.laneId === prevLaneId,
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
          (t) => !t.completed && t.laneId === nextLaneId,
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
        t.id === board.tasks[idx].id &&
        t.laneId === board.tasks[idx].laneId &&
        t.completed === board.tasks[idx].completed &&
        t.completedAt === board.tasks[idx].completedAt,
    )
  ) {
    return board;
  }

  return KanbanBoardSchema.parse({
    lanes: board.lanes,
    tasks: nextTasks,
  });
}
