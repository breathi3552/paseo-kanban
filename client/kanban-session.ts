import {
  type KanbanBoard,
  type KanbanTask,
  type KanbanLane,
  type KanbanSubtask,
  type ProjectFilter,
  addTask,
  updateTask,
  deleteTask,
  addLane,
  updateLane,
  deleteLane,
  reorderTask,
} from "../shared/kanban.ts";

export type SessionResult =
  | { success: true }
  | { success: false; error: string };

export type SaveFn = (board: KanbanBoard, revision: string) => Promise<boolean>;

export interface TaskDraft {
  id?: string;
  title: string;
  description?: string;
  laneId: string;
  projectId?: string | null;
  subtasks?: KanbanSubtask[];
}

export interface TaskSessionInitialValues {
  id?: string;
  title: string;
  description: string;
  laneId: string;
  projectId: string | null;
  subtasks: KanbanSubtask[];
}

export interface TaskEditSession {
  readonly mode: "create" | "edit";
  readonly baseBoard: KanbanBoard;
  readonly baseRevision: string;
  readonly initialValues: TaskSessionInitialValues;
  saveDraft(draft: TaskDraft): Promise<SessionResult>;
  deleteTask(): Promise<SessionResult>;
}

export interface LaneDraft {
  id?: string;
  title: string;
}

export interface LaneSessionInitialValues {
  id?: string;
  title: string;
}

export interface LaneEditSession {
  readonly mode: "create" | "edit";
  readonly baseBoard: KanbanBoard;
  readonly baseRevision: string;
  readonly initialValues: LaneSessionInitialValues;
  readonly lanesCount: number;
  readonly tasksInLaneCount: number;
  readonly canDelete: boolean;
  saveDraft(draft: LaneDraft): Promise<SessionResult>;
  deleteLane(): Promise<SessionResult>;
}

export interface OpenTaskSessionOptions {
  mode: "create" | "edit";
  baseBoard: KanbanBoard;
  baseRevision: string;
  save: SaveFn;
  taskId?: string;
  defaultLaneId?: string;
  defaultProjectId?: string | null;
}

export function openTaskSession(options: OpenTaskSessionOptions): TaskEditSession {
  const { mode, baseBoard, baseRevision, save, taskId, defaultLaneId, defaultProjectId } = options;

  const task = mode === "edit" && taskId ? baseBoard.tasks.find((t) => t.id === taskId) ?? null : null;
  const initialLaneId = mode === "edit" && task ? task.laneId : (defaultLaneId ?? baseBoard.lanes[0]?.id ?? "");
  const initialProjectId = mode === "edit" && task ? task.projectId : (defaultProjectId ?? null);

  const initialValues: TaskSessionInitialValues = {
    id: task?.id,
    title: task?.title ?? "",
    description: task?.description ?? "",
    laneId: initialLaneId,
    projectId: initialProjectId,
    subtasks: task ? task.subtasks.map((s) => ({ ...s })) : [],
  };

  return {
    mode,
    baseBoard,
    baseRevision,
    initialValues,
    async saveDraft(draft: TaskDraft): Promise<SessionResult> {
      const trimmedTitle = draft.title.trim();
      if (!trimmedTitle) {
        return { success: false, error: "任务标题不能为空" };
      }

      if (draft.subtasks) {
        for (let i = 0; i < draft.subtasks.length; i++) {
          if (!draft.subtasks[i].title.trim()) {
            return {
              success: false,
              error: `第 ${i + 1} 个子步骤标题不能为空，请修改或删除该步骤`,
            };
          }
        }
      }

      try {
        let nextBoard: KanbanBoard;
        if (mode === "create") {
          const generatedId =
            draft.id?.trim() ||
            `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
          nextBoard = addTask(baseBoard, {
            id: generatedId,
            title: trimmedTitle,
            description: draft.description?.trim() ?? "",
            laneId: draft.laneId,
            projectId: draft.projectId ?? null,
            subtasks: draft.subtasks,
          });
        } else {
          if (!taskId || !baseBoard.tasks.some((t) => t.id === taskId)) {
            return {
              success: false,
              error: `任务 "${taskId ?? ""}" 不存在或已被删除`,
            };
          }
          nextBoard = updateTask(baseBoard, taskId, {
            title: trimmedTitle,
            description: draft.description?.trim() ?? "",
            laneId: draft.laneId,
            projectId: draft.projectId ?? null,
            subtasks: draft.subtasks?.map((s) => ({
              id: s.id,
              title: s.title.trim(),
              completed: Boolean(s.completed),
            })),
          });
        }

        const saved = await save(nextBoard, baseRevision);
        if (!saved) {
          return {
            success: false,
            error: "保存失败：数据可能已被其他会话修改或保存未生效。草稿已保留，请核实后再试。",
          };
        }
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    async deleteTask(): Promise<SessionResult> {
      if (mode !== "edit" || !taskId) {
        return { success: false, error: "仅在编辑模式下可删除任务" };
      }
      if (!baseBoard.tasks.some((t) => t.id === taskId)) {
        return {
          success: false,
          error: `任务 "${taskId}" 不存在或已被删除`,
        };
      }

      try {
        const nextBoard = deleteTask(baseBoard, taskId);
        const saved = await save(nextBoard, baseRevision);
        if (!saved) {
          return {
            success: false,
            error: "删除失败：数据可能已被其他会话修改或删除未生效。",
          };
        }
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

export interface OpenLaneSessionOptions {
  mode: "create" | "edit";
  baseBoard: KanbanBoard;
  baseRevision: string;
  save: SaveFn;
  laneId?: string;
}

export function openLaneSession(options: OpenLaneSessionOptions): LaneEditSession {
  const { mode, baseBoard, baseRevision, save, laneId } = options;

  const lane = mode === "edit" && laneId ? baseBoard.lanes.find((l) => l.id === laneId) ?? null : null;
  const lanesCount = baseBoard.lanes.length;
  const tasksInLaneCount = lane ? baseBoard.tasks.filter((t) => t.laneId === lane.id).length : 0;
  const canDelete = Boolean(lane && lanesCount > 1 && tasksInLaneCount === 0);

  const initialValues: LaneSessionInitialValues = {
    id: lane?.id,
    title: lane?.title ?? "",
  };

  return {
    mode,
    baseBoard,
    baseRevision,
    initialValues,
    lanesCount,
    tasksInLaneCount,
    canDelete,
    async saveDraft(draft: LaneDraft): Promise<SessionResult> {
      const trimmedTitle = draft.title.trim();
      if (!trimmedTitle) {
        return { success: false, error: "泳道名称不能为空" };
      }

      try {
        let nextBoard: KanbanBoard;
        if (mode === "create") {
          const generatedId =
            draft.id?.trim() ||
            `lane_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
          nextBoard = addLane(baseBoard, {
            id: generatedId,
            title: trimmedTitle,
          });
        } else {
          if (!laneId || !baseBoard.lanes.some((l) => l.id === laneId)) {
            return {
              success: false,
              error: `泳道 "${laneId ?? ""}" 不存在或已被删除`,
            };
          }
          nextBoard = updateLane(baseBoard, laneId, {
            title: trimmedTitle,
          });
        }

        const saved = await save(nextBoard, baseRevision);
        if (!saved) {
          return {
            success: false,
            error: "保存失败：数据可能已被其他会话修改或保存未生效。草稿已保留。",
          };
        }
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    async deleteLane(): Promise<SessionResult> {
      if (mode !== "edit" || !laneId) {
        return { success: false, error: "仅在编辑模式下可删除泳道" };
      }
      if (!baseBoard.lanes.some((l) => l.id === laneId)) {
        return {
          success: false,
          error: `泳道 "${laneId}" 不存在或已被删除`,
        };
      }

      try {
        const nextBoard = deleteLane(baseBoard, laneId);
        const saved = await save(nextBoard, baseRevision);
        if (!saved) {
          return {
            success: false,
            error: "删除失败：数据可能已被其他会话修改或删除未生效。",
          };
        }
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

export interface ReorderTaskOperationOptions {
  baseBoard: KanbanBoard;
  baseRevision: string;
  taskId: string;
  targetLaneId: string;
  targetIndex?: number;
  filter?: ProjectFilter | string;
  save: SaveFn;
}

export type ReorderOperationResult =
  | { success: true; unchanged?: boolean }
  | { success: false; error: string };

export async function executeTaskReorder(
  options: ReorderTaskOperationOptions
): Promise<ReorderOperationResult> {
  const { baseBoard, baseRevision, taskId, targetLaneId, targetIndex, filter, save } = options;
  try {
    const nextBoard = reorderTask(baseBoard, taskId, targetLaneId, targetIndex, filter);
    if (nextBoard === baseBoard) {
      return { success: true, unchanged: true };
    }
    const saved = await save(nextBoard, baseRevision);
    if (!saved) {
      return {
        success: false,
        error: "保存失败或版本冲突，未修改数据。请刷新最新数据后重试。",
      };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

