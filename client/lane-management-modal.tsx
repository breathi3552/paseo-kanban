import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  type ScrollView as NativeScrollView,
} from "react-native";
import {
  Modal,
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

interface Props {
  board: KanbanBoard;
  revision: string;
  settingsReady: boolean;
  focusLaneId?: string;
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
  const scrollRef = useRef<NativeScrollView>(null);
  const focusRef = useRef<View>(null);
  const colors = props.theme.colors;
  const width = props.compact ? 180 : 220;
  const step = width + 12;
  const focused = useRef(false);
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
    focus = false,
    display?: string,
  ) => (
    <Pressable
      ref={focus ? focusRef : undefined}
      accessibilityState={{
        selected: focus,
        disabled: disabled || request !== null,
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || request !== null}
      style={[
        styles.button,
        (disabled || request !== null) && { opacity: 0.4 },
      ]}
    >
      <Text
        numberOfLines={1}
        style={{ color: colors.foreground, fontSize: 14 }}
      >
        {display ?? label}
      </Text>
    </Pressable>
  );
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
  const editor = (
    <>
      <TextInput
        autoFocus
        accessibilityLabel={t("laneModal.nameLabel")}
        value={title}
        editable={request === null}
        onChangeText={setTitle}
        style={{
          color: colors.foreground,
          backgroundColor: colors.surface2,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 6,
          padding: 8,
          minHeight: 36,
        }}
      />
      {action(t("laneManagement.confirm"), () => {
        void saveName();
      })}
      {action(t("laneModal.cancel"), () => {
        setEditing(null);
        setError(null);
      })}
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
  return (
    <>
      <Modal
        title={t("laneManagement.title")}
        open
        onOpenChange={(open) => {
          if (!open && !busy.current) props.onClose();
        }}
      >
        <Modal.Content
          style={{ backgroundColor: colors.surface0 }}
          contentContainerStyle={{
            gap: props.compact ? 8 : 12,
            padding: props.compact ? 12 : 20,
          }}
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
              if (!focused.current && props.focusLaneId) {
                const index = order.indexOf(props.focusLaneId);
                if (index >= 0) {
                  scrollRef.current?.scrollTo({
                    x: index * step,
                    animated: false,
                  });
                  focusRef.current?.focus();
                  focused.current = true;
                }
              }
            }}
          >
            <View style={styles.row}>
              <View style={{ width: order.length * step - 12, height: 270 }}>
                {reorder.slot !== null && (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.lane,
                      {
                        position: "absolute",
                        width,
                        left: reorder.slot * step,
                        height: 270,
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
                  const rename = () => {
                    if (dirty || busy.current) return;
                    setEditing({ kind: "rename", id: lane.id });
                    setTitle(lane.title);
                    setError(null);
                  };
                  const binding =
                    !lane.isCompletionLane && !editingThis
                      ? reorder.bind(lane.id, rename)
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
                          height: 270,
                          width,
                          backgroundColor: colors.surface1,
                          borderColor:
                            lane.id === props.focusLaneId
                              ? colors.accent
                              : colors.border,
                        },
                        reorder.style(lane.id),
                      ]}
                    >
                      {/* Behind the controls, this catches every blank part of
                          the block without intercepting buttons or inputs. */}
                      {binding && (
                        <View
                          style={StyleSheet.absoluteFill}
                          accessibilityLabel={dragLabel}
                          {...binding}
                        />
                      )}
                      {editingThis ? (
                        editor
                      ) : (
                        <View
                          style={{ minHeight: 70, justifyContent: "center" }}
                          accessibilityLabel={dragLabel}
                          {...binding}
                        >
                          {action(
                            t("laneManagement.rename", { title: lane.title }),
                            binding?.onPress ?? rename,
                            dirty || reorder.active,
                            lane.id === props.focusLaneId,
                            lane.title,
                          )}
                        </View>
                      )}
                      {lane.isCompletionLane && (
                        <Text style={{ color: colors.foregroundMuted }}>
                          {t("laneManagement.completion")}
                        </Text>
                      )}
                      {!lane.isCompletionLane && (
                        <>
                          <View
                            pointerEvents="box-none"
                            style={styles.controls}
                          >
                            {action(
                              t("laneManagement.left", { title: lane.title }),
                              () => move(index, -1),
                              index === 0 || editing !== null || reorder.active,
                              false,
                              "←",
                            )}
                            {action(
                              t("laneManagement.right", { title: lane.title }),
                              () => move(index, 1),
                              index === order.length - 2 ||
                                editing !== null ||
                                reorder.active,
                              false,
                              "→",
                            )}
                            {action(
                              t("laneManagement.delete", { title: lane.title }),
                              () => remove(lane.id),
                              dirty || lanes.length <= 2 || reorder.active,
                              false,
                              t("laneManagement.deleteShort"),
                            )}
                          </View>
                          {lanes.length <= 2 && (
                            <Text
                              style={{
                                color: colors.foregroundMuted,
                                fontSize: 12,
                              }}
                            >
                              {t("laneModal.cannotDeleteLast")}
                            </Text>
                          )}
                        </>
                      )}
                    </Animated.View>
                  );
                })}
              </View>
              <View
                style={[
                  styles.lane,
                  {
                    width,
                    borderColor: colors.border,
                    backgroundColor: colors.surface1,
                  },
                ]}
              >
                {editing?.kind === "add"
                  ? editor
                  : action(
                      t("laneManagement.add"),
                      () => {
                        setEditing({ kind: "add" });
                        setTitle("");
                        setError(null);
                      },
                      dirty || reorder.active,
                    )}
              </View>
            </View>
          </ScrollView>
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
                )}
                {action(
                  t("laneManagement.restoreOrder"),
                  () => setOrder(lanes.map((lane) => lane.id)),
                  reorder.active,
                )}
              </View>
            </>
          )}
          {action(t("laneManagement.close"), props.onClose)}
        </Modal.Content>
      </Modal>
      {deleteId && (
        <Modal
          title={t("laneManagement.deleteTitle")}
          open
          onOpenChange={(open) => {
            if (!open && !busy.current) setDeleteId(null);
          }}
        >
          <Modal.Content
            style={{ backgroundColor: colors.surface0 }}
            contentContainerStyle={{ gap: 12 }}
          >
            <Text style={{ color: colors.foreground }}>
              {t("laneManagement.deletePrompt")}
            </Text>
            {errorPanel}
            {action(t("laneModal.cancel"), () => setDeleteId(null))}
            {action(t("laneManagement.confirmDelete"), () => {
              void remove(deleteId, true);
            })}
          </Modal.Content>
        </Modal>
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
    width: 220,
    minHeight: 150,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  button: { padding: 8, borderRadius: 6 },
});
