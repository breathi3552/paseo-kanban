import { useEffect, useRef, useState, type ComponentProps } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  type ScrollView as NativeScrollView,
} from "react-native";
import {
  Icon,
  TextInput,
  ScrollView,
  useToast,
} from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  addLane,
  updateLane,
  deleteLane,
  reorderLanes,
  LaneTitleError,
  type KanbanBoard,
} from "../shared/kanban";
import type { SaveFn } from "./kanban-session";
import { useI18n } from "./i18n";
import { useLaneReorder } from "./use-lane-reorder";
import { LaneManagementDialog } from "./lane-management-dialog";

interface Props {
  board: KanbanBoard;
  revision: string;
  settingsReady: boolean;
  save: SaveFn;
  reload: () => Promise<void>;
  onClose: () => void;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
}

type NameEditor = { kind: "add" } | { kind: "rename"; id: string };

type Command =
  | { kind: "add"; id: string; title: string }
  | { kind: "rename"; id: string; title: string }
  | { kind: "delete"; id: string; confirmed: boolean }
  | { kind: "order"; ids: string[] }
  | { kind: "reload" };

export function LaneManagementModal(props: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const [lanes, setLanes] = useState(props.board.lanes);
  const [order, setOrder] = useState(props.board.lanes.map((lane) => lane.id));
  const dirty = order.some((id, index) => lanes[index]?.id !== id);
  const displayed = order.map((id) => lanes.find((lane) => lane.id === id)!);
  const [editing, setEditing] = useState<NameEditor | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [request, setRequest] = useState<{
    command: Command;
    attempt: number;
    failedRevision?: string;
  } | null>(null);
  const busy = useRef(false);
  const current = useRef({ props, t, toast, lanes });
  current.current = { props, t, toast, lanes };
  const colors = props.theme.colors;
  const scrollRef = useRef<NativeScrollView>(null);
  const width = props.compact ? 156 : 160;
  const height = 180;
  const step = width + 12;
  const reorder = useLaneReorder({
    ids: order,
    step,
    disabled: request !== null || editing !== null || deleteId !== null,
    onChange: setOrder,
  });
  const action = (
    label: string,
    onPress: () => void,
    disabled = false,
    display?: string,
    tone: "secondary" | "primary" | "danger" | "destructive" = "secondary",
    icon?: ComponentProps<typeof Icon>["name"],
  ) => {
    const filled = tone === "primary" || tone === "destructive";
    const danger = tone === "danger" || tone === "destructive";
    const textColor = filled
      ? colors.accentForeground
      : danger
        ? colors.statusDanger
        : colors.foreground;
    const blocked = disabled || request !== null;
    return (
      <Pressable
        accessibilityState={{ disabled: blocked }}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        disabled={blocked}
        style={({ pressed }) => [
          styles.button,
          {
            borderColor: danger
              ? colors.statusDanger
              : filled
                ? colors.accent
                : colors.border,
            backgroundColor:
              tone === "destructive"
                ? colors.statusDanger
                : filled
                  ? colors.accent
                  : colors.surface1,
          },
          icon && styles.iconButton,
          { opacity: blocked ? 0.4 : pressed ? 0.8 : 1 },
        ]}
      >
        {icon ? (
          <Icon name={icon} size={16} color={textColor} />
        ) : (
          <Text
            numberOfLines={1}
            style={{
              color: textColor,
              fontSize: 13,
              fontWeight: filled ? "600" : "400",
            }}
          >
            {display ?? label}
          </Text>
        )}
      </Pressable>
    );
  };
  const queue = (command: Command) => {
    if (busy.current) return;
    busy.current = true;
    setRequest({ command, attempt: 0 });
  };
  useEffect(() => {
    if (!request) return;
    let active = true;
    const finish = () => {
      busy.current = false;
      setRequest(null);
    };
    const run = async () => {
      const {
        props: latest,
        lanes: baseline,
        t: translate,
        toast: notify,
      } = current.current;
      const { command } = request;
      try {
        if (command.kind === "reload" && request.attempt === 0) {
          await latest.reload();
          if (active) setRequest({ command, attempt: 1 });
          return;
        }
        if (!latest.settingsReady)
          throw new Error(translate("notification.laneSaveFailed"));
        if (command.kind === "reload") {
          setLanes(latest.board.lanes);
          setOrder(latest.board.lanes.map((lane) => lane.id));
          setEditing(null);
          setTitle("");
          setDeleteId(null);
          setError(null);
          finish();
          return;
        }
        if (!sameLanes(baseline, latest.board.lanes))
          throw new Error(translate("laneManagement.conflict"));
        if (request.failedRevision === latest.revision)
          throw new Error(translate("notification.laneSaveFailed"));
        if (
          command.kind === "delete" &&
          !command.confirmed &&
          latest.board.tasks.some(
            (task) => !task.completed && task.laneId === command.id,
          )
        ) {
          setDeleteId(command.id);
          finish();
          return;
        }
        const next =
          command.kind === "add"
            ? addLane(latest.board, command)
            : command.kind === "rename"
              ? updateLane(latest.board, command.id, command)
              : command.kind === "delete"
                ? deleteLane(latest.board, command.id)
                : reorderLanes(latest.board, command.ids);
        const unchanged =
          command.kind === "rename" &&
          latest.board.lanes.find((lane) => lane.id === command.id)?.title ===
            command.title.trim();
        if (!unchanged && !(await latest.save(next, latest.revision))) {
          if (request.attempt >= 2)
            throw new Error(translate("notification.laneSaveFailed"));
          await latest.reload();
          if (active)
            setRequest({
              command,
              attempt: request.attempt + 1,
              failedRevision: latest.revision,
            });
          return;
        }
        if (!active) return;
        setLanes(next.lanes);
        setOrder(next.lanes.map((lane) => lane.id));
        setEditing(null);
        setTitle("");
        setDeleteId(null);
        setError(null);
        if (!unchanged)
          notify.show(
            translate(
              command.kind === "add"
                ? "notification.laneCreated"
                : command.kind === "rename"
                  ? "notification.laneRenamed"
                  : command.kind === "delete"
                    ? "notification.laneDeleted"
                    : "laneManagement.orderSaved",
            ),
            { variant: "success" },
          );
        finish();
      } catch (reason) {
        if (!active) return;
        if (reason instanceof LaneTitleError) {
          setError(
            translate(
              reason.reason === "empty"
                ? "laneManagement.empty"
                : "laneManagement.duplicate",
            ),
          );
        } else {
          setError(
            reason instanceof Error
              ? reason.message
              : translate("notification.laneSaveFailed"),
          );
          notify.error(
            translate(
              command.kind === "delete"
                ? "notification.laneDeleteFailed"
                : "notification.laneSaveFailed",
            ),
          );
        }
        finish();
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [request]);
  const saveName = () => {
    if (!editing) return;
    queue(
      editing.kind === "add"
        ? {
            kind: "add",
            id: `lane_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            title,
          }
        : { kind: "rename", id: editing.id, title },
    );
  };
  const remove = (id: string, confirmed = false) =>
    queue({ kind: "delete", id, confirmed });
  const move = (index: number, delta: number) => {
    const next = [...order];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setOrder(next);
  };
  const saveOrder = () => queue({ kind: "order", ids: order.slice(0, -1) });
  const adding = editing?.kind === "add";
  const beginAdd = () => {
    setEditing({ kind: "add" });
    setTitle("");
    setError(null);
  };
  const cancelName = () => {
    setEditing(null);
    setError(null);
  };
  const editor = (
    <TextInput
      autoFocus
      accessibilityLabel={t("laneModal.nameLabel")}
      value={title}
      editable={request === null}
      onChangeText={setTitle}
      style={[
        styles.nameInput,
        {
          color: colors.foreground,
          backgroundColor: colors.surface2,
          borderColor: colors.border,
        },
      ]}
    />
  );
  const editorActions = (
    <>
      {action(
        t("laneManagement.confirm"),
        saveName,
        false,
        undefined,
        "primary",
        "Check",
      )}
      {action(
        t("laneModal.cancel"),
        cancelName,
        false,
        undefined,
        "secondary",
        "X",
      )}
    </>
  );
  const errorPanel = error && (
    <View>
      <Text accessibilityRole="alert" style={{ color: colors.statusDanger }}>
        {error}
      </Text>
      {action(t("laneManagement.reload"), () => queue({ kind: "reload" }))}
    </View>
  );
  const dialogProps = { theme: props.theme, compact: props.compact };
  return (
    <>
      <LaneManagementDialog
        {...dialogProps}
        title={t("laneManagement.title")}
        wide
        onOpenChange={(open) => {
          if (!open && !busy.current) props.onClose();
        }}
        actions={action(
          t("laneManagement.add"),
          beginAdd,
          dirty || reorder.active || editing !== null,
        )}
      >
        {!deleteId && errorPanel}
        <ScrollView
          ref={scrollRef}
          horizontal
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!reorder.active}
          onScroll={(event) =>
            reorder.onScroll(event.nativeEvent.contentOffset.x)
          }
          scrollEventThrottle={16}
          onContentSizeChange={() => {
            if (adding) scrollRef.current?.scrollToEnd({ animated: true });
          }}
        >
          <View style={styles.row}>
            <View style={{ width: order.length * step - 12, height }}>
              {reorder.slot !== null && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.lane,
                    {
                      position: "absolute",
                      width,
                      left: reorder.slot * step,
                      height,
                      borderStyle: "dashed",
                      borderColor: colors.accent,
                      backgroundColor: colors.surface2,
                    },
                  ]}
                />
              )}
              {displayed.map((lane, index) => {
                const editingThis =
                  editing?.kind === "rename" && editing.id === lane.id;
                const binding =
                  !lane.isCompletionLane && !editingThis
                    ? reorder.bind(lane.id, () => {})
                    : undefined;
                const dragLabel = binding
                  ? t("laneManagement.reorder", { title: lane.title })
                  : undefined;
                return (
                  <Animated.View
                    key={lane.id}
                    style={[
                      styles.lane,
                      {
                        position: "absolute",
                        left: 0,
                        top: 0,
                        height,
                        width,
                        backgroundColor: colors.surface1,
                        borderColor: colors.border,
                      },
                      reorder.style(lane.id),
                    ]}
                  >
                    {/* The background handles blank space; foreground inputs and
                        buttons never participate in the drag responder. */}
                    {binding && (
                      <View
                        style={StyleSheet.absoluteFill}
                        accessibilityLabel={dragLabel}
                        {...binding}
                      />
                    )}
                    <View
                      style={styles.grip}
                      accessibilityLabel={dragLabel}
                      {...binding}
                    >
                      <Icon
                        name={
                          lane.isCompletionLane
                            ? "LockKeyhole"
                            : "GripHorizontal"
                        }
                        size={18}
                        color={colors.foregroundMuted}
                      />
                    </View>
                    <View pointerEvents="box-none" style={styles.nameRow}>
                      {editingThis ? (
                        editor
                      ) : (
                        <>
                          <View
                            style={styles.nameDisplay}
                            accessibilityLabel={dragLabel}
                            {...binding}
                          >
                            <Text
                              numberOfLines={1}
                              style={{
                                color: colors.foreground,
                                fontSize: 14,
                                fontWeight: "600",
                              }}
                            >
                              {lane.title}
                            </Text>
                          </View>
                          {action(
                            t("laneManagement.rename", { title: lane.title }),
                            () => {
                              setEditing({ kind: "rename", id: lane.id });
                              setTitle(lane.title);
                              setError(null);
                            },
                            dirty || reorder.active || editing !== null,
                            undefined,
                            "secondary",
                            "Pencil",
                          )}
                        </>
                      )}
                    </View>
                    {/* Always reserve this row: confirming/cancelling names must
                        never displace the lane's movement/delete controls. */}
                    <View pointerEvents="box-none" style={styles.editActions}>
                      {editingThis && editorActions}
                    </View>
                    <View pointerEvents="box-none" style={styles.laneActions}>
                      {lane.isCompletionLane ? (
                        <Text
                          style={{
                            color: colors.foregroundMuted,
                            fontSize: 12,
                          }}
                        >
                          {t("laneManagement.completion")}
                        </Text>
                      ) : (
                        <>
                          {action(
                            t("laneManagement.left", { title: lane.title }),
                            () => move(index, -1),
                            index === 0 || editing !== null || reorder.active,
                            undefined,
                            "secondary",
                            "ArrowLeft",
                          )}
                          {action(
                            t("laneManagement.right", { title: lane.title }),
                            () => move(index, 1),
                            index === order.length - 2 ||
                              editing !== null ||
                              reorder.active,
                            undefined,
                            "secondary",
                            "ArrowRight",
                          )}
                          {action(
                            t("laneManagement.delete", { title: lane.title }),
                            () => remove(lane.id),
                            dirty ||
                              lanes.length <= 2 ||
                              reorder.active ||
                              editing !== null,
                            undefined,
                            "danger",
                            "Trash2",
                          )}
                        </>
                      )}
                    </View>
                  </Animated.View>
                );
              })}
            </View>
            {adding && (
              <View
                style={[
                  styles.lane,
                  {
                    width,
                    height,
                    borderColor: colors.accent,
                    backgroundColor: colors.surface1,
                  },
                ]}
              >
                <View style={styles.grip}>
                  <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>
                    {t("laneModal.titleCreate")}
                  </Text>
                </View>
                <View style={styles.nameRow}>{editor}</View>
                <View style={styles.editActions}>{editorActions}</View>
                <View style={styles.laneActions} />
              </View>
            )}
          </View>
        </ScrollView>
        {lanes.length <= 2 && (
          <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>
            {t("laneModal.cannotDeleteLast")}
          </Text>
        )}
        {dirty && (
          <>
            <Text style={{ color: colors.foregroundMuted }}>
              {t("laneManagement.orderPending")}
            </Text>
            <View style={styles.controls}>
              {action(
                t("laneManagement.saveOrder"),
                saveOrder,
                reorder.active,
                undefined,
                "primary",
              )}
              {action(
                t("laneManagement.restoreOrder"),
                () => setOrder(lanes.map((lane) => lane.id)),
                reorder.active,
              )}
            </View>
          </>
        )}
      </LaneManagementDialog>
      {deleteId && (
        <LaneManagementDialog
          {...dialogProps}
          title={t("laneManagement.deleteTitle")}
          onOpenChange={(open) => {
            if (!open && !busy.current) setDeleteId(null);
          }}
        >
          <Text style={{ color: colors.foreground }}>
            {t("laneManagement.deletePrompt")}
          </Text>
          {errorPanel}
          <View style={styles.footer}>
            {action(t("laneModal.cancel"), () => setDeleteId(null))}
            {action(
              t("laneManagement.confirmDelete"),
              () => remove(deleteId, true),
              false,
              undefined,
              "destructive",
            )}
          </View>
        </LaneManagementDialog>
      )}
    </>
  );
}

function sameLanes(left: KanbanBoard["lanes"], right: KanbanBoard["lanes"]) {
  return (
    left.length === right.length &&
    left.every((lane, index) => {
      const other = right[index];
      return (
        lane.id === other.id &&
        lane.title === other.title &&
        lane.isCompletionLane === other.isCompletionLane
      );
    })
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, padding: 4 },
  lane: {
    minHeight: 180,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  grip: { height: 24, alignItems: "center", justifyContent: "center" },
  nameRow: { height: 36, flexDirection: "row", alignItems: "center", gap: 6 },
  nameDisplay: { flex: 1, minWidth: 0, height: 36, justifyContent: "center" },
  nameInput: {
    flex: 1,
    minWidth: 0,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
  },
  editActions: {
    height: 32,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 6,
  },
  laneActions: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  button: {
    minHeight: 32,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
  },
  iconButton: {
    width: 32,
    height: 32,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
});
