import {
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentProps,
} from "react";
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
} from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { LaneEditSession } from "../session/lane-edit-session";
import { useI18n } from "../platform/i18n";
import { useLaneReorder } from "../session/use-lane-reorder";
import { BusinessDialog } from "./business-dialog";

interface Props {
  session: LaneEditSession;
  onClose: () => void;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
}

export function LaneManagementModal(props: Props) {
  const { t } = useI18n();
  const { session } = props;
  const { lanes, order, dirty, editing, title, error, deleteId, isSaving } =
    useSyncExternalStore(session.subscribe, session.getSnapshot);
  const displayed = order.map((id) => lanes.find((lane) => lane.id === id)!);
  const colors = props.theme.colors;
  const scrollRef = useRef<NativeScrollView>(null);
  const width = props.compact ? 156 : 160;
  const height = 180;
  const step = width + 12;
  const styles = useMemo(
    () => createLaneModalStyles(colors, props.compact, width, height),
    [colors, props.compact, width, height],
  );
  const reorder = useLaneReorder({
    ids: order,
    step,
    scrollRef,
    disabled: isSaving || editing !== null || deleteId !== null,
    onChange: session.previewOrder,
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
    const blocked = disabled || isSaving;
    return (
      <Pressable
        accessibilityState={{ disabled: blocked }}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          void onPress();
        }}
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
            style={[
              styles.buttonText,
              { color: textColor },
              filled && styles.buttonTextFilled,
            ]}
          >
            {display ?? label}
          </Text>
        )}
      </Pressable>
    );
  };
  const adding = editing?.kind === "add";
  const editor = (
    <TextInput
      autoFocus
      accessibilityLabel={t("laneModal.nameLabel")}
      value={title}
      editable={!isSaving}
      onChangeText={session.setTitle}
      style={styles.nameInput}
    />
  );
  const editorActions = (
    <>
      {action(
        t("laneManagement.confirm"),
        session.saveName,
        false,
        undefined,
        "primary",
        "Check",
      )}
      {action(
        t("laneModal.cancel"),
        session.cancelName,
        false,
        undefined,
        "secondary",
        "X",
      )}
    </>
  );
  const errorPanel = error && (
    <View>
      <Text accessibilityRole="alert" style={styles.errorText}>
        {error}
      </Text>
      {action(t("laneManagement.reload"), session.reload)}
    </View>
  );
  const dialogProps = {
    theme: props.theme,
    compact: props.compact,
    contentStyle: styles.dialogContent,
  };
  return (
    <>
      <BusinessDialog
        {...dialogProps}
        title={t("laneManagement.title")}
        maxWidth={1120}
        onOpenChange={(open) => {
          if (!open) props.onClose();
        }}
        actions={action(
          t("laneManagement.add"),
          session.beginAdd,
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
          onContentSizeChange={(contentWidth) => {
            reorder.onContentSizeChange(contentWidth);
            if (adding) scrollRef.current?.scrollTo({ x: 0, animated: true });
          }}
        >
          <View style={styles.row}>
            {adding && (
              <View style={[styles.lane, styles.addingLane]}>
                <View style={styles.grip}>
                  <Text style={styles.mutedSmallText}>
                    {t("laneModal.titleCreate")}
                  </Text>
                </View>
                <View style={styles.nameRow}>{editor}</View>
                <View style={styles.editActions}>{editorActions}</View>
                <View style={styles.laneActions} />
              </View>
            )}
            <View style={{ width: order.length * step - 12, height }}>
              {reorder.slot !== null && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.lane,
                    styles.slotPreview,
                    { left: reorder.slot * step },
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
                      styles.positionedLane,
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
                              style={styles.laneTitleText}
                            >
                              {lane.title}
                            </Text>
                          </View>
                          {action(
                            t("laneManagement.rename", { title: lane.title }),
                            () => session.beginRename(lane.id),
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
                        <Text style={styles.mutedSmallText}>
                          {t("laneManagement.completion")}
                        </Text>
                      ) : (
                        <>
                          {action(
                            t("laneManagement.left", { title: lane.title }),
                            () => session.move(index, -1),
                            index === 0 || editing !== null || reorder.active,
                            undefined,
                            "secondary",
                            "ArrowLeft",
                          )}
                          {action(
                            t("laneManagement.right", { title: lane.title }),
                            () => session.move(index, 1),
                            index === order.length - 2 ||
                              editing !== null ||
                              reorder.active,
                            undefined,
                            "secondary",
                            "ArrowRight",
                          )}
                          {action(
                            t("laneManagement.delete", { title: lane.title }),
                            () => session.remove(lane.id),
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
          </View>
        </ScrollView>
        {lanes.length <= 2 && (
          <Text style={styles.mutedSmallText}>
            {t("laneModal.cannotDeleteLast")}
          </Text>
        )}
        {dirty && (
          <>
            <Text style={styles.mutedText}>
              {t("laneManagement.orderPending")}
            </Text>
            <View style={styles.controls}>
              {action(
                t("laneManagement.saveOrder"),
                session.saveOrder,
                reorder.active,
                undefined,
                "primary",
              )}
              {action(
                t("laneManagement.restoreOrder"),
                session.restoreOrder,
                reorder.active,
              )}
            </View>
          </>
        )}
      </BusinessDialog>
      {deleteId && (
        <BusinessDialog
          {...dialogProps}
          title={t("laneManagement.deleteTitle")}
          onOpenChange={(open) => {
            if (!open) session.cancelDelete();
          }}
        >
          <Text style={styles.foregroundText}>
            {t("laneManagement.deletePrompt")}
          </Text>
          {errorPanel}
          <View style={styles.footer}>
            {action(t("laneModal.cancel"), session.cancelDelete)}
            {action(
              t("laneManagement.confirmDelete"),
              session.confirmDelete,
              false,
              undefined,
              "destructive",
            )}
          </View>
        </BusinessDialog>
      )}
    </>
  );
}

function createLaneModalStyles(
  colors: PluginSurfaceProps["theme"]["colors"],
  compact: boolean,
  width: number,
  height: number,
) {
  return StyleSheet.create({
    dialogContent: {
      padding: compact ? 12 : 20,
      gap: 12,
    },
    row: { flexDirection: "row", gap: 12, padding: 4 },
    lane: {
      minHeight: 180,
      borderWidth: 1,
      borderRadius: 10,
      padding: 10,
      gap: 6,
    },
    addingLane: {
      width,
      height,
      borderColor: colors.accent,
      backgroundColor: colors.surface1,
    },
    slotPreview: {
      position: "absolute",
      width,
      height,
      borderStyle: "dashed",
      borderColor: colors.accent,
      backgroundColor: colors.surface2,
    },
    positionedLane: {
      position: "absolute",
      left: 0,
      top: 0,
      height,
      width,
      backgroundColor: colors.surface1,
      borderColor: colors.border,
    },
    grip: { height: 24, alignItems: "center", justifyContent: "center" },
    nameRow: { height: 36, flexDirection: "row", alignItems: "center", gap: 6 },
    nameDisplay: {
      flex: 1,
      minWidth: 0,
      height: 36,
      justifyContent: "center",
    },
    laneTitleText: {
      color: colors.foreground,
      fontSize: 14,
      fontWeight: "600",
    },
    nameInput: {
      flex: 1,
      minWidth: 0,
      height: 36,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 6,
      fontSize: 14,
      color: colors.foreground,
      backgroundColor: colors.surface2,
      borderColor: colors.border,
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
    buttonText: {
      fontSize: 13,
      fontWeight: "400",
    },
    buttonTextFilled: {
      fontWeight: "600",
    },
    errorText: {
      color: colors.statusDanger,
    },
    mutedSmallText: {
      color: colors.foregroundMuted,
      fontSize: 12,
    },
    mutedText: {
      color: colors.foregroundMuted,
    },
    foregroundText: {
      color: colors.foreground,
    },
  });
}
