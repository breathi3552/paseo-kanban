import { useRef, useSyncExternalStore } from "react";
import { useToast } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type {
  TaskDeleteSession,
  TaskDeleteSessionSnapshot,
} from "../session/kanban-session";
import { useI18n } from "../platform/i18n";
import { ConfirmDialog } from "../components/ui/confirm-dialog";

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
      toast.show(t("notification.taskDeleted"), {
        variant: "success",
      });
      callbacks.current.onDeleted();
    } else if (result.kind !== "busy") {
      toast.error(t("notification.taskDeleteFailed"));
    }
  };

  const refresh = async () => {
    if (!session) return;
    const result = await session.refresh();
    if (!result.success) {
      if (result.kind !== "busy") {
        toast.error(t("notification.taskDeleteFailed"));
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

  if (!snapshot) return null;

  return (
    <ConfirmDialog
      open
      title={t("contextMenu.delete")}
      description={t("contextMenu.deleteConfirm", { title: snapshot.title })}
      theme={theme}
      confirmLabel={t("taskModal.confirmDelete")}
      cancelLabel={t("taskModal.cancel")}
      loading={snapshot.isBusy}
      error={snapshot.error}
      retryLabel={t("kanban.refresh")}
      onRetry={() => {
        void refresh();
      }}
      onConfirm={confirm}
      onCancel={cancel}
    />
  );
}
