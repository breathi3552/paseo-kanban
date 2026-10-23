import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View, Platform, type ViewStyle } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { KanbanLane, KanbanTask } from "../shared/kanban";
import { WebMenuPortal } from "./web";
import { useI18n } from "./i18n";
import type { CardKeyEvent } from "./card-interaction";

export type TaskMenuAction =
  "edit" | "complete" | "copy" | "external" | "delete";
export interface TaskMenuTarget {
  taskId: string;
  x: number;
  y: number;
}
interface MenuElement {
  focus(): void;
  querySelectorAll(selector: string): ArrayLike<MenuElement>;
  contains(node: unknown): boolean;
}
declare const document: { activeElement: MenuElement | null };
declare const window: { innerWidth: number; innerHeight: number };

interface Props {
  target: TaskMenuTarget;
  task: KanbanTask;
  lanes: KanbanLane[];
  copyReady: boolean;
  theme: PluginSurfaceProps["theme"];
  onDismiss(): void;
  onAction(action: TaskMenuAction): void;
  onMove(laneId: string): void;
}

export function TaskContextMenu({
  target,
  task,
  lanes,
  copyReady,
  theme,
  onDismiss,
  onAction,
  onMove,
}: Props) {
  const { t } = useI18n();
  const [submenu, setSubmenu] = useState(false);
  const [mainSize, setMainSize] = useState({ width: 240, height: 214 });
  const [subSize, setSubSize] = useState({ width: 220, height: 120 });
  const [moveY, setMoveY] = useState(64);
  const mainRef = useRef<View>(null);
  const subRef = useRef<View>(null);
  const moveRef = useRef<View>(null);
  const focusSubmenu = useRef(false);
  const colors = theme.colors;
  const viewport =
    typeof window === "undefined"
      ? { width: 1000, height: 800 }
      : { width: window.innerWidth, height: window.innerHeight };
  const margin = 8;
  const width = Math.max(1, Math.min(240, viewport.width - margin * 2));
  const subWidth = Math.max(1, Math.min(220, viewport.width - margin * 2));
  const maxHeight = Math.max(1, viewport.height - margin * 2);
  const left = Math.max(
    margin,
    Math.min(target.x, viewport.width - mainSize.width - margin),
  );
  const top = Math.max(
    margin,
    Math.min(target.y, viewport.height - mainSize.height - margin),
  );
  const subLeft =
    left + mainSize.width + subWidth <= viewport.width - margin
      ? left + mainSize.width - 2
      : Math.max(margin, left - subWidth + 2);
  const subTop = Math.max(
    margin,
    Math.min(top + moveY, viewport.height - subSize.height - margin),
  );
  const currentLane = task.completed
    ? lanes.find((lane) => lane.isCompletionLane)?.id
    : task.laneId;
  const destinations = lanes.filter((lane) => lane.id !== currentLane);
  const root = (ref: typeof mainRef) =>
    ref.current as unknown as MenuElement | null;
  useEffect(() => {
    if (submenu && focusSubmenu.current) {
      root(subRef)?.querySelectorAll('[role="menuitem"]')[0]?.focus();
      focusSubmenu.current = false;
    }
  }, [submenu]);
  if (Platform.OS !== "web") return null;

  const enterSubmenu = () => {
    if (submenu)
      root(subRef)?.querySelectorAll('[role="menuitem"]')[0]?.focus();
    else {
      focusSubmenu.current = true;
      setSubmenu(true);
    }
  };
  const keydown = (event: CardKeyEvent, sub = false) => {
    if (event.isComposing) return;
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
      onDismiss();
      return;
    }
    if (sub && event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      setSubmenu(false);
      moveRef.current?.focus();
      return;
    }
    if (
      event.key === "ArrowRight" &&
      !sub &&
      root(moveRef)?.contains(event.target)
    ) {
      event.preventDefault();
      event.stopPropagation();
      enterSubmenu();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const items = Array.from(
      root(sub ? subRef : mainRef)?.querySelectorAll(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ) ?? [],
    );
    const active =
      typeof document === "undefined" ? null : document.activeElement;
    const index = items.indexOf(active as MenuElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
            items.length;
    items[next]?.focus();
  };
  const panelStyle = (x: number, y: number, panelWidth: number): ViewStyle => ({
    position: "absolute",
    left: x,
    top: y,
    width: panelWidth,
    maxHeight,
    padding: 4,
    backgroundColor: colors.surface1,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 6,
    overflow: "auto" as "scroll",
    pointerEvents: "auto",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  });
  const divider = (
    <View
      style={{ height: 1, marginVertical: 4, backgroundColor: colors.border }}
    />
  );
  const item = (
    label: string,
    icon: string,
    action: () => void,
    options: {
      disabled?: boolean;
      danger?: boolean;
      move?: boolean;
      destination?: boolean;
    } = {},
  ) => (
    <Pressable
      key={label}
      ref={options.move ? moveRef : undefined}
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      disabled={options.disabled}
      accessibilityState={{
        disabled: Boolean(options.disabled),
        ...(options.move ? { expanded: submenu } : {}),
      }}
      {...(options.move ? { "aria-haspopup": "menu" as const } : {})}
      tabIndex={options.disabled ? -1 : 0}
      onLayout={
        options.move
          ? (event) => setMoveY(event.nativeEvent.layout.y)
          : undefined
      }
      onHoverIn={
        options.destination
          ? undefined
          : () => setSubmenu(Boolean(options.move))
      }
      onPress={action}
      style={({
        hovered,
        pressed,
      }: {
        hovered?: boolean;
        pressed: boolean;
      }) => ({
        minHeight: 28,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 4,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        opacity: options.disabled ? 0.5 : 1,
        backgroundColor:
          hovered || pressed || (options.move && submenu)
            ? colors.surface2
            : "transparent",
      })}
    >
      <Icon
        name={icon}
        size={16}
        color={options.danger ? colors.statusDanger : colors.foregroundMuted}
      />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontSize: 13,
          color: options.danger ? colors.statusDanger : colors.foreground,
        }}
      >
        {label}
      </Text>
      {options.move && (
        <Icon name="ChevronRight" size={14} color={colors.foregroundMuted} />
      )}
    </Pressable>
  );
  const run = (action: TaskMenuAction) => {
    onDismiss();
    onAction(action);
  };
  return (
    <WebMenuPortal onDismiss={onDismiss}>
      <View
        ref={mainRef}
        accessibilityRole="menu"
        accessibilityLabel={t("card.actions", { title: task.title })}
        style={panelStyle(left, top, width)}
        {...{ onKeyDown: (event: CardKeyEvent) => keydown(event) }}
        onLayout={(event) =>
          setMainSize({
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height,
          })
        }
      >
        {item(t("contextMenu.edit"), "FileText", () => run("edit"))}
        {divider}
        {item(
          t(task.completed ? "contextMenu.reopen" : "contextMenu.complete"),
          task.completed ? "RotateCcw" : "CheckCircle2",
          () => run("complete"),
        )}
        {item(t("contextMenu.move"), "ArrowRightLeft", enterSubmenu, {
          move: true,
        })}
        {divider}
        {item(t("contextMenu.copy"), "Copy", () => run("copy"), {
          disabled: !copyReady,
        })}
        {task.source === "github_issue" &&
          task.externalUrl &&
          item(t("external.open"), "ExternalLink", () => run("external"))}
        {divider}
        {item(t("contextMenu.delete"), "Trash2", () => run("delete"), {
          danger: true,
        })}
      </View>
      {submenu && (
        <View
          ref={subRef}
          accessibilityRole="menu"
          accessibilityLabel={t("contextMenu.move")}
          style={panelStyle(subLeft, subTop, subWidth)}
          {...{ onKeyDown: (event: CardKeyEvent) => keydown(event, true) }}
          onLayout={(event) =>
            setSubSize({
              width: event.nativeEvent.layout.width,
              height: event.nativeEvent.layout.height,
            })
          }
        >
          {destinations.map((lane) =>
            item(
              lane.title,
              lane.isCompletionLane ? "CheckCircle2" : "Columns3",
              () => {
                onDismiss();
                onMove(lane.id);
              },
              { destination: true },
            ),
          )}
        </View>
      )}
    </WebMenuPortal>
  );
}
