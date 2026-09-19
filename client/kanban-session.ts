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

export interface TaskSessionSnapshot {
  readonly id?: string;
  readonly title: string;
  readonly description: string;
  readonly laneId: string;
  readonly projectId: string | null;
  readonly subtasks: readonly KanbanSubtask[];
  readonly lanes: readonly KanbanLane[];
  readonly isSaving: boolean;
  readonly error: string | null;
}

export interface TaskEditSession {
  readonly mode: "create" | "edit";
  readonly baseBoard: KanbanBoard;
  readonly baseRevision: string;
  readonly initialValues: TaskSessionInitialValues;
  getSnapshot(): TaskSessionSnapshot;
  subscribe(listener: () => void): () => void;
  setTitle(title: string): void;
  setDescription(description: string): void;
  setLaneId(laneId: string): void;
  setProjectId(projectId: string | null): void;
  clearError(): void;
  addSubtask(title: string): boolean;
  updateSubtask(id: string, patch: { title?: string; completed?: boolean }): void;
  removeSubtask(id: string): void;
  save(draft?: TaskDraft): Promise<SessionResult>;
  saveDraft(draft?: TaskDraft): Promise<SessionResult>;
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

export interface LaneSessionSnapshot {
  readonly id?: string;
  readonly title: string;
  readonly lanesCount: number;
  readonly tasksInLaneCount: number;
  readonly canDelete: boolean;
  readonly isSaving: boolean;
  readonly error: string | null;
}

export interface LaneEditSession {
  readonly mode: "create" | "edit";
  readonly baseBoard: KanbanBoard;
  readonly baseRevision: string;
  readonly initialValues: LaneSessionInitialValues;
  readonly lanesCount: number;
  readonly tasksInLaneCount: number;
  readonly canDelete: boolean;
  getSnapshot(): LaneSessionSnapshot;
  subscribe(listener: () => void): () => void;
  setTitle(title: string): void;
  clearError(): void;
  save(draft?: LaneDraft): Promise<SessionResult>;
  saveDraft(draft?: LaneDraft): Promise<SessionResult>;
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
  idGenerator?: () => string;
}

export function openTaskSession(options: OpenTaskSessionOptions): TaskEditSession {
  const {
    mode,
    baseBoard,
    baseRevision,
    save: saveFn,
    taskId,
    defaultLaneId,
    defaultProjectId,
    idGenerator = () =>
      `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  } = options;

  const task =
    mode === "edit" && taskId
      ? baseBoard.tasks.find((t) => t.id === taskId) ?? null
      : null;
  const initialLaneId =
    mode === "edit" && task
      ? task.laneId
      : (defaultLaneId ?? baseBoard.lanes[0]?.id ?? "");
  const initialProjectId =
    mode === "edit" && task ? task.projectId : (defaultProjectId ?? null);

  const initialValues: TaskSessionInitialValues = {
    id: task?.id,
    title: task?.title ?? "",
    description: task?.description ?? "",
    laneId: initialLaneId,
    projectId: initialProjectId,
    subtasks: task ? task.subtasks.map((s) => ({ ...s })) : [],
  };

  let title = initialValues.title;
  let description = initialValues.description;
  let laneId = initialValues.laneId;
  let projectId = initialValues.projectId;
  let subtasks: KanbanSubtask[] = initialValues.subtasks.map((s) => ({ ...s }));
  let isSaving = false;
  let error: string | null = null;

  const listeners = new Set<() => void>();
  let cachedSnapshot: TaskSessionSnapshot | null = null;

  function buildSnapshot(): TaskSessionSnapshot {
    if (!cachedSnapshot) {
      cachedSnapshot = {
        id: initialValues.id,
        title,
        description,
        laneId,
        projectId,
        subtasks: [...subtasks],
        lanes: baseBoard.lanes,
        isSaving,
        error,
      };
    }
    return cachedSnapshot;
  }

  function notify() {
    cachedSnapshot = null;
    buildSnapshot();
    for (const listener of listeners) {
      listener();
    }
  }

  function setTitle(newTitle: string) {
    if (isSaving || newTitle === title) return;
    title = newTitle;
    if (error) error = null;
    notify();
  }

  function setDescription(newDesc: string) {
    if (isSaving || newDesc === description) return;
    description = newDesc;
    notify();
  }

  function setLaneId(newLaneId: string) {
    if (isSaving || newLaneId === laneId) return;
    laneId = newLaneId;
    notify();
  }

  function setProjectId(newProjectId: string | null) {
    if (isSaving || newProjectId === projectId) return;
    projectId = newProjectId;
    notify();
  }

  function clearError() {
    if (error) {
      error = null;
      notify();
    }
  }

  function addSubtask(subtaskTitle: string): boolean {
    if (isSaving) return false;
    const trimmed = subtaskTitle.trim();
    if (!trimmed) {
      error = "新增子步骤内容不能为空";
      notify();
      return false;
    }
    let newId = idGenerator();
    while (subtasks.some((s) => s.id === newId)) {
      newId = `${newId}_${Math.random().toString(36).slice(2, 5)}`;
    }
    subtasks = [...subtasks, { id: newId, title: trimmed, completed: false }];
    if (error) error = null;
    notify();
    return true;
  }

  function updateSubtask(
    id: string,
    patch: { title?: string; completed?: boolean }
  ) {
    if (isSaving) return;
    let changed = false;
    subtasks = subtasks.map((s) => {
      if (s.id === id) {
        const nextTitle = patch.title !== undefined ? patch.title : s.title;
        const nextCompleted =
          patch.completed !== undefined ? patch.completed : s.completed;
        if (nextTitle !== s.title || nextCompleted !== s.completed) {
          changed = true;
          return { ...s, title: nextTitle, completed: nextCompleted };
        }
      }
      return s;
    });
    if (changed) {
      if (error) error = null;
      notify();
    }
  }

  function removeSubtask(id: string) {
    if (isSaving) return;
    const next = subtasks.filter((s) => s.id !== id);
    if (next.length !== subtasks.length) {
      subtasks = next;
      if (error) error = null;
      notify();
    }
  }

  async function save(draft?: TaskDraft): Promise<SessionResult> {
    if (isSaving) {
      return { success: false, error: "正在保存中，请勿重复提交" };
    }

    if (draft) {
      if (draft.title !== undefined) title = draft.title;
      if (draft.description !== undefined) description = draft.description ?? "";
      if (draft.laneId !== undefined) laneId = draft.laneId;
      if (draft.projectId !== undefined) projectId = draft.projectId ?? null;
      if (draft.subtasks !== undefined)
        subtasks = draft.subtasks.map((s) => ({ ...s }));
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      error = "任务标题不能为空";
      notify();
      return { success: false, error };
    }

    for (let i = 0; i < subtasks.length; i++) {
      if (!subtasks[i].title.trim()) {
        error = `第 ${i + 1} 个子步骤标题不能为空，请修改或删除该步骤`;
        notify();
        return { success: false, error };
      }
    }

    isSaving = true;
    error = null;
    notify();

    try {
      let nextBoard: KanbanBoard;
      const normalizedSubtasks = subtasks.map((s) => ({
        id: s.id,
        title: s.title.trim(),
        completed: Boolean(s.completed),
      }));

      if (mode === "create") {
        const generatedId =
          draft?.id?.trim() ||
          `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        nextBoard = addTask(baseBoard, {
          id: generatedId,
          title: trimmedTitle,
          description: description.trim(),
          laneId,
          projectId,
          subtasks: normalizedSubtasks,
        });
      } else {
        if (!taskId || !baseBoard.tasks.some((t) => t.id === taskId)) {
          isSaving = false;
          error = `任务 "${taskId ?? ""}" 不存在或已被删除`;
          notify();
          return { success: false, error };
        }
        nextBoard = updateTask(baseBoard, taskId, {
          title: trimmedTitle,
          description: description.trim(),
          laneId,
          projectId,
          subtasks: normalizedSubtasks,
        });
      }

      const saved = await saveFn(nextBoard, baseRevision);
      isSaving = false;
      if (!saved) {
        error =
          "保存失败：数据可能已被其他会话修改或保存未生效。草稿已保留，请核实后再试。";
        notify();
        return { success: false, error };
      }
      notify();
      return { success: true };
    } catch (err) {
      isSaving = false;
      error = err instanceof Error ? err.message : String(err);
      notify();
      return { success: false, error };
    }
  }

  async function deleteTaskAction(): Promise<SessionResult> {
    if (isSaving) {
      return { success: false, error: "正在保存中，请勿重复操作" };
    }
    if (mode !== "edit" || !taskId) {
      return { success: false, error: "仅在编辑模式下可删除任务" };
    }
    if (!baseBoard.tasks.some((t) => t.id === taskId)) {
      return {
        success: false,
        error: `任务 "${taskId}" 不存在或已被删除`,
      };
    }

    isSaving = true;
    error = null;
    notify();

    try {
      const nextBoard = deleteTask(baseBoard, taskId);
      const saved = await saveFn(nextBoard, baseRevision);
      isSaving = false;
      if (!saved) {
        error = "删除失败：数据可能已被其他会话修改或删除未生效。";
        notify();
        return { success: false, error };
      }
      notify();
      return { success: true };
    } catch (err) {
      isSaving = false;
      error = err instanceof Error ? err.message : String(err);
      notify();
      return { success: false, error };
    }
  }

  return {
    mode,
    baseBoard,
    baseRevision,
    initialValues,
    getSnapshot: buildSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setTitle,
    setDescription,
    setLaneId,
    setProjectId,
    clearError,
    addSubtask,
    updateSubtask,
    removeSubtask,
    save,
    saveDraft: save,
    deleteTask: deleteTaskAction,
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
  const { mode, baseBoard, baseRevision, save: saveFn, laneId } = options;

  const lane =
    mode === "edit" && laneId
      ? baseBoard.lanes.find((l) => l.id === laneId) ?? null
      : null;
  const lanesCount = baseBoard.lanes.length;
  const tasksInLaneCount = lane
    ? baseBoard.tasks.filter((t) => t.laneId === lane.id).length
    : 0;
  const canDelete = Boolean(lane && lanesCount > 1 && tasksInLaneCount === 0);

  const initialValues: LaneSessionInitialValues = {
    id: lane?.id,
    title: lane?.title ?? "",
  };

  let title = initialValues.title;
  let isSaving = false;
  let error: string | null = null;

  const listeners = new Set<() => void>();
  let cachedSnapshot: LaneSessionSnapshot | null = null;

  function buildSnapshot(): LaneSessionSnapshot {
    if (!cachedSnapshot) {
      cachedSnapshot = {
        id: initialValues.id,
        title,
        lanesCount,
        tasksInLaneCount,
        canDelete,
        isSaving,
        error,
      };
    }
    return cachedSnapshot;
  }

  function notify() {
    cachedSnapshot = null;
    buildSnapshot();
    for (const listener of listeners) {
      listener();
    }
  }

  function setTitle(newTitle: string) {
    if (isSaving || newTitle === title) return;
    title = newTitle;
    if (error) error = null;
    notify();
  }

  function clearError() {
    if (error) {
      error = null;
      notify();
    }
  }

  async function save(draft?: LaneDraft): Promise<SessionResult> {
    if (isSaving) {
      return { success: false, error: "正在保存中，请勿重复提交" };
    }

    if (draft && draft.title !== undefined) {
      title = draft.title;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      error = "泳道名称不能为空";
      notify();
      return { success: false, error };
    }

    isSaving = true;
    error = null;
    notify();

    try {
      let nextBoard: KanbanBoard;
      if (mode === "create") {
        const generatedId =
          draft?.id?.trim() ||
          `lane_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        nextBoard = addLane(baseBoard, {
          id: generatedId,
          title: trimmedTitle,
        });
      } else {
        if (!laneId || !baseBoard.lanes.some((l) => l.id === laneId)) {
          isSaving = false;
          error = `泳道 "${laneId ?? ""}" 不存在或已被删除`;
          notify();
          return { success: false, error };
        }
        nextBoard = updateLane(baseBoard, laneId, {
          title: trimmedTitle,
        });
      }

      const saved = await saveFn(nextBoard, baseRevision);
      isSaving = false;
      if (!saved) {
        error = "保存失败：数据可能已被其他会话修改或保存未生效。草稿已保留。";
        notify();
        return { success: false, error };
      }
      notify();
      return { success: true };
    } catch (err) {
      isSaving = false;
      error = err instanceof Error ? err.message : String(err);
      notify();
      return { success: false, error };
    }
  }

  async function deleteLaneAction(): Promise<SessionResult> {
    if (isSaving) {
      return { success: false, error: "正在保存中，请勿重复操作" };
    }
    if (mode !== "edit" || !laneId) {
      return { success: false, error: "仅在编辑模式下可删除泳道" };
    }
    if (!baseBoard.lanes.some((l) => l.id === laneId)) {
      return {
        success: false,
        error: `泳道 "${laneId}" 不存在或已被删除`,
      };
    }

    isSaving = true;
    error = null;
    notify();

    try {
      const nextBoard = deleteLane(baseBoard, laneId);
      const saved = await saveFn(nextBoard, baseRevision);
      isSaving = false;
      if (!saved) {
        error = "删除失败：数据可能已被其他会话修改或删除未生效。";
        notify();
        return { success: false, error };
      }
      notify();
      return { success: true };
    } catch (err) {
      isSaving = false;
      error = err instanceof Error ? err.message : String(err);
      notify();
      return { success: false, error };
    }
  }

  return {
    mode,
    baseBoard,
    baseRevision,
    initialValues,
    lanesCount,
    tasksInLaneCount,
    canDelete,
    getSnapshot: buildSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setTitle,
    clearError,
    save,
    saveDraft: save,
    deleteLane: deleteLaneAction,
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

