import { useMemo, useEffect, useRef, type ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Platform,
  type ViewStyle,
} from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { KanbanTask } from "../shared/kanban";
import type { CardDragBinding } from "./kanban-drag";
import { useI18n } from "./i18n";
import {
  isCardControl,
  type CardContextEvent,
  type CardKeyEvent,
} from "./card-interaction";

type PluginTheme = PluginSurfaceProps["theme"];
export interface KanbanCardProps {
  task: KanbanTask;
  projectDisplayName: string | null;
  theme: PluginTheme;
  layout: { compact: boolean };
  binding: CardDragBinding;
  slideAnimation?: { seq: number; fromY: number };
  onSetCompleted?: (taskId: string, completed: boolean) => void;
  onSendToAgent?: (task: KanbanTask) => void;
  onContextMenu?: (taskId: string, point: { x: number; y: number }) => void;
  completionDisabled?: boolean;
  interactionDisabled?: boolean;
}

function CompletionIndicator({
  completed,
  theme,
}: {
  completed: boolean;
  theme: PluginTheme;
}) {
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderWidth: 1,
        borderRadius: 4,
        alignItems: "center",
        justifyContent: "center",
        borderColor: completed
          ? theme.colors.accent
          : theme.colors.foregroundMuted,
        backgroundColor: completed ? theme.colors.accent : "transparent",
      }}
    >
      {completed && (
        <Icon name="Check" size={14} color={theme.colors.accentForeground} />
      )}
    </View>
  );
}

/** Shared card text also keeps the drag preview's dimensions aligned with the card. */
function CardBody({
  task,
  projectDisplayName,
  theme,
  layout,
  send,
}: Pick<KanbanCardProps, "task" | "projectDisplayName" | "theme" | "layout"> & {
  send?: ReactNode;
}) {
  const { t } = useI18n();
  const count = task.subtasks.filter((step) => step.completed).length;
  return (
    <View style={{ flex: 1, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <Text
          numberOfLines={2}
          style={{
            flex: 1,
            fontSize: layout.compact ? 13 : 14,
            lineHeight: layout.compact ? 18 : 20,
            fontWeight: "600",
            color: theme.colors.foreground,
            userSelect: "none",
          }}
        >
          {task.title}
        </Text>
        {send}
      </View>
      {(projectDisplayName || task.subtasks.length > 0) && (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 6,
          }}
        >
          {projectDisplayName && (
            <View
              style={{
                backgroundColor: theme.colors.surface1,
                borderColor: theme.colors.border,
                borderWidth: 1,
                borderRadius: 4,
                paddingHorizontal: 6,
                paddingVertical: 2,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 11,
                  lineHeight: 14,
                  color: theme.colors.foregroundMuted,
                  fontWeight: "500",
                }}
              >
                {projectDisplayName}
              </Text>
            </View>
          )}
          {task.subtasks.length > 0 && (
            <View
              style={{
                backgroundColor: theme.colors.surface1,
                borderRadius: 4,
                paddingHorizontal: 6,
                paddingVertical: 2,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  lineHeight: 14,
                  fontWeight: "500",
                  color:
                    count === task.subtasks.length
                      ? (theme.colors.statusSuccess ?? theme.colors.accent)
                      : theme.colors.foregroundMuted,
                }}
              >
                {t("card.subtasksCount", {
                  completed: count,
                  total: task.subtasks.length,
                })}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export function KanbanCard({
  task,
  projectDisplayName,
  theme,
  layout,
  binding,
  slideAnimation,
  onSetCompleted,
  onSendToAgent,
  onContextMenu,
  completionDisabled = false,
  interactionDisabled = false,
}: KanbanCardProps) {
  const { t } = useI18n();
  const cardRef = useRef<View>(null);
  const bindingRef = useRef(binding);
  bindingRef.current = binding;
  const animTranslateY = useRef(new Animated.Value(0)).current;
  const lastSlideSeqRef = useRef(0);
  if (
    slideAnimation &&
    slideAnimation.seq !== lastSlideSeqRef.current &&
    !binding.isDragging
  ) {
    lastSlideSeqRef.current = slideAnimation.seq;
    animTranslateY.setValue(slideAnimation.fromY);
  }
  useEffect(() => {
    if (!slideAnimation || binding.isDragging) return;
    Animated.timing(animTranslateY, {
      toValue: 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [slideAnimation, binding.isDragging, animTranslateY]);
  useEffect(() => () => bindingRef.current.onUnmount?.(), []);
  const disabled = interactionDisabled || completionDisabled;
  const CardContainer =
    !binding.isDragging && slideAnimation ? Animated.View : View;
  const send = onSendToAgent ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("dispatch.title")}
      {...{ dataSet: { kanbanControl: "true" } }}
      disabled={disabled}
      onTouchStart={(event) => {
        binding.cardPanHandlers?.onTouchCancel?.(event);
        event.stopPropagation();
      }}
      onTouchEnd={(event) => event.stopPropagation()}
      style={{
        width: 20,
        height: layout.compact ? 18 : 20,
        alignItems: "center",
        justifyContent: "center",
      }}
      onPress={(event) => {
        event.stopPropagation();
        if (!disabled) onSendToAgent(task);
      }}
    >
      <Icon name="Send" size={16} color={theme.colors.accent} />
    </Pressable>
  ) : undefined;
  return (
    <View
      ref={cardRef}
      style={
        binding.isDragging
          ? { position: "absolute", left: 0, right: 0, opacity: 0 }
          : undefined
      }
      {...(interactionDisabled ? {} : binding.cardPanHandlers)}
      {...(Platform.OS === "web"
        ? {
            tabIndex: disabled ? -1 : 0,
            accessibilityLabel: t("card.actions", { title: task.title }),
            onContextMenu: (event: CardContextEvent) => {
              if (isCardControl(event)) return;
              event.preventDefault();
              event.stopPropagation();
              if (disabled || binding.isDragging) return;
              cardRef.current?.focus();
              onContextMenu?.(task.id, {
                x: event.nativeEvent?.clientX ?? 0,
                y: event.nativeEvent?.clientY ?? 0,
              });
            },
            onKeyDown: (event: CardKeyEvent) => {
              if (isCardControl(event) || event.isComposing) return;
              if (
                event.key !== "ContextMenu" &&
                !(event.key === "F10" && event.shiftKey)
              )
                return;
              event.preventDefault();
              event.stopPropagation();
              if (disabled || binding.isDragging) return;
              if (cardRef.current)
                cardRef.current.measureInWindow((x, y) =>
                  onContextMenu?.(task.id, { x, y }),
                );
              else onContextMenu?.(task.id, { x: 0, y: 0 });
            },
          }
        : {})}
      onLayout={(event) => {
        if (!binding.isDragging) binding.onLayout?.(event.nativeEvent.layout);
      }}
    >
      <CardContainer
        style={[
          {
            userSelect: "none",
            backgroundColor: theme.colors.surface2,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: 8,
            padding: layout.compact ? 10 : 12,
            gap: 8,
            flexDirection: "row",
            alignItems: "flex-start",
          },
          !binding.isDragging && slideAnimation
            ? { transform: [{ translateY: animTranslateY }] }
            : undefined,
        ]}
      >
        <Pressable
          {...{ dataSet: { kanbanControl: "true" } }}
          onTouchStart={(event) => {
            binding.cardPanHandlers?.onTouchCancel?.(event);
            event.stopPropagation();
          }}
          onTouchEnd={(event) => event.stopPropagation()}
          style={{
            padding: 8,
            margin: -6,
            opacity: completionDisabled ? 0.5 : 1,
          }}
          accessibilityRole="checkbox"
          accessibilityLabel={t(
            task.completed ? "card.reopenTask" : "card.completeTask",
            { title: task.title },
          )}
          accessibilityState={{
            checked: Boolean(task.completed),
            disabled: disabled || !onSetCompleted,
          }}
          disabled={disabled || !onSetCompleted}
          onPress={(event) => {
            event.stopPropagation();
            if (!disabled) onSetCompleted?.(task.id, !task.completed);
          }}
        >
          <CompletionIndicator
            completed={Boolean(task.completed)}
            theme={theme}
          />
        </Pressable>
        <CardBody
          task={task}
          projectDisplayName={projectDisplayName}
          theme={theme}
          layout={layout}
          send={send}
        />
      </CardContainer>
    </View>
  );
}

export function KanbanCardPreview({
  task,
  projectDisplayName,
  theme,
  layout,
  width,
  animated = false,
}: {
  task: KanbanTask;
  projectDisplayName: string | null;
  theme: PluginTheme;
  layout: { compact: boolean };
  width?: number;
  animated?: boolean;
}) {
  return (
    <View
      pointerEvents="none"
      style={
        {
          userSelect: "none",
          width: width && width > 0 ? width : layout.compact ? 250 : 280,
          backgroundColor: theme.colors.surface2,
          borderColor: theme.colors.accent,
          borderWidth: 2,
          borderRadius: 8,
          padding: layout.compact ? 10 : 12,
          gap: 8,
          flexDirection: "row",
          alignItems: "flex-start",
          ...(animated
            ? {}
            : { transform: [{ rotate: "2.5deg" }, { scale: 1.03 }] }),
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.25,
          shadowRadius: 10,
          elevation: 8,
        } as ViewStyle
      }
    >
      <View style={{ padding: 2 }}>
        <CompletionIndicator
          completed={Boolean(task.completed)}
          theme={theme}
        />
      </View>
      <CardBody
        task={task}
        projectDisplayName={projectDisplayName}
        theme={theme}
        layout={layout}
        send={
          <View
            style={{
              width: 20,
              height: layout.compact ? 18 : 20,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="Send" size={16} color={theme.colors.accent} />
          </View>
        }
      />
    </View>
  );
}

export function KanbanDropSpacer({
  height,
  animateFromZero = true,
  slideFromY = 0,
  theme,
  onLayout,
}: {
  height?: number;
  animateFromZero?: boolean;
  slideFromY?: number;
  theme: PluginTheme;
  onLayout?: (layout: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
}) {
  const targetHeight = height && height > 0 ? height : 64;
  const animHeight = useRef(
    new Animated.Value(animateFromZero ? 0 : targetHeight),
  ).current;
  const animTranslateY = useRef(new Animated.Value(slideFromY)).current;
  const prevTargetHeightRef = useRef(animateFromZero ? 0 : targetHeight);
  useEffect(() => {
    if (prevTargetHeightRef.current === targetHeight) {
      animHeight.setValue(targetHeight);
      return;
    }
    prevTargetHeightRef.current = targetHeight;
    Animated.timing(animHeight, {
      toValue: targetHeight,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [targetHeight, animHeight]);
  useEffect(() => {
    if (slideFromY)
      Animated.timing(animTranslateY, {
        toValue: 0,
        duration: 160,
        useNativeDriver: false,
      }).start();
  }, [slideFromY, animTranslateY]);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        spacer: {
          borderRadius: 8,
          borderWidth: 2,
          borderStyle: "dashed",
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.surface1,
          opacity: 0.7,
        },
      }),
    [theme],
  );
  return (
    <Animated.View
      style={[
        styles.spacer,
        slideFromY
          ? { height: animHeight, transform: [{ translateY: animTranslateY }] }
          : { height: animHeight },
      ]}
      pointerEvents="none"
      onLayout={(event) => onLayout?.(event.nativeEvent.layout)}
    />
  );
}
