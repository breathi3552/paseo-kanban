import { useRef, useState, useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";
import { Modal, useToast } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { TaskEditSession } from "./kanban-session";
import { useI18n } from "./i18n";

export function TaskDeleteDialog({
  session,
  theme,
  onClose,
  onRefresh,
}: {
  session: TaskEditSession;
  theme: PluginSurfaceProps["theme"];
  onClose(): void;
  onRefresh(): Promise<void>;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const feedbackText = useRef(t);
  feedbackText.current = t;
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const colors = theme.colors;
  const [refreshing, setRefreshing] = useState(false);
  const busy = snapshot.isSaving || refreshing;
  const refresh = async () => {
    if (busy) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } catch {
      toast.error(feedbackText.current("notification.taskDeleteFailed"));
    } finally {
      setRefreshing(false);
    }
  };
  const remove = async () => {
    if (busy) return;
    const result = await session.deleteTask();
    if (result.success) {
      toast.show(feedbackText.current("notification.taskDeleted"), {
        variant: "success",
      });
      onClose();
    } else if (result.kind !== "busy")
      toast.error(feedbackText.current("notification.taskDeleteFailed"));
  };
  return (
    <Modal
      open
      title={t("contextMenu.delete")}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Modal.Content
        style={{ backgroundColor: colors.surface0 }}
        contentContainerStyle={{ padding: 20, gap: 16 }}
      >
        <Text style={{ color: colors.foreground }}>
          {t("contextMenu.deleteConfirm", { title: snapshot.title })}
        </Text>
        {snapshot.error && (
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.statusDanger }}>{snapshot.error}</Text>
            <Pressable
              disabled={busy}
              onPress={() => {
                void refresh();
              }}
            >
              <Text style={{ color: colors.accent }}>
                {t("kanban.refresh")}
              </Text>
            </Pressable>
          </View>
        )}
        <View
          style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}
        >
          <Pressable disabled={busy} onPress={onClose} style={{ padding: 8 }}>
            <Text style={{ color: colors.foreground }}>
              {t("taskModal.cancel")}
            </Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => {
              void remove();
            }}
            style={{
              padding: 8,
              backgroundColor: colors.statusDanger,
              borderRadius: 6,
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Text style={{ color: colors.accentForeground }}>
              {t("taskModal.confirmDelete")}
            </Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}
