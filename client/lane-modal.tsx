import { useState, useEffect, useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Modal, TextInput, Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

type PluginTheme = PluginSurfaceProps["theme"];
import type { KanbanLane } from "../shared/kanban";

interface LaneModalProps {
  open: boolean;
  onClose: () => void;
  lane: KanbanLane | null;
  lanesCount: number;
  tasksInLaneCount: number;
  theme: PluginTheme;
  layout: { compact: boolean };
  onSave: (laneData: { id: string; title: string }) => Promise<boolean>;
  onDelete?: (laneId: string) => Promise<boolean>;
}

export function LaneModal({
  open,
  onClose,
  lane,
  lanesCount,
  tasksInLaneCount,
  theme,
  layout,
  onSave,
  onDelete,
}: LaneModalProps) {
  const [title, setTitle] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(lane ? lane.title : "");
      setErrorMessage(null);
      setIsSaving(false);
      setShowDeleteConfirm(false);
    }
  }, [open, lane]);

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
        warningBanner: {
          backgroundColor: theme.colors.surface2,
          borderColor: theme.colors.statusWarning ?? theme.colors.border,
          borderWidth: 1,
          borderRadius: 8,
          padding: 10,
        },
        warningText: {
          color: theme.colors.statusWarning ?? theme.colors.foreground,
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

  const canDelete = lanesCount > 1 && tasksInLaneCount === 0;

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage("泳道名称不能为空");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const laneId =
      lane?.id ??
      `lane_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const success = await onSave({
      id: laneId,
      title: trimmedTitle,
    });

    setIsSaving(false);
    if (success) {
      onClose();
    } else {
      setErrorMessage("保存失败：数据可能已被修改或存在冲突，请检查后再试");
    }
  };

  const handleDelete = async () => {
    if (!lane || !onDelete || !canDelete) return;
    setIsSaving(true);
    setErrorMessage(null);
    const success = await onDelete(lane.id);
    setIsSaving(false);
    if (success) {
      onClose();
    } else {
      setErrorMessage("删除失败：数据已被修改或存在冲突");
    }
  };

  return (
    <Modal
      title={lane ? "编辑泳道" : "添加泳道"}
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
            <Text style={styles.label}>泳道名称 *</Text>
            <TextInput
              style={styles.input}
              placeholder="例如：待测试、发布中"
              placeholderTextColor={theme.colors.foregroundMuted}
              value={title}
              onChangeText={setTitle}
              onSubmitEditing={handleSave}
            />
          </View>

          {lane && !canDelete && (
            <View style={styles.warningBanner}>
              {lanesCount <= 1 ? (
                <Text style={styles.warningText}>
                  看板必须至少保留一条泳道，无法删除最后一条泳道。
                </Text>
              ) : (
                <Text style={styles.warningText}>
                  当前泳道内仍有 {tasksInLaneCount} 个任务。请先将任务移动至其他泳道或删除任务，然后才能删除此泳道。
                </Text>
              )}
            </View>
          )}

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

          {lane && onDelete && (
            <View style={styles.deleteSection}>
              {canDelete ? (
                showDeleteConfirm ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Text style={{ color: theme.colors.statusDanger, fontSize: 13 }}>
                      确定删除该空泳道吗？
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
                    <Text style={styles.deleteButtonText}>删除泳道</Text>
                  </Pressable>
                )
              ) : (
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
                  受保护不可删除
                </Text>
              )}
            </View>
          )}
        </View>
      </Modal.Content>
    </Modal>
  );
}
