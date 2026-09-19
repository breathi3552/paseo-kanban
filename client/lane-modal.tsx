import { useState, useEffect, useMemo, useSyncExternalStore } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Modal, TextInput, Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { LaneEditSession } from "./kanban-session";
import { useI18n } from "./i18n";

type PluginTheme = PluginSurfaceProps["theme"];

export interface LaneModalProps {
  open: boolean;
  onClose: () => void;
  session: LaneEditSession;
  theme: PluginTheme;
  layout: { compact: boolean };
}

export function LaneModal({
  open,
  onClose,
  session,
  theme,
  layout,
}: LaneModalProps) {
  const { t } = useI18n();
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setShowDeleteConfirm(false);
    }
  }, [open, session]);

  const canDelete = snapshot.canDelete;
  const isSaving = snapshot.isSaving;
  const errorMessage = snapshot.error;

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
    [theme, layout.compact],
  );

  const handleSave = async () => {
    const result = await session.save();
    if (result.success) {
      onClose();
    }
  };

  const handleDelete = async () => {
    const result = await session.deleteLane();
    if (result.success) {
      onClose();
    }
  };

  return (
    <Modal
      title={
        session.mode === "edit"
          ? t("laneModal.titleEdit")
          : t("laneModal.titleCreate")
      }
      icon={<Icon name="Columns3" size={18} color={theme.colors.foreground} />}
      open={open}
      onOpenChange={(next) => {
        if (!next && !isSaving) {
          onClose();
        }
      }}
    >
      <Modal.Content
        style={{ backgroundColor: theme.colors.surface0 }}
        contentContainerStyle={styles.container}
      >
        {errorMessage && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("laneModal.nameLabel")}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("laneModal.namePlaceholder")}
            placeholderTextColor={theme.colors.foregroundMuted}
            value={snapshot.title}
            onChangeText={(t) => session.setTitle(t)}
          />
        </View>

        {session.mode === "edit" && !canDelete && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              {snapshot.lanesCount <= 1
                ? t("laneModal.cannotDeleteLast")
                : t("laneModal.cannotDeleteHasTasks", {
                    count: snapshot.tasksInLaneCount,
                  })}
            </Text>
          </View>
        )}

        {/* Delete Lane Section for Edit Mode */}
        {session.mode === "edit" && canDelete && (
          <View style={styles.deleteSection}>
            {!showDeleteConfirm ? (
              <Pressable
                onPress={() => setShowDeleteConfirm(true)}
                style={styles.deleteButton}
                disabled={isSaving}
              >
                <Text style={styles.deleteButtonText}>
                  {t("laneModal.deleteLane")}
                </Text>
              </Pressable>
            ) : (
              <View
                style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
              >
                <Text
                  style={{ fontSize: 13, color: theme.colors.statusDanger }}
                >
                  {t("laneModal.confirmDeletePrompt")}
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
                    {t("laneModal.confirmDelete")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowDeleteConfirm(false)}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelButtonText}>
                    {t("laneModal.cancel")}
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
            <Text style={styles.cancelButtonText}>{t("laneModal.cancel")}</Text>
          </Pressable>

          <Pressable
            onPress={handleSave}
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            disabled={isSaving}
          >
            <Text style={styles.saveButtonText}>
              {isSaving
                ? t("laneModal.saving")
                : session.mode === "edit"
                  ? t("laneModal.saveChanges")
                  : t("laneModal.submitCreate")}
            </Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}
