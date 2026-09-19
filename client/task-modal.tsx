import { useState, useEffect, useMemo, useSyncExternalStore } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import {
  Modal,
  TextInput,
  Icon,
  ScrollView,
} from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { KanbanLane } from "../shared/kanban";
import type { ProjectItem } from "./use-projects";
import type { TaskEditSession } from "./kanban-session";
import { useI18n } from "./i18n";

type PluginTheme = PluginSurfaceProps["theme"];

export interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  session: TaskEditSession;
  lanes?: KanbanLane[];
  projects: ProjectItem[];
  theme: PluginTheme;
  layout: { compact: boolean; platform: "ios" | "android" | "web" };
}

export function TaskModal({
  open,
  onClose,
  session,
  lanes: propLanes,
  projects,
  theme,
  layout,
}: TaskModalProps) {
  const { t } = useI18n();
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );

  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setNewSubtaskTitle("");
      setShowDeleteConfirm(false);
    }
  }, [open, session]);

  const lanes = propLanes ?? snapshot.lanes;
  const isSaving = snapshot.isSaving;
  const errorMessage = snapshot.error;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        modalBody: {
          flex: 1,
          minHeight: 0,
        },
        scrollBody: {
          flex: 1,
          minHeight: 0,
        },
        container: {
          gap: layout.compact ? 12 : 16,
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
        buttonRow: {
          flexDirection: "row",
          justifyContent: "flex-end",
          gap: 10,
          marginTop: 10,
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
          marginTop: 12,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          flexDirection: "row",
          justifyContent: "space-between",
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
      }),
    [theme, layout.compact],
  );

  const handleAddSubtask = () => {
    const ok = session.addSubtask(newSubtaskTitle);
    if (ok) {
      setNewSubtaskTitle("");
    }
  };

  const handleSave = async () => {
    const result = await session.save();
    if (result.success) {
      onClose();
    }
  };

  const handleDelete = async () => {
    const result = await session.deleteTask();
    if (result.success) {
      onClose();
    }
  };

  return (
    <Modal
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
        if (!next && !isSaving) {
          onClose();
        }
      }}
    >
      <Modal.Content
        scrollable={false}
        style={{ backgroundColor: theme.colors.surface0 }}
        contentContainerStyle={styles.modalBody}
      >
        <ScrollView
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
              onChangeText={(t) => session.setTitle(t)}
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

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("taskModal.projectLabel")}</Text>
            <View style={styles.selectorRow}>
              <Pressable
                onPress={() => session.setProjectId(null)}
                style={[
                  styles.optionChip,
                  snapshot.projectId === null && styles.optionChipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.optionChipText,
                    snapshot.projectId === null &&
                      styles.optionChipTextSelected,
                  ]}
                >
                  {t("taskModal.noProject")}
                </Text>
              </Pressable>
              {projects.map((proj) => {
                const isSelected = proj.projectId === snapshot.projectId;
                return (
                  <Pressable
                    key={proj.projectId}
                    onPress={() => session.setProjectId(proj.projectId)}
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
                      {proj.projectDisplayName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("taskModal.descLabel")}</Text>
            <TextInput
              style={styles.multilineInput}
              multiline
              numberOfLines={3}
              placeholder={t("taskModal.descPlaceholder")}
              placeholderTextColor={theme.colors.foregroundMuted}
              value={snapshot.description}
              onChangeText={(t) => session.setDescription(t)}
            />
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

            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={t("taskModal.newSubtaskPlaceholder")}
                placeholderTextColor={theme.colors.foregroundMuted}
                value={newSubtaskTitle}
                onChangeText={(t) => setNewSubtaskTitle(t)}
                onSubmitEditing={handleAddSubtask}
              />
              <Pressable
                onPress={handleAddSubtask}
                style={[
                  styles.optionChip,
                  {
                    backgroundColor: theme.colors.surface2,
                    justifyContent: "center",
                  },
                ]}
              >
                <Text style={styles.optionChipText}>
                  {t("taskModal.addStep")}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Delete Task Section for Edit Mode */}
          {session.mode === "edit" && (
            <View style={styles.deleteSection}>
              {!showDeleteConfirm ? (
                <Pressable
                  onPress={() => setShowDeleteConfirm(true)}
                  style={styles.deleteButton}
                  disabled={isSaving}
                >
                  <Text style={styles.deleteButtonText}>
                    {t("taskModal.deleteTask")}
                  </Text>
                </Pressable>
              ) : (
                <View
                  style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
                >
                  <Text
                    style={{ fontSize: 13, color: theme.colors.statusDanger }}
                  >
                    {t("taskModal.confirmDeletePrompt")}
                  </Text>
                  <Pressable
                    onPress={handleDelete}
                    style={[
                      styles.deleteButton,
                      { backgroundColor: theme.colors.statusDanger },
                    ]}
                    disabled={isSaving}
                  >
                    <Text style={[styles.deleteButtonText, { color: "#fff" }]}>
                      {t("taskModal.confirmDelete")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowDeleteConfirm(false)}
                    style={[
                      styles.optionChip,
                      { backgroundColor: theme.colors.surface2 },
                    ]}
                  >
                    <Text style={styles.optionChipText}>
                      {t("taskModal.cancel")}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <Pressable
              onPress={onClose}
              style={styles.cancelButton}
              disabled={isSaving}
            >
              <Text style={styles.cancelButtonText}>
                {t("taskModal.cancel")}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleSave}
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              disabled={isSaving}
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
        </ScrollView>
      </Modal.Content>
    </Modal>
  );
}
