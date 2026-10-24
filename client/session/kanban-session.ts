import {
  type KanbanBoard,
  type KanbanLane,
  type KanbanSubtask,
  type KanbanTask,
  type ProjectFilter,
  addTask,
  updateTask,
  deleteTask,
  reorderTask,
  setTaskCompleted,
  importGitHubTasks,
} from "../../shared/kanban";
import type { GitHubIssue } from "../../shared/github-import";

export type SessionResult =
  | { success: true; unchanged?: boolean }
  | {
      success: false;
      error: string;
      kind: "validation" | "operation" | "busy";
    };

export type SaveFn = (board: KanbanBoard, revision: string) => Promise<boolean>;

export type SessionLanguage = "zh" | "en";

export interface ExecuteIssueImportOptions {
  baseBoard: KanbanBoard;
  baseRevision: string;
  projectId: string;
  laneId: string;
  issues: GitHubIssue[];
  save: SaveFn;
  language: SessionLanguage;
}

export async function executeIssueImport(
  input: ExecuteIssueImportOptions,
): Promise<SessionResult> {
  try {
    const next = importGitHubTasks(input.baseBoard, {
      projectId: input.projectId,
      laneId: input.laneId,
      issues: input.issues,
      language: input.language,
    });
    if (await input.save(next, input.baseRevision)) return { success: true };
  } catch {
    /* Preserve the selection and recheck current board before retry. */
  }
  return {
    success: false,
    kind: "operation",
    error:
      input.language === "zh"
        ? "导入失败或版本冲突，请核实最新数据后重试。"
        : "Import failed or version conflict. Check the latest board and retry.",
  };
}

export const sessionMessages = {
  zh: {
    subtaskEmpty: "新增子步骤内容不能为空",
    savingInProgress: "正在保存中，请勿重复提交",
    taskTitleEmpty: "任务标题不能为空",
    subtaskTitleEmpty: (idx: number) =>
      `第 ${idx} 个子步骤标题不能为空，请修改或删除该步骤`,
    taskNotFound: (id: string) => `任务 "${id}" 不存在或已被删除`,
    taskSaveConflict:
      "保存失败：数据可能已被其他会话修改或保存未生效。草稿已保留，请核实后再试。",
    savingActionInProgress: "正在保存中，请勿重复操作",
    taskDeleteOnlyInEdit: "仅在编辑模式下可删除任务",
    taskDeleteFailed: "删除失败：数据可能已被其他会话修改或删除未生效。",
    reorderConflict: "保存失败或版本冲突，未修改数据。请刷新最新数据后重试。",
    completionConflict:
      "完成状态保存失败或版本冲突，未修改数据。请核实最新状态后重试。",
  },
  en: {
    subtaskEmpty: "Subtask content cannot be empty",
    savingInProgress: "Saving in progress, please do not submit repeatedly",
    taskTitleEmpty: "Task title cannot be empty",
    subtaskTitleEmpty: (idx: number) =>
      `Subtask #${idx} title cannot be empty. Please modify or remove it`,
    taskNotFound: (id: string) =>
      `Task "${id}" does not exist or has been deleted`,
    taskSaveConflict:
      "Save failed: Data may have been modified by another session or save was not applied. Draft preserved, please verify and try again.",
    savingActionInProgress:
      "Operation in progress, please do not submit repeatedly",
    taskDeleteOnlyInEdit: "Tasks can only be deleted in edit mode",
    taskDeleteFailed:
      "Delete failed: Data may have been modified by another session or delete was not applied.",
    reorderConflict:
      "Save failed or version conflict, data was not modified. Please refresh and try again.",
    completionConflict:
      "Completion change failed or version conflict, data was not modified. Please check the latest state and try again.",
  },
} as const;

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
  readonly source: "manual" | "github_issue";
  readonly externalUrl: string | null;
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
  updateSubtask(
    id: string,
    patch: { title?: string; completed?: boolean },
  ): void;
  removeSubtask(id: string): void;
  save(draft?: TaskDraft): Promise<SessionResult>;
  saveDraft(draft?: TaskDraft): Promise<SessionResult>;
}

export type ReloadBoardResult =
  | { status: "ready"; board: KanbanBoard; revision: string }
  | { status: "error" | "invalid" | "loading"; error?: string };

export type ReloadBoardFn = () => Promise<ReloadBoardResult>;

export type TaskDeleteResult =
  | { success: true; targetDeleted?: boolean }
  | {
      success: false;
      error: string;
      kind: "operation" | "busy";
    };

export interface TaskDeleteSessionSnapshot {
  readonly taskId: string;
  readonly task: KanbanTask | null;
  readonly title: string;
  readonly baseBoard: KanbanBoard;
  readonly baseRevision: string;
  readonly active: boolean;
  readonly isSaving: boolean;
  readonly isRefreshing: boolean;
  readonly isBusy: boolean;
  readonly error: string | null;
}

export interface TaskDeleteSession {
  getSnapshot(): TaskDeleteSessionSnapshot;
  subscribe(listener: () => void): () => void;
  confirm(): Promise<TaskDeleteResult>;
  cancel(): boolean;
  refresh(): Promise<TaskDeleteResult>;
}

export interface OpenTaskDeleteSessionOptions {
  taskId: string;
  baseBoard: KanbanBoard;
  baseRevision: string;
  save: SaveFn;
  reload?: ReloadBoardFn;
  language?: SessionLanguage | (() => SessionLanguage);
}

export function openTaskDeleteSession(
  options: OpenTaskDeleteSessionOptions,
): TaskDeleteSession {
  const { taskId, save: saveFn, reload: reloadFn, language = "zh" } = options;

  let currentBoard = options.baseBoard;
  let currentRevision = options.baseRevision;
  let task = currentBoard.tasks.find((t) => t.id === taskId) ?? null;
  let active = task !== null;
  let isSaving = false;
  let isRefreshing = false;
  let error: string | null = null;

  const listeners = new Set<() => void>();
  let cachedSnapshot: TaskDeleteSessionSnapshot | null = null;

  function currentMsgs() {
    const lang = typeof language === "function" ? language() : language;
    return sessionMessages[lang] ?? sessionMessages.zh;
  }

  function buildSnapshot(): TaskDeleteSessionSnapshot {
    if (!cachedSnapshot) {
      cachedSnapshot = {
        taskId,
        task,
        title: task?.title ?? "",
        baseBoard: currentBoard,
        baseRevision: currentRevision,
        active,
        isSaving,
        isRefreshing,
        isBusy: isSaving || isRefreshing,
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

  function cancel(): boolean {
    if (isSaving || isRefreshing) return false;
    if (!active && !error) return true;
    active = false;
    error = null;
    notify();
    return true;
  }

  async function confirm(): Promise<TaskDeleteResult> {
    const msgs = currentMsgs();
    if (isSaving || isRefreshing) {
      return {
        success: false,
        kind: "busy",
        error: msgs.savingActionInProgress,
      };
    }
    if (!taskId || !currentBoard.tasks.some((t) => t.id === taskId)) {
      error = msgs.taskNotFound(taskId);
      notify();
      return {
        success: false,
        kind: "operation",
        error,
      };
    }

    isSaving = true;
    error = null;
    notify();

    try {
      const nextBoard = deleteTask(currentBoard, taskId);
      const saved = await saveFn(nextBoard, currentRevision);
      isSaving = false;
      if (!saved) {
        error = currentMsgs().taskDeleteFailed;
        notify();
        return { success: false, kind: "operation", error };
      }
      active = false;
      notify();
      return { success: true };
    } catch (err) {
      isSaving = false;
      error = err instanceof Error ? err.message : String(err);
      notify();
      return { success: false, kind: "operation", error };
    }
  }

  async function refresh(): Promise<TaskDeleteResult> {
    const msgs = currentMsgs();
    if (isSaving || isRefreshing) {
      return {
        success: false,
        kind: "busy",
        error: msgs.savingActionInProgress,
      };
    }
    if (!reloadFn) {
      error = error ?? msgs.taskDeleteFailed;
      notify();
      return { success: false, kind: "operation", error };
    }

    isRefreshing = true;
    notify();

    try {
      const reloaded = await reloadFn();
      isRefreshing = false;
      if (reloaded.status !== "ready") {
        error = error ?? currentMsgs().taskDeleteFailed;
        notify();
        return { success: false, kind: "operation", error };
      }
      currentBoard = reloaded.board;
      currentRevision = reloaded.revision;
      const nextTask = currentBoard.tasks.find((t) => t.id === taskId) ?? null;
      if (!nextTask) {
        active = false;
        error = null;
        notify();
        return { success: true, targetDeleted: true };
      }
      task = nextTask;
      active = true;
      error = null;
      notify();
      return { success: true, targetDeleted: false };
    } catch {
      isRefreshing = false;
      error = error ?? currentMsgs().taskDeleteFailed;
      notify();
      return { success: false, kind: "operation", error };
    }
  }

  return {
    getSnapshot: buildSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    confirm,
    cancel,
    refresh,
  };
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
  language?: SessionLanguage;
}

export function openTaskSession(
  options: OpenTaskSessionOptions,
): TaskEditSession {
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
    language = "zh",
  } = options;

  const msgs = sessionMessages[language] ?? sessionMessages.zh;

  const task =
    mode === "edit" && taskId
      ? (baseBoard.tasks.find((t) => t.id === taskId) ?? null)
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
        lanes: baseBoard.lanes.filter((lane) => !lane.isCompletionLane),
        isSaving,
        error,
        source: task?.source ?? "manual",
        externalUrl: task?.externalUrl ?? null,
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
    if (
      isSaving ||
      task?.source === "github_issue" ||
      newProjectId === projectId
    )
      return;
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
      error = msgs.subtaskEmpty;
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
    patch: { title?: string; completed?: boolean },
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
      return { success: false, kind: "busy", error: msgs.savingInProgress };
    }

    if (draft) {
      if (draft.title !== undefined) title = draft.title;
      if (draft.description !== undefined)
        description = draft.description ?? "";
      if (draft.laneId !== undefined) laneId = draft.laneId;
      if (draft.projectId !== undefined) projectId = draft.projectId ?? null;
      if (draft.subtasks !== undefined)
        subtasks = draft.subtasks.map((s) => ({ ...s }));
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      error = msgs.taskTitleEmpty;
      notify();
      return { success: false, kind: "validation", error };
    }

    for (let i = 0; i < subtasks.length; i++) {
      if (!subtasks[i].title.trim()) {
        error = msgs.subtaskTitleEmpty(i + 1);
        notify();
        return { success: false, kind: "validation", error };
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
          error = msgs.taskNotFound(taskId ?? "");
          notify();
          return { success: false, kind: "operation", error };
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
        error = msgs.taskSaveConflict;
        notify();
        return { success: false, kind: "operation", error };
      }
      const unchanged =
        mode === "edit" &&
        trimmedTitle === initialValues.title &&
        description.trim() === initialValues.description &&
        laneId === initialValues.laneId &&
        projectId === initialValues.projectId &&
        normalizedSubtasks.length === initialValues.subtasks.length &&
        normalizedSubtasks.every((step, index) => {
          const initial = initialValues.subtasks[index];
          return (
            step.id === initial.id &&
            step.title === initial.title &&
            step.completed === initial.completed
          );
        });
      notify();
      return unchanged ? { success: true, unchanged: true } : { success: true };
    } catch (err) {
      isSaving = false;
      error = err instanceof Error ? err.message : String(err);
      notify();
      return { success: false, kind: "operation", error };
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
  language?: SessionLanguage;
}

export type TaskOperationResult =
  { success: true; unchanged?: boolean } | { success: false; error: string };

export interface TaskCompletionOperationOptions {
  baseBoard: KanbanBoard;
  baseRevision: string;
  taskId: string;
  completed: boolean;
  save: SaveFn;
  language?: SessionLanguage;
}

export async function executeTaskCompletion(
  options: TaskCompletionOperationOptions,
): Promise<TaskOperationResult> {
  const {
    baseBoard,
    baseRevision,
    taskId,
    completed,
    save,
    language = "zh",
  } = options;
  try {
    const nextBoard = setTaskCompleted(baseBoard, taskId, completed);
    if (nextBoard === baseBoard) return { success: true, unchanged: true };
    if (!(await save(nextBoard, baseRevision))) {
      return {
        success: false,
        error: sessionMessages[language].completionConflict,
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

export async function executeTaskReorder(
  options: ReorderTaskOperationOptions,
): Promise<TaskOperationResult> {
  const {
    baseBoard,
    baseRevision,
    taskId,
    targetLaneId,
    targetIndex,
    filter,
    save,
    language = "zh",
  } = options;
  const msgs = sessionMessages[language] ?? sessionMessages.zh;
  try {
    const nextBoard = reorderTask(
      baseBoard,
      taskId,
      targetLaneId,
      targetIndex,
      filter,
    );
    if (nextBoard === baseBoard) {
      return { success: true, unchanged: true };
    }
    const saved = await save(nextBoard, baseRevision);
    if (!saved) {
      return {
        success: false,
        error: msgs.reorderConflict,
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
