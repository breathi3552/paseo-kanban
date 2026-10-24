import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useSyncExternalStore,
} from "react";
import { View, Text, Pressable, StyleSheet, PanResponder } from "react-native";
import {
  TextInput,
  Icon,
  ScrollView,
  useToast,
} from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import type { KanbanLane } from "../../shared/kanban";
import { getProjectOptions, type ProjectItem } from "../session/use-projects";
import {
  openTaskDeleteSession,
  type ReloadBoardFn,
  type SaveFn,
  type TaskDeleteSession,
  type TaskEditSession,
} from "../session/kanban-session";
import { useI18n } from "../platform/i18n";
import { useTaskDelete } from "./task-delete-dialog";
import { IssueLink } from "./issue-link";
import { BusinessDialog } from "./business-dialog";

type PluginTheme = PluginSurfaceProps["theme"];

export interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  session: TaskEditSession;
  save: SaveFn;
  reload?: ReloadBoardFn;
  lanes?: KanbanLane[];
  projects: ProjectItem[];
  theme: PluginTheme;
  layout: { compact: boolean; platform: "ios" | "android" | "web" };
}

export function TaskModal({
  open,
  onClose,
  session,
  save,
  reload,
  lanes: propLanes,
  projects,
  theme,
  layout,
}: TaskModalProps) {
  const { t, language } = useI18n();
  const feedbackText = useRef(t);
  feedbackText.current = t;
  const feedbackLanguage = useRef(language);
  feedbackLanguage.current = language;
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );

  const projectOptions = useMemo(
    () =>
      getProjectOptions(projects, {
        retainIds: [session.initialValues.projectId, snapshot.projectId],
        language,
      }),
    [projects, session.initialValues.projectId, snapshot.projectId, language],
  );

  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [deleteSession, setDeleteSession] = useState<TaskDeleteSession | null>(
    null,
  );
  const {
    snapshot: deleteSnapshot,
    confirm: handleDelete,
    refresh: handleRefreshDelete,
    cancel: handleCancelDelete,
  } = useTaskDelete(deleteSession, {
    onCancel: () => setDeleteSession(null),
    onDeleted: () => {
      setDeleteSession(null);
      onClose();
    },
  });
  const [descHeight, setDescHeight] = useState<number>(() =>
    Math.max(
      100,
      Math.min(
        240,
        snapshot.description
          ? snapshot.description.split("\n").length * 24 + 40
          : 100,
      ),
    ),
  );
  const dragStartY = useRef<number>(0);
  const dragStartHeight = useRef<number>(100);
  const isDragging = useRef<boolean>(false);

  useEffect(() => {
    if (open) {
      setNewSubtaskTitle("");
      setDeleteSession(null);
    }
  }, [open, session]);

  useEffect(() => {
    if (open) {
      setDescHeight(
        Math.max(
          100,
          Math.min(
            240,
            snapshot.description
              ? snapshot.description.split("\n").length * 24 + 40
              : 100,
          ),
        ),
      );
    }
  }, [open, session, snapshot.description]);

  const startDrag = useCallback(
    (clientY: number) => {
      isDragging.current = true;
      dragStartY.current = clientY;
      dragStartHeight.current = descHeight;
    },
    [descHeight],
  );

  const moveDrag = useCallback((clientY: number) => {
    if (!isDragging.current) return;
    const delta = clientY - dragStartY.current;
    const next = Math.max(80, Math.min(600, dragStartHeight.current + delta));
    setDescHeight(next);
  }, []);

  const endDrag = useCallback(() => {
    isDragging.current = false;
  }, []);

  const resizeResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          evt.preventDefault();
          startDrag(evt.nativeEvent.pageY);
        },
        onPanResponderMove: (evt) => {
          moveDrag(evt.nativeEvent.pageY);
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: () => {
          endDrag();
        },
        onPanResponderTerminate: () => {
          endDrag();
        },
      }),
    [startDrag, moveDrag, endDrag],
  );

  useEffect(() => {
    const win = globalThis as unknown as {
      window?: {
        addEventListener?: (
          type: string,
          listener: (e: MouseEvent | TouchEvent) => void,
        ) => void;
        removeEventListener?: (
          type: string,
          listener: (e: MouseEvent | TouchEvent) => void,
        ) => void;
      };
    };
    if (!win.window?.addEventListener) return;

    interface DragEventLike {
      clientY?: number;
      touches?: ArrayLike<{ clientY: number }>;
    }

    const onMove = (e: DragEventLike) => {
      if (!isDragging.current) return;
      const clientY =
        e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
      if (typeof clientY === "number") {
        moveDrag(clientY);
      }
    };
    const onUp = () => {
      if (isDragging.current) {
        endDrag();
      }
    };

    win.window.addEventListener("mousemove", onMove as (e: unknown) => void);
    win.window.addEventListener("mouseup", onUp as (e: unknown) => void);
    win.window.addEventListener("touchmove", onMove as (e: unknown) => void);
    win.window.addEventListener("touchend", onUp as (e: unknown) => void);
    return () => {
      win.window?.removeEventListener?.(
        "mousemove",
        onMove as (e: unknown) => void,
      );
      win.window?.removeEventListener?.(
        "mouseup",
        onUp as (e: unknown) => void,
      );
      win.window?.removeEventListener?.(
        "touchmove",
        onMove as (e: unknown) => void,
      );
      win.window?.removeEventListener?.(
        "touchend",
        onUp as (e: unknown) => void,
      );
    };
  }, [endDrag, moveDrag]);

  const lanes = (propLanes ?? snapshot.lanes).filter(
    (lane) => !lane.isCompletionLane,
  );
  const isSaving = snapshot.isSaving;
  const isDeleteBusy = deleteSnapshot?.isBusy ?? false;
  const isBusy = isSaving || isDeleteBusy;
  const errorMessage = snapshot.error;
  const toast = useToast();

  const styles = useMemo(
    () => createTaskModalStyles(theme, layout.compact),
    [theme, layout.compact],
  );

  const handleAddSubtask = () => {
    const ok = session.addSubtask(newSubtaskTitle);
    if (ok) {
      setNewSubtaskTitle("");
    }
  };

  const handleSave = async () => {
    if (isDeleteBusy) return;
    const result = await session.save();
    if (result.success) {
      if (!result.unchanged) {
        toast.show(
          feedbackText.current(
            session.mode === "create"
              ? "notification.taskCreated"
              : "notification.taskUpdated",
          ),
          { variant: "success" },
        );
      }
      onClose();
    } else if (result.kind === "operation") {
      toast.error(feedbackText.current("notification.taskSaveFailed"));
    }
  };

  const handleOpenDeleteConfirm = () => {
    if (isBusy || session.mode !== "edit" || !snapshot.id) return;
    setDeleteSession(
      openTaskDeleteSession({
        taskId: snapshot.id,
        baseBoard: session.baseBoard,
        baseRevision: session.baseRevision,
        save,
        reload,
        language: () => feedbackLanguage.current,
      }),
    );
  };

  return (
    <BusinessDialog
      theme={theme}
      compact={layout.compact}
      viewportHeight={session.mode === "edit" ? 57 : undefined}
      scroll="contained"
      contentStyle={styles.modalBody}
      inputFocus
      canClose={() =>
        !session.getSnapshot().isSaving && !deleteSession?.getSnapshot().isBusy
      }
      title={
        session.mode === "edit"
          ? t("taskModal.titleEdit")
          : t("taskModal.titleCreate")
      }
      icon={
        <Icon name="PanelsTopLeft" size={18} color={theme.colors.foreground} />
      }
      open={open}
      onOpenChange={(next) => {
        if (!next && !isBusy) {
          onClose();
        }
      }}
    >
      <ScrollView
        nativeID="task-modal-root"
        testID="task-modal-root"
        style={styles.scrollBody}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {errorMessage && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("taskModal.titleLabel")}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("taskModal.titlePlaceholder")}
            placeholderTextColor={theme.colors.foregroundMuted}
            value={snapshot.title}
            onChangeText={(txt) => session.setTitle(txt)}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("taskModal.laneLabel")}</Text>
          <View style={styles.selectorRow}>
            {lanes.map((lane) => {
              const isSelected = lane.id === snapshot.laneId;
              return (
                <Pressable
                  key={lane.id}
                  onPress={() => session.setLaneId(lane.id)}
                  style={[
                    styles.optionChip,
                    isSelected && styles.optionChipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      isSelected && styles.optionChipTextSelected,
                    ]}
                  >
                    {lane.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <SettingsSelect
          label={t("taskModal.projectLabel")}
          value={snapshot.projectId ?? ""}
          options={[
            { value: "", label: t("taskModal.noProject") },
            ...projectOptions,
          ]}
          onValueChange={(id) => session.setProjectId(id || null)}
          disabled={isBusy || snapshot.source === "github_issue"}
        />

        {snapshot.source === "github_issue" && snapshot.externalUrl && (
          <IssueLink url={snapshot.externalUrl} theme={theme} />
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("taskModal.descLabel")}</Text>
          <View style={styles.descWrapper}>
            <TextInput
              style={[
                styles.multilineInput,
                { height: descHeight, paddingBottom: 22 },
              ]}
              multiline
              numberOfLines={3}
              placeholder={t("taskModal.descPlaceholder")}
              placeholderTextColor={theme.colors.foregroundMuted}
              value={snapshot.description}
              onChangeText={(txt) => session.setDescription(txt)}
            />
            <View
              style={styles.resizeHandle}
              {...resizeResponder.panHandlers}
              accessibilityRole="adjustable"
              accessibilityLabel="Resize description"
            >
              <View style={styles.resizeGripOuter}>
                <View style={styles.resizeGripInner} />
              </View>
            </View>
          </View>
        </View>

        {/* Subtasks Section */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            {t("taskModal.subtasksLabel", {
              completed: snapshot.subtasks.filter((s) => s.completed).length,
              total: snapshot.subtasks.length,
            })}
          </Text>

          {snapshot.subtasks.map((subtask) => (
            <View key={subtask.id} style={styles.subtaskItem}>
              <Pressable
                onPress={() =>
                  session.updateSubtask(subtask.id, {
                    completed: !subtask.completed,
                  })
                }
                style={[
                  styles.subtaskCheck,
                  subtask.completed && styles.subtaskCheckCompleted,
                ]}
              >
                {subtask.completed && (
                  <Icon
                    name="Check"
                    size={14}
                    color={theme.colors.accentForeground}
                  />
                )}
              </Pressable>

              <TextInput
                style={[
                  styles.subtaskInput,
                  subtask.completed && styles.subtaskInputCompleted,
                ]}
                value={subtask.title}
                onChangeText={(txt) =>
                  session.updateSubtask(subtask.id, { title: txt })
                }
                placeholder={t("taskModal.subtaskPlaceholder")}
                placeholderTextColor={theme.colors.foregroundMuted}
              />

              <Pressable
                onPress={() => session.removeSubtask(subtask.id)}
                hitSlop={8}
              >
                <Icon
                  name="Trash2"
                  size={14}
                  color={theme.colors.statusDanger}
                />
              </Pressable>
            </View>
          ))}

          <View style={styles.newSubtaskRow}>
            <TextInput
              style={[styles.input, styles.newSubtaskInput]}
              placeholder={t("taskModal.newSubtaskPlaceholder")}
              placeholderTextColor={theme.colors.foregroundMuted}
              value={newSubtaskTitle}
              onChangeText={(txt) => setNewSubtaskTitle(txt)}
              onSubmitEditing={handleAddSubtask}
            />
            <Pressable
              onPress={handleAddSubtask}
              style={[styles.optionChip, styles.addStepButton]}
            >
              <Text style={styles.optionChipText}>
                {t("taskModal.addStep")}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {/* Delete Task Section for Edit Mode */}
        {session.mode === "edit" && (
          <View style={styles.deleteSection}>
            {!deleteSnapshot ? (
              <Pressable
                onPress={handleOpenDeleteConfirm}
                style={styles.deleteButton}
                disabled={isBusy}
              >
                <Text style={styles.deleteButtonText}>
                  {t("taskModal.deleteTask")}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.deleteConfirmBox}>
                <View style={styles.deleteConfirmRow}>
                  <Text style={styles.errorText}>
                    {t("contextMenu.deleteConfirm", {
                      title: deleteSnapshot.title,
                    })}
                  </Text>
                  <Pressable
                    onPress={() => {
                      void handleDelete();
                    }}
                    style={[styles.deleteButton, styles.confirmDeleteButton]}
                    disabled={isBusy}
                  >
                    <Text
                      style={[
                        styles.deleteButtonText,
                        styles.confirmDeleteButtonText,
                      ]}
                    >
                      {t("taskModal.confirmDelete")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleCancelDelete}
                    disabled={isBusy}
                    style={[styles.optionChip, styles.cancelDeleteButton]}
                  >
                    <Text style={styles.optionChipText}>
                      {t("taskModal.cancel")}
                    </Text>
                  </Pressable>
                </View>
                {deleteSnapshot.error && (
                  <View style={styles.deleteConfirmRow}>
                    <Text style={styles.errorText}>{deleteSnapshot.error}</Text>
                    <Pressable
                      disabled={isBusy}
                      onPress={() => {
                        void handleRefreshDelete();
                      }}
                    >
                      <Text style={styles.refreshLinkText}>
                        {t("kanban.refresh")}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonRow}>
          <Pressable
            onPress={() => {
              if (!isBusy) onClose();
            }}
            style={styles.cancelButton}
            disabled={isBusy}
          >
            <Text style={styles.cancelButtonText}>{t("taskModal.cancel")}</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              void handleSave();
            }}
            style={[styles.saveButton, isBusy && styles.saveButtonDisabled]}
            disabled={isBusy}
          >
            <Text style={styles.saveButtonText}>
              {isSaving
                ? t("taskModal.saving")
                : session.mode === "edit"
                  ? t("taskModal.saveChanges")
                  : t("taskModal.submitCreate")}
            </Text>
          </Pressable>
        </View>
      </View>
    </BusinessDialog>
  );
}

function createTaskModalStyles(theme: PluginTheme, compact: boolean) {
  return StyleSheet.create({
    modalBody: {
      flex: 1,
      minHeight: 0,
    },
    scrollBody: {
      flex: 1,
      minHeight: 0,
    },
    container: {
      gap: compact ? 12 : 16,
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    fieldGroup: {
      gap: 6,
    },
    label: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.colors.foreground,
    },
    input: {
      backgroundColor: theme.colors.surface2,
      color: theme.colors.foreground,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
    },
    multilineInput: {
      backgroundColor: theme.colors.surface2,
      color: theme.colors.foreground,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      minHeight: 80,
      textAlignVertical: "top",
    },
    descWrapper: {
      position: "relative",
    },
    resizeHandle: {
      position: "absolute",
      right: 4,
      bottom: 4,
      width: 22,
      height: 22,
      alignItems: "flex-end",
      justifyContent: "flex-end",
      paddingRight: 4,
      paddingBottom: 4,
      cursor: "se-resize" as unknown as "pointer",
      zIndex: 3,
    },
    resizeGripOuter: {
      width: 10,
      height: 10,
      borderBottomWidth: 1.5,
      borderRightWidth: 1.5,
      borderColor: theme.colors.foregroundMuted,
      alignItems: "flex-end",
      justifyContent: "flex-end",
      opacity: 0.6,
    },
    resizeGripInner: {
      width: 5,
      height: 5,
      borderBottomWidth: 1.5,
      borderRightWidth: 1.5,
      borderColor: theme.colors.foregroundMuted,
      opacity: 0.6,
    },
    selectorRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    optionChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
    },
    optionChipSelected: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accent,
    },
    optionChipText: {
      fontSize: 13,
      color: theme.colors.foreground,
    },
    optionChipTextSelected: {
      color: theme.colors.accentForeground,
      fontWeight: "600",
    },
    subtaskItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    subtaskCheck: {
      width: 22,
      height: 22,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface2,
    },
    subtaskCheckCompleted: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    subtaskInput: {
      flex: 1,
      fontSize: 13,
      color: theme.colors.foreground,
      paddingVertical: 4,
    },
    subtaskInputCompleted: {
      textDecorationLine: "line-through",
      color: theme.colors.foregroundMuted,
    },
    newSubtaskRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 4,
    },
    newSubtaskInput: {
      flex: 1,
    },
    addStepButton: {
      backgroundColor: theme.colors.surface2,
      justifyContent: "center",
    },
    errorBanner: {
      backgroundColor: theme.colors.surface2,
      borderColor: theme.colors.statusDanger,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
    },
    errorText: {
      color: theme.colors.statusDanger,
      fontSize: 13,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      flexShrink: 0,
      gap: 10,
      paddingTop: 12,
      paddingHorizontal: 6,
      paddingBottom: 4,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    buttonRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
      marginLeft: "auto",
      flexShrink: 0,
    },
    cancelButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
    },
    cancelButtonText: {
      color: theme.colors.foreground,
      fontSize: 14,
    },
    saveButton: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: theme.colors.accent,
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      color: theme.colors.accentForeground,
      fontSize: 14,
      fontWeight: "600",
    },
    deleteSection: {
      flexDirection: "row",
      flexShrink: 1,
      alignItems: "center",
    },
    deleteButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: theme.colors.surface1,
      borderWidth: 1,
      borderColor: theme.colors.statusDanger,
    },
    deleteButtonText: {
      color: theme.colors.statusDanger,
      fontSize: 13,
      fontWeight: "500",
    },
    deleteConfirmBox: {
      gap: 8,
      flexShrink: 1,
    },
    deleteConfirmRow: {
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
      flexWrap: "wrap",
    },
    confirmDeleteButton: {
      backgroundColor: theme.colors.statusDanger,
    },
    confirmDeleteButtonText: {
      color: "#fff",
    },
    cancelDeleteButton: {
      backgroundColor: theme.colors.surface2,
    },
    refreshLinkText: {
      fontSize: 13,
      color: theme.colors.accent,
    },
  });
}
