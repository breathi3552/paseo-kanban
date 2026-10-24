import { useMemo, useRef, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Modal, useToast } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type {
  TaskDeleteSession,
  TaskDeleteSessionSnapshot,
} from "../session/kanban-session";
import { useI18n } from "../platform/i18n";

const emptySubscribe = () => () => {};
const getNullSnapshot = () => null;

export function useTaskDelete(
  session: TaskDeleteSession | null,
  options: {
    onCancel(): void;
    onDeleted(): void;
  },
): {
  snapshot: TaskDeleteSessionSnapshot | null;
  confirm(): Promise<void>;
  refresh(): Promise<void>;
  cancel(): void;
} {
  const { t } = useI18n();
  const toast = useToast();
  const feedbackText = useRef(t);
  feedbackText.current = t;
  const callbacks = useRef(options);
  callbacks.current = options;

  const snapshot = useSyncExternalStore(
    session ? session.subscribe : emptySubscribe,
    session ? session.getSnapshot : getNullSnapshot,
    session ? session.getSnapshot : getNullSnapshot,
  );

  const confirm = async () => {
    if (!session) return;
    const result = await session.confirm();
    if (result.success) {
      toast.show(feedbackText.current("notification.taskDeleted"), {
        variant: "success",
      });
      callbacks.current.onDeleted();
    } else if (result.kind !== "busy") {
      toast.error(feedbackText.current("notification.taskDeleteFailed"));
    }
  };

  const refresh = async () => {
    if (!session) return;
    const result = await session.refresh();
    if (!result.success) {
      if (result.kind !== "busy") {
        toast.error(feedbackText.current("notification.taskDeleteFailed"));
      }
    } else if (result.targetDeleted) {
      callbacks.current.onCancel();
    }
  };

  const cancel = () => {
    if (!session) return;
    if (session.cancel()) {
      callbacks.current.onCancel();
    }
  };

  return {
    snapshot,
    confirm,
    refresh,
    cancel,
  };
}

export function TaskDeleteDialog({
  session,
  theme,
  onClose,
}: {
  session: TaskDeleteSession;
  theme: PluginSurfaceProps["theme"];
  onClose(): void;
}) {
  const { t } = useI18n();
  const { snapshot, confirm, refresh, cancel } = useTaskDelete(session, {
    onCancel: onClose,
    onDeleted: onClose,
  });
  const styles = useMemo(
    () => createTaskDeleteStyles(theme.colors),
    [theme.colors],
  );
  if (!snapshot) return null;
  const busy = snapshot.isBusy;
  return (
    <Modal
      open
      title={t("contextMenu.delete")}
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
    >
      <Modal.Content
        style={styles.modalSurface}
        contentContainerStyle={styles.modalContent}
      >
        <Text style={styles.promptText}>
          {t("contextMenu.deleteConfirm", { title: snapshot.title })}
        </Text>
        {snapshot.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{snapshot.error}</Text>
            <Pressable
              disabled={busy}
              onPress={() => {
                void refresh();
              }}
            >
              <Text style={styles.refreshText}>{t("kanban.refresh")}</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.actionsRow}>
          <Pressable
            disabled={busy}
            onPress={cancel}
            style={styles.cancelButton}
          >
            <Text style={styles.promptText}>{t("taskModal.cancel")}</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => {
              void confirm();
            }}
            style={[styles.confirmButton, busy && styles.confirmButtonBusy]}
          >
            <Text style={styles.confirmButtonText}>
              {t("taskModal.confirmDelete")}
            </Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}

function createTaskDeleteStyles(colors: PluginSurfaceProps["theme"]["colors"]) {
  return StyleSheet.create({
    modalSurface: {
      backgroundColor: colors.surface0,
    },
    modalContent: {
      padding: 20,
      gap: 16,
    },
    promptText: {
      color: colors.foreground,
    },
    errorBox: {
      gap: 8,
    },
    errorText: {
      color: colors.statusDanger,
    },
    refreshText: {
      color: colors.accent,
    },
    actionsRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 12,
    },
    cancelButton: {
      padding: 8,
    },
    confirmButton: {
      padding: 8,
      backgroundColor: colors.statusDanger,
      borderRadius: 6,
      opacity: 1,
    },
    confirmButtonBusy: {
      opacity: 0.5,
    },
    confirmButtonText: {
      color: colors.accentForeground,
    },
  });
}
