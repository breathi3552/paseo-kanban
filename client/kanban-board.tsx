import { useState, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  type LayoutChangeEvent,
} from "react-native";
import { useSettings, useRpc, openExternalUrl } from "@getpaseo/plugin/client";
import { settingsRpc } from "@getpaseo/plugin";
import { useToast, copyText } from "@getpaseo/plugin/client/react-native";
import { agentDispatchSettings } from "../shared/agent-dispatch";
import { taskPrompt } from "./agent-dispatch";
import {
  TaskContextMenu,
  type TaskMenuTarget,
  type TaskMenuAction,
} from "./task-context-menu";
import { TaskDeleteDialog } from "./task-delete-dialog";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  kanbanSettings,
  KanbanBoardSchema,
  getLaneTasks,
  isTaskMatchingFilter,
  updateTask,
  type KanbanBoard,
  type KanbanTask,
} from "../shared/kanban";
import { useProjects } from "./use-projects";
import { TaskModal } from "./task-modal";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import { GitHubImportModal } from "./github-import-modal";
import { AgentDispatchModal } from "./agent-dispatch-modal";
import { LaneManagementModal } from "./lane-management-modal";
import { openLaneEditSession, type LaneEditSession } from "./lane-edit-session";
import { useKanbanDrag } from "./kanban-drag";
import { KanbanLaneView } from "./kanban-lane";
import { KanbanDragOverlay } from "./kanban-overlay";
import {
  openTaskSession,
  executeTaskReorder,
  executeTaskCompletion,
  type TaskEditSession,
} from "./kanban-session";
import {
  useI18n,
  I18nLanguageContext,
  detectPaseoLanguage,
  t as translate,
  type TranslationKey,
} from "./i18n";
import { useProjectFilterLayout } from "./web";

const laneSettingsRead = settingsRpc(kanbanSettings.id).read;

interface KanbanBoardProps extends PluginSurfaceProps {
  initialProjectId?: string | null;
}

export function KanbanBoardView(props: KanbanBoardProps) {
  const { language } = useI18n(props);
  return (
    <I18nLanguageContext.Provider value={language}>
      <KanbanBoardContent {...props} />
    </I18nLanguageContext.Provider>
  );
}

function KanbanBoardContent(props: KanbanBoardProps) {
  const { theme } = props;
  useProjectFilterLayout();
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  const compact =
    props.layout.compact || (panelWidth !== null && panelWidth < 600);
  const layout = useMemo(
    () => ({ ...props.layout, compact }),
    [props.layout, compact],
  );
  const handleLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0) setPanelWidth(width);
  };
  const { t, language } = useI18n();
  const settings = useSettings(kanbanSettings);
  const readLaneSettings = useRpc(laneSettingsRead);
  const currentSettings = useRef(settings);
  currentSettings.current = settings;
  const promptSettings = useSettings(agentDispatchSettings);
  const [menuTarget, setMenuTarget] = useState<TaskMenuTarget | null>(null);
  const [deleteSession, setDeleteSession] = useState<TaskEditSession | null>(
    null,
  );
  const [deleteRefreshId, setDeleteRefreshId] = useState<string | null>(null);
  const toast = useToast();
  const feedbackText = useRef(t);
  feedbackText.current = t;
  const laneFeedback = useRef({ props, toast });
  laneFeedback.current = { props, toast };
  const {
    projects,
    resolveProjectName,
    isError: projectsError,
  } = useProjects();

  const [selectedProjectId, setSelectedProjectId] = useState(
    props.initialProjectId || "all",
  );
  const [importOpen, setImportOpen] = useState(false);
  const [dispatchDraft, setDispatchDraft] = useState<{
    task: KanbanTask;
    board: KanbanBoard;
    revision: string;
  } | null>(null);
  const [activeTaskSession, setActiveTaskSession] =
    useState<TaskEditSession | null>(null);
  const [laneManagement, setLaneManagement] = useState<LaneEditSession | null>(
    null,
  );
  const [taskOperationError, setTaskOperationError] = useState<string | null>(
    null,
  );
  const [completionPending, setCompletionPending] = useState(false);
  const completionPendingRef = useRef(false);

  const selectableProjects = useMemo(() => {
    const missingIds = new Set([props.initialProjectId, selectedProjectId]);
    const missingProjects = [...missingIds]
      .filter(
        (id): id is string =>
          !!id &&
          id !== "all" &&
          id !== "unassigned" &&
          !projects.some((project) => project.projectId === id),
      )
      .map((id) => ({ projectId: id, projectDisplayName: id }));
    return [...projects, ...missingProjects].sort((a, b) =>
      a.projectDisplayName.localeCompare(b.projectDisplayName, language),
    );
  }, [projects, props.initialProjectId, selectedProjectId, language]);

  const isReady = settings.status === "ready";
  // Keep the open import draft mounted if a conflict refresh fails. The retained
  // board is display-only: the modal cannot submit until settings are ready.
  const lastReady = useRef<{ board: KanbanBoard; revision: string } | null>(
    null,
  );
  if (isReady)
    lastReady.current = { board: settings.values, revision: settings.revision };
  const retained =
    importOpen || laneManagement || dispatchDraft || deleteSession
      ? lastReady.current
      : null;
  const board = isReady ? settings.values : (retained?.board ?? null);
  const revision = isReady ? settings.revision : (retained?.revision ?? "");
  const preserveImport =
    (importOpen ||
      laneManagement ||
      dispatchDraft !== null ||
      deleteSession !== null) &&
    board !== null;

  const handleReorderTask = async (
    taskId: string,
    targetLaneId: string,
    targetIndex: number,
  ) => {
    if (!board || completionPendingRef.current) return;
    completionPendingRef.current = true;
    setCompletionPending(true);
    try {
      const result = await executeTaskReorder({
        baseBoard: board,
        baseRevision: revision,
        taskId,
        targetLaneId,
        targetIndex,
        filter: selectedProjectId,
        save: (b, r) => settings.save(b, r),
        language,
      });
      if (!result.success) {
        setTaskOperationError(result.error);
        toast.error(feedbackText.current("notification.taskReorderFailed"));
      } else {
        setTaskOperationError(null);
      }
    } finally {
      completionPendingRef.current = false;
      setCompletionPending(false);
    }
  };

  const getTaskPreview = (taskId: string) => {
    if (!board) return null;
    const task = board.tasks.find((t) => t.id === taskId) ?? null;
    return {
      task,
      projectDisplayName: task ? resolveProjectName(task.projectId) : null,
    };
  };

  const drag = useKanbanDrag({
    lanes: board?.lanes ?? [],
    onReorderTask: handleReorderTask,
    getTaskPreview,
  });

  const handleSetCompleted = async (taskId: string, completed: boolean) => {
    if (!board || completionPendingRef.current || drag.isDragLocked()) return;
    completionPendingRef.current = true;
    setCompletionPending(true);
    try {
      const result = await executeTaskCompletion({
        baseBoard: board,
        baseRevision: revision,
        taskId,
        completed,
        save: (next, expectedRevision) => settings.save(next, expectedRevision),
        language,
      });
      setTaskOperationError(result.success ? null : result.error);
      if (!result.success)
        toast.error(feedbackText.current("notification.taskCompletionFailed"));
    } finally {
      completionPendingRef.current = false;
      setCompletionPending(false);
    }
  };

  const openNewTask = (defaultLaneId?: string) => {
    if (completionPendingRef.current || drag.isDragLocked() || !board) return;
    setActiveTaskSession(
      openTaskSession({
        mode: "create",
        baseBoard: board,
        baseRevision: revision,
        save: (b, r) => settings.save(b, r),
        defaultLaneId: defaultLaneId ?? board.lanes[0]?.id ?? "",
        defaultProjectId:
          selectedProjectId === "all" || selectedProjectId === "unassigned"
            ? null
            : selectedProjectId,
        language,
      }),
    );
  };

  const openEditTask = (taskId: string) => {
    if (completionPendingRef.current || drag.isDragLocked() || !board) return;
    setActiveTaskSession(
      openTaskSession({
        mode: "edit",
        taskId,
        baseBoard: board,
        baseRevision: revision,
        save: (b, r) => settings.save(b, r),
        language,
      }),
    );
  };

  const openLaneManagement = () => {
    if (completionPendingRef.current || drag.isDragLocked() || !board) return;
    const laneText = (key: TranslationKey) =>
      translate(key, detectPaseoLanguage(laneFeedback.current.props));
    setLaneManagement(
      openLaneEditSession({
        initial: { board, revision },
        current: () => {
          const latest = currentSettings.current;
          return latest.status === "ready"
            ? { board: latest.values, revision: latest.revision }
            : null;
        },
        load: async () => {
          // reload() returns void: read through the public RPC to obtain a usable
          // snapshot even when this view has unmounted. Reload also refreshes the
          // mounted board, but no continuation depends on React rendering it.
          const result = await readLaneSettings({});
          if (result.status !== "ready")
            throw new Error(laneText("notification.laneSaveFailed"));
          const snapshot = {
            board: KanbanBoardSchema.parse(result.values),
            revision: result.revision,
          };
          await settings.reload();
          return snapshot;
        },
        save: (next, expected) => settings.save(next, expected),
        translate: laneText,
        notify: (key, success) => {
          const latestToast = laneFeedback.current.toast;
          if (success) latestToast.show(laneText(key), { variant: "success" });
          else latestToast.error(laneText(key));
        },
      }),
    );
  };

  const menuTask = menuTarget
    ? board?.tasks.find(
        (task) =>
          task.id === menuTarget.taskId &&
          isTaskMatchingFilter(task, selectedProjectId),
      )
    : null;
  useEffect(() => {
    if (
      menuTarget &&
      (!isReady ||
        completionPending ||
        drag.isDragLocked() ||
        activeTaskSession ||
        deleteSession ||
        dispatchDraft ||
        importOpen ||
        laneManagement ||
        !menuTask)
    )
      setMenuTarget(null);
  }, [
    menuTarget,
    isReady,
    completionPending,
    drag,
    menuTask,
    activeTaskSession,
    deleteSession,
    dispatchDraft,
    importOpen,
    laneManagement,
  ]);
  useEffect(() => {
    setMenuTarget(null);
  }, [selectedProjectId]);
  useEffect(() => {
    if (!deleteRefreshId) return;
    if (isReady && board) {
      if (board.tasks.some((task) => task.id === deleteRefreshId)) {
        setDeleteSession(
          openTaskSession({
            mode: "edit",
            taskId: deleteRefreshId,
            baseBoard: board,
            baseRevision: revision,
            save: (b, r) => settings.save(b, r),
            language,
          }),
        );
      } else setDeleteSession(null);
      setDeleteRefreshId(null);
    } else if (settings.status === "error" || settings.status === "invalid") {
      toast.error(feedbackText.current("notification.taskDeleteFailed"));
      setDeleteRefreshId(null);
    }
  }, [deleteRefreshId, isReady, board, revision, settings, language, toast, t]);

  const openMenu = (taskId: string, point: { x: number; y: number }) => {
    if (
      !isReady ||
      completionPendingRef.current ||
      drag.isDragLocked() ||
      activeTaskSession ||
      deleteSession ||
      dispatchDraft ||
      importOpen ||
      laneManagement
    )
      return;
    setMenuTarget({ taskId, ...point });
  };
  const menuAction = async (taskId: string, action: TaskMenuAction) => {
    if (
      !board ||
      !isReady ||
      completionPendingRef.current ||
      drag.isDragLocked()
    )
      return;
    const task = board.tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;
    if (action === "edit") openEditTask(task.id);
    else if (action === "complete")
      await handleSetCompleted(task.id, !task.completed);
    else if (action === "delete")
      setDeleteSession(
        openTaskSession({
          mode: "edit",
          taskId,
          baseBoard: board,
          baseRevision: revision,
          save: (b, r) => settings.save(b, r),
          language,
        }),
      );
    else if (action === "copy" && promptSettings.status === "ready") {
      try {
        await copyText(
          taskPrompt(
            task,
            language,
            promptSettings.values.prompt ?? t("dispatch.defaultPrompt"),
          ),
        );
        toast.show(feedbackText.current("contextMenu.copied"), {
          variant: "success",
        });
      } catch {
        toast.error(feedbackText.current("contextMenu.copyFailed"));
      }
    } else if (
      action === "external" &&
      task.source === "github_issue" &&
      task.externalUrl
    ) {
      try {
        await openExternalUrl(task.externalUrl);
      } catch {
        toast.error(feedbackText.current("external.failed"));
      }
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          backgroundColor: theme.colors.surface0,
          userSelect: "none",
        },
        header: {
          paddingHorizontal: layout.compact ? 12 : 20,
          paddingVertical: layout.compact ? 10 : 14,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surface0,
          gap: 10,
        },
        headerTopRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        },
        titleRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          flexShrink: 1,
          maxWidth: "100%",
          alignItems: "center",
          gap: 8,
        },
        titleText: {
          fontSize: layout.compact ? 18 : 22,
          fontWeight: "700",
          color: theme.colors.foreground,
        },
        headerActions: {
          flexDirection: "row",
          flexWrap: "wrap",
          maxWidth: "100%",
          alignItems: "center",
          gap: 8,
        },
        primaryButton: {
          backgroundColor: theme.colors.accent,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 8,
        },
        primaryButtonText: {
          color: theme.colors.accentForeground,
          fontSize: 13,
          fontWeight: "600",
        },
        secondaryButton: {
          backgroundColor: theme.colors.surface1,
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 8,
        },
        secondaryButtonText: {
          color: theme.colors.foreground,
          fontSize: 13,
          fontWeight: "500",
        },
        conflictBanner: {
          marginHorizontal: layout.compact ? 12 : 20,
          marginTop: 10,
          padding: 10,
          backgroundColor: theme.colors.surface2,
          borderColor: theme.colors.statusDanger,
          borderWidth: 1,
          borderRadius: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        conflictText: {
          color: theme.colors.statusDanger,
          fontSize: 13,
          flex: 1,
        },
        conflictAction: {
          marginLeft: 10,
          paddingHorizontal: 8,
          paddingVertical: 4,
          backgroundColor: theme.colors.surface1,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        lanesWrapper: {
          flex: 1,
          minHeight: 0,
          position: "relative",
          userSelect: "none",
        },
        lanesContainer: {
          flex: 1,
          userSelect: "none",
        },
        lanesContent: {
          flexDirection: "row",
          gap: layout.compact ? 10 : 14,
          padding: layout.compact ? 10 : 16,
          paddingRight: 24,
        },
        centerBox: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 12,
        },
        centerText: {
          fontSize: 14,
          color: theme.colors.foreground,
          textAlign: "center",
        },
      }),
    [theme, layout.compact],
  );

  if (settings.status === "loading" && !preserveImport) {
    return (
      <View style={[styles.container, styles.centerBox]}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.centerText}>{t("kanban.loading")}</Text>
      </View>
    );
  }

  if (settings.status === "error" && !preserveImport) {
    return (
      <View style={[styles.container, styles.centerBox]}>
        <Text style={[styles.centerText, { color: theme.colors.statusDanger }]}>
          {t("kanban.loadError", { error: settings.error })}
        </Text>
        <Pressable
          onPress={() => settings.reload()}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>
            {t("kanban.retryLoad")}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (settings.status === "invalid" && !preserveImport) {
    return (
      <View style={[styles.container, styles.centerBox]}>
        <Text
          style={[
            styles.centerText,
            { color: theme.colors.statusWarning ?? theme.colors.statusDanger },
          ]}
        >
          {t("kanban.formatError", { error: settings.error })}
        </Text>
        <Text
          style={[
            styles.centerText,
            { color: theme.colors.foregroundMuted, fontSize: 12 },
          ]}
        >
          {t("kanban.formatErrorHint")}
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => settings.reload()}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>
              {t("kanban.retryLoad")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => settings.reset()}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {t("kanban.resetDefault")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!board) return null;

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.titleRow}>
            <Text style={styles.titleText}>{t("kanban.title")}</Text>
            <View
              style={{
                backgroundColor: theme.colors.surface2,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 10,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: theme.colors.foregroundMuted,
                  fontWeight: "600",
                }}
              >
                {t("kanban.stats", {
                  tasks: board.tasks.length,
                  lanes: board.lanes.length,
                })}
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              onPress={() => openLaneManagement()}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>
                {t("laneManagement.title")}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                if (!drag.isDragLocked() && !completionPendingRef.current)
                  setImportOpen(true);
              }}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>{t("import.title")}</Text>
            </Pressable>
          </View>
        </View>

        {/* Project Filter */}
        <View style={{ maxWidth: 520 }}>
          <SettingsSelect
            testID="kanban-project-filter"
            label={t("kanban.filterLabel")}
            value={selectedProjectId}
            options={[
              { value: "all", label: t("kanban.filterAll") },
              { value: "unassigned", label: t("kanban.filterUnassigned") },
              ...selectableProjects.map((project) => ({
                value: project.projectId,
                label: project.projectDisplayName,
              })),
            ]}
            onValueChange={(projectId) => {
              if (!drag.isDragLocked()) setSelectedProjectId(projectId);
            }}
            disabled={drag.isDragLocked()}
          />
          {projectsError && (
            <Text
              style={{
                fontSize: 11,
                color:
                  theme.colors.statusWarning ?? theme.colors.foregroundMuted,
              }}
            >
              {t("kanban.projectsError")}
            </Text>
          )}
        </View>
      </View>

      {/* Conflict / Save Error Notification */}
      {(settings.saveError || taskOperationError) && (
        <View style={styles.conflictBanner}>
          <Text style={styles.conflictText}>
            {taskOperationError
              ? t("kanban.saveFailed", { error: taskOperationError })
              : t("kanban.conflictError", { error: settings.saveError })}
          </Text>
          <Pressable
            onPress={() => {
              setTaskOperationError(null);
              settings.reload();
            }}
            style={styles.conflictAction}
          >
            <Text style={{ fontSize: 12, color: theme.colors.foreground }}>
              {t("kanban.refresh")}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Main Board Lanes */}
      <View style={styles.lanesWrapper}>
        <ScrollView
          ref={drag.bindContainerRef}
          horizontal
          style={styles.lanesContainer}
          contentContainerStyle={styles.lanesContent}
          onLayout={(e) => drag.handleContainerLayout(e.nativeEvent.layout)}
          onScroll={(e) => {
            setMenuTarget(null);
            drag.handleContainerScroll(e.nativeEvent.contentOffset.x);
          }}
          scrollEventThrottle={16}
        >
          {board.lanes.map((lane) => {
            const laneTasks = getLaneTasks(board, lane.id, selectedProjectId);
            return (
              <KanbanLaneView
                key={lane.id}
                lane={lane}
                tasks={laneTasks}
                projects={projects}
                resolveProjectName={resolveProjectName}
                theme={theme}
                layout={layout}
                dragBinding={drag.bindLane(lane.id)}
                onAddTask={(laneId) => openNewTask(laneId)}
                onSelectTask={(task) => openEditTask(task.id)}
                onSetCompleted={handleSetCompleted}
                onContextMenu={openMenu}
                onScrollCards={() => setMenuTarget(null)}
                onSendToAgent={
                  props.navigation
                    ? (task) => {
                        if (
                          !completionPendingRef.current &&
                          !drag.isDragLocked()
                        )
                          setDispatchDraft({ task, board, revision });
                      }
                    : undefined
                }
                completionPending={completionPending}
              />
            );
          })}
        </ScrollView>

        <KanbanDragOverlay drag={drag} theme={theme} layout={layout} />
      </View>

      {menuTarget && menuTask && (
        <TaskContextMenu
          key={menuTarget.taskId}
          target={menuTarget}
          task={menuTask}
          lanes={board.lanes}
          copyReady={promptSettings.status === "ready"}
          theme={theme}
          onDismiss={() => setMenuTarget(null)}
          onAction={(action) => {
            void menuAction(menuTask.id, action);
          }}
          onMove={(laneId) => {
            if (!completionPendingRef.current && !drag.isDragLocked())
              void handleReorderTask(
                menuTask.id,
                laneId,
                getLaneTasks(board, laneId, selectedProjectId).length,
              );
          }}
        />
      )}
      {deleteSession && (
        <TaskDeleteDialog
          session={deleteSession}
          theme={theme}
          onClose={() => setDeleteSession(null)}
          onRefresh={async () => {
            const id = deleteSession.initialValues.id;
            await settings.reload();
            if (id) setDeleteRefreshId(id);
          }}
        />
      )}

      {/* Modals with Session Baseline Locking */}
      {dispatchDraft && props.navigation && (
        <AgentDispatchModal
          task={dispatchDraft.task}
          projects={projects}
          theme={theme}
          navigation={props.navigation}
          saveProject={(projectId) =>
            settings.save(
              updateTask(dispatchDraft.board, dispatchDraft.task.id, {
                projectId,
              }),
              dispatchDraft.revision,
            )
          }
          onClose={() => setDispatchDraft(null)}
        />
      )}
      {importOpen && (
        <GitHubImportModal
          board={board}
          revision={revision}
          settingsReady={isReady}
          projects={projects}
          initialProjectId={selectedProjectId}
          theme={theme}
          compact={compact}
          save={(next, expected) => settings.save(next, expected)}
          reload={() => settings.reload()}
          onClose={() => setImportOpen(false)}
          onImported={(projectId) => {
            if (selectedProjectId !== "all" && selectedProjectId !== projectId)
              setSelectedProjectId(projectId);
          }}
        />
      )}
      {activeTaskSession && (
        <TaskModal
          open={activeTaskSession !== null}
          onClose={() => setActiveTaskSession(null)}
          session={activeTaskSession}
          projects={selectableProjects}
          theme={theme}
          layout={layout}
        />
      )}

      {laneManagement && (
        <LaneManagementModal
          session={laneManagement}
          onClose={() => setLaneManagement(null)}
          theme={theme}
          compact={compact}
        />
      )}
    </View>
  );
}
