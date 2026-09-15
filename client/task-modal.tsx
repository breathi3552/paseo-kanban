import { useState, useEffect, useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Modal, TextInput, Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

type PluginTheme = PluginSurfaceProps["theme"];
import type { KanbanLane, KanbanTask, KanbanSubtask } from "../shared/kanban";
import type { ProjectItem } from "./use-projects";

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  task: KanbanTask | null;
  defaultLaneId: string;
  defaultProjectId: string | null;
  lanes: KanbanLane[];
  projects: ProjectItem[];
  theme: PluginTheme;
  layout: { compact: boolean; platform: "ios" | "android" | "web" };
  onSave: (taskData: {
    id: string;
    title: string;
    description: string;
    laneId: string;
    projectId: string | null;
    subtasks: KanbanSubtask[];
  }) => Promise<boolean>;
  onDelete?: (taskId: string) => Promise<boolean>;
}

export function TaskModal({
  open,
  onClose,
  task,
  defaultLaneId,
  defaultProjectId,
  lanes,
  projects,
  theme,
  layout,
  onSave,
  onDelete,
}: TaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [laneId, setLaneId] = useState(defaultLaneId);
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId);
  const [subtasks, setSubtasks] = useState<KanbanSubtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      if (task) {
        setTitle(task.title);
        setDescription(task.description);
        setLaneId(task.laneId);
        setProjectId(task.projectId);
        setSubtasks([...task.subtasks]);
      } else {
        setTitle("");
        setDescription("");
        setLaneId(defaultLaneId);
        setProjectId(defaultProjectId);
        setSubtasks([]);
      }
      setNewSubtaskTitle("");
      setErrorMessage(null);
      setShowDeleteConfirm(false);
      setIsSaving(false);
    }
  }, [open, task, defaultLaneId, defaultProjectId]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
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
          width: 20,
          height: 20,
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
        subtaskTitle: {
          flex: 1,
          fontSize: 13,
          color: theme.colors.foreground,
        },
        subtaskTitleCompleted: {
          textDecorationLine: "line-through",
          color: theme.colors.foregroundMuted,
        },
        subtaskDeleteBtn: {
          paddingHorizontal: 8,
          paddingVertical: 4,
        },
        subtaskDeleteText: {
          fontSize: 12,
          color: theme.colors.statusDanger,
        },
        addSubtaskRow: {
          flexDirection: "row",
          gap: 8,
          marginTop: 6,
        },
        addSubtaskInput: {
          flex: 1,
          backgroundColor: theme.colors.surface2,
          color: theme.colors.foreground,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: 6,
          paddingHorizontal: 10,
          paddingVertical: 6,
          fontSize: 13,
        },
        smallButton: {
          backgroundColor: theme.colors.accent,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 6,
          alignItems: "center",
          justifyContent: "center",
        },
        smallButtonText: {
          color: theme.colors.accentForeground,
          fontSize: 13,
          fontWeight: "600",
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
    [theme, layout.compact]
  );

  const handleAddSubtask = () => {
    const trimmed = newSubtaskTitle.trim();
    if (!trimmed) return;
    const subtaskId = `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setSubtasks((prev) => [
      ...prev,
      { id: subtaskId, title: trimmed, completed: false },
    ]);
    setNewSubtaskTitle("");
  };

  const handleToggleSubtask = (id: string) => {
    setSubtasks((prev) =>
      prev.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s))
    );
  };

  const handleDeleteSubtask = (id: string) => {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage("任务标题不能为空");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const taskId =
      task?.id ??
      `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const success = await onSave({
      id: taskId,
      title: trimmedTitle,
      description: description.trim(),
      laneId,
      projectId,
      subtasks,
    });

    setIsSaving(false);
    if (success) {
      onClose();
    } else {
      setErrorMessage("保存失败：数据可能已被修改或存在冲突，请检查后再试");
    }
  };

  const handleDelete = async () => {
    if (!task || !onDelete) return;
    setIsSaving(true);
    setErrorMessage(null);
    const success = await onDelete(task.id);
    setIsSaving(false);
    if (success) {
      onClose();
    } else {
      setErrorMessage("删除失败：数据已被修改或存在冲突");
    }
  };

  return (
    <Modal
      title={task ? "编辑任务" : "创建任务"}
      icon={<Icon name="PanelsTopLeft" size={18} color={theme.colors.foreground} />}
      open={open}
      onOpenChange={(next) => {
        if (!next && !isSaving) onClose();
      }}
    >
      <Modal.Content style={{ backgroundColor: theme.colors.surface0 }}>
        <View style={styles.container}>
          {errorMessage && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>任务标题 *</Text>
            <TextInput
              style={styles.input}
              placeholder="输入任务标题"
              placeholderTextColor={theme.colors.foregroundMuted}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>所属泳道</Text>
            <View style={styles.selectorRow}>
              {lanes.map((lane) => {
                const isSelected = lane.id === laneId;
                return (
                  <Pressable
                    key={lane.id}
                    onPress={() => setLaneId(lane.id)}
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
            <Text style={styles.label}>关联项目</Text>
            <View style={styles.selectorRow}>
              <Pressable
                onPress={() => setProjectId(null)}
                style={[
                  styles.optionChip,
                  projectId === null && styles.optionChipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.optionChipText,
                    projectId === null && styles.optionChipTextSelected,
                  ]}
                >
                  未关联项目
                </Text>
              </Pressable>
              {projects.map((proj) => {
                const isSelected = proj.projectId === projectId;
                return (
                  <Pressable
                    key={proj.projectId}
                    onPress={() => setProjectId(proj.projectId)}
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
            <Text style={styles.label}>详细描述</Text>
            <TextInput
              style={styles.multilineInput}
              placeholder="添加详细任务描述（支持换行）"
              placeholderTextColor={theme.colors.foregroundMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>子步骤 ({subtasks.filter((s) => s.completed).length}/{subtasks.length})</Text>
            {subtasks.map((subtask) => (
              <View key={subtask.id} style={styles.subtaskItem}>
                <Pressable
                  onPress={() => handleToggleSubtask(subtask.id)}
                  style={[
                    styles.subtaskCheck,
                    subtask.completed && styles.subtaskCheckCompleted,
                  ]}
                >
                  {subtask.completed && (
                    <Icon name="Check" size={12} color={theme.colors.accentForeground} />
                  )}
                </Pressable>
                <Text
                  style={[
                    styles.subtaskTitle,
                    subtask.completed && styles.subtaskTitleCompleted,
                  ]}
                >
                  {subtask.title}
                </Text>
                <Pressable
                  onPress={() => handleDeleteSubtask(subtask.id)}
                  style={styles.subtaskDeleteBtn}
                >
                  <Text style={styles.subtaskDeleteText}>删除</Text>
                </Pressable>
              </View>
            ))}

            <View style={styles.addSubtaskRow}>
              <TextInput
                style={styles.addSubtaskInput}
                placeholder="新增子步骤内容"
                placeholderTextColor={theme.colors.foregroundMuted}
                value={newSubtaskTitle}
                onChangeText={setNewSubtaskTitle}
                onSubmitEditing={handleAddSubtask}
              />
              <Pressable onPress={handleAddSubtask} style={styles.smallButton}>
                <Text style={styles.smallButtonText}>添加</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.buttonRow}>
            <Pressable onPress={onClose} style={styles.cancelButton} disabled={isSaving}>
              <Text style={styles.cancelButtonText}>取消</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              disabled={isSaving}
            >
              <Text style={styles.saveButtonText}>{isSaving ? "保存中..." : "保存"}</Text>
            </Pressable>
          </View>

          {task && onDelete && (
            <View style={styles.deleteSection}>
              {showDeleteConfirm ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text style={{ color: theme.colors.statusDanger, fontSize: 13 }}>
                    确定删除该任务吗？
                  </Text>
                  <Pressable
                    onPress={handleDelete}
                    style={[styles.deleteButton, { backgroundColor: theme.colors.statusDanger }]}
                    disabled={isSaving}
                  >
                    <Text style={{ color: theme.colors.accentForeground, fontSize: 13, fontWeight: "600" }}>
                      确认删除
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowDeleteConfirm(false)}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelButtonText}>取消</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => setShowDeleteConfirm(true)}
                  style={styles.deleteButton}
                >
                  <Text style={styles.deleteButtonText}>删除任务</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </Modal.Content>
    </Modal>
  );
}
