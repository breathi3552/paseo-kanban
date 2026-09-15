import { useState, useEffect, useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Modal, TextInput, Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { KanbanLane, KanbanTask, KanbanSubtask, KanbanBoard } from "../shared/kanban";
import type { ProjectItem } from "./use-projects";

type PluginTheme = PluginSurfaceProps["theme"];

export interface TaskSaveSession {
  mode: "create" | "edit";
  baseBoard: KanbanBoard;
  baseRevision: string;
  taskData: {
    id: string;
    title: string;
    description: string;
    laneId: string;
    projectId: string | null;
    subtasks: KanbanSubtask[];
  };
}

export interface TaskDeleteSession {
  baseBoard: KanbanBoard;
  baseRevision: string;
  taskId: string;
}

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  task: KanbanTask | null;
  baseBoard: KanbanBoard | null;
  baseRevision: string;
  defaultLaneId: string;
  defaultProjectId: string | null;
  lanes: KanbanLane[];
  projects: ProjectItem[];
  theme: PluginTheme;
  layout: { compact: boolean; platform: "ios" | "android" | "web" };
  onSave: (session: TaskSaveSession) => Promise<boolean>;
  onDelete?: (session: TaskDeleteSession) => Promise<boolean>;
}

export function TaskModal({
  open,
  onClose,
  mode,
  task,
  baseBoard,
  baseRevision,
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
      if (mode === "edit" && task) {
        setTitle(task.title);
        setDescription(task.description);
        setLaneId(task.laneId);
        setProjectId(task.projectId);
        setSubtasks(task.subtasks.map((s) => ({ ...s })));
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
  }, [open, mode, task, defaultLaneId, defaultProjectId]);

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
          backgroundColor: theme.colors.surface2,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        subtaskInputCompleted: {
          textDecorationLine: "line-through",
          color: theme.colors.foregroundMuted,
          opacity: 0.8,
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
    if (!trimmed) {
      setErrorMessage("新增子步骤内容不能为空");
      return;
    }
    const subtaskId = `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setSubtasks((prev) => [
      ...prev,
      { id: subtaskId, title: trimmed, completed: false },
    ]);
    setNewSubtaskTitle("");
    setErrorMessage(null);
  };

  const handleUpdateSubtaskTitle = (id: string, newText: string) => {
    setSubtasks((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: newText } : s))
    );
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

    for (let i = 0; i < subtasks.length; i++) {
      if (!subtasks[i].title.trim()) {
        setErrorMessage(`第 ${i + 1} 个子步骤标题不能为空，请修改或删除该步骤`);
        return;
      }
    }

    if (!baseBoard) {
      setErrorMessage("会话基准数据未就绪，无法保存");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const taskId =
      mode === "edit" && task
        ? task.id
        : `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const sanitizedSubtasks = subtasks.map((s) => ({
      id: s.id,
      title: s.title.trim(),
      completed: s.completed,
    }));

    const success = await onSave({
      mode,
      baseBoard,
      baseRevision,
      taskData: {
        id: taskId,
        title: trimmedTitle,
        description: description.trim(),
        laneId,
        projectId,
        subtasks: sanitizedSubtasks,
      },
    });

    setIsSaving(false);
    if (success) {
      onClose();
    } else {
      setErrorMessage("保存失败：数据已被修改或已被删除，存在版本冲突。草稿已保留，请核实后再试。");
    }
  };

  const handleDelete = async () => {
    if (!task || !onDelete || !baseBoard) return;
    setIsSaving(true);
    setErrorMessage(null);
    const success = await onDelete({
      baseBoard,
      baseRevision,
      taskId: task.id,
    });
    setIsSaving(false);
    if (success) {
      onClose();
    } else {
      setErrorMessage("删除失败：数据已被其他会话修改，存在版本冲突。");
    }
  };

  return (
    <Modal
      title={mode === "edit" ? "编辑任务" : "创建任务"}
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
              onChangeText={(t) => {
                setTitle(t);
                if (errorMessage) setErrorMessage(null);
              }}
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
            <Text style={styles.label}>
              子步骤 ({subtasks.filter((s) => s.completed).length}/{subtasks.length})
            </Text>
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
                <TextInput
                  style={[
                    styles.subtaskInput,
                    subtask.completed && styles.subtaskInputCompleted,
                  ]}
                  value={subtask.title}
                  onChangeText={(t) => handleUpdateSubtaskTitle(subtask.id, t)}
                  placeholder="子步骤标题"
                  placeholderTextColor={theme.colors.foregroundMuted}
                />
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

          {mode === "edit" && task && onDelete && (
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
