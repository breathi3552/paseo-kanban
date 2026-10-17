import { useMemo, useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Animated } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { KanbanTask } from "../shared/kanban";
import type { CardDragBinding } from "./kanban-drag";
import { useI18n } from "./i18n";
import { IssueLink } from "./issue-link";

type PluginTheme = PluginSurfaceProps["theme"];

export interface KanbanCardProps {
  task: KanbanTask;
  projectDisplayName: string | null;
  theme: PluginTheme;
  layout: { compact: boolean };
  binding: CardDragBinding;
  slideAnimation?: { seq: number; fromY: number };
  onSetCompleted?: (taskId: string, completed: boolean) => void;
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

export function KanbanCard({
  task,
  projectDisplayName,
  theme,
  layout,
  binding,
  slideAnimation,
  onSetCompleted,
  completionDisabled = false,
  interactionDisabled = false,
}: KanbanCardProps) {
  const { t } = useI18n();
  const bindingRef = useRef(binding);
  bindingRef.current = binding;
  const animTranslateY = useRef(
    Animated?.Value ? new Animated.Value(0) : null,
  ).current;
  const lastSlideSeqRef = useRef(0);

  if (
    slideAnimation &&
    animTranslateY &&
    slideAnimation.seq !== lastSlideSeqRef.current &&
    !binding.isDragging
  ) {
    lastSlideSeqRef.current = slideAnimation.seq;
    animTranslateY.setValue(slideAnimation.fromY);
  }

  useEffect(() => {
    if (!slideAnimation || !animTranslateY || binding.isDragging) {
      return;
    }
    Animated.timing(animTranslateY, {
      toValue: 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [slideAnimation, binding.isDragging, animTranslateY]);

  useEffect(() => {
    return () => {
      bindingRef.current.onUnmount?.();
    };
  }, []);

  const completedSubtasksCount = useMemo(
    () => task.subtasks.filter((s) => s.completed).length,
    [task.subtasks],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
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
        cardBody: {
          flex: 1,
          gap: 8,
        },
        completionControl: {
          padding: 2,
          opacity: completionDisabled ? 0.5 : 1,
        },
        cardHeader: {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 6,
        },
        dragHandle: {
          paddingHorizontal: 2,
          paddingVertical: 2,
          justifyContent: "center",
          alignItems: "center",
        },
        title: {
          flex: 1,
          fontSize: layout.compact ? 13 : 14,
          fontWeight: "600",
          color: theme.colors.foreground,
          userSelect: "none",
        },
        badgeRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
        },
        projectBadge: {
          backgroundColor: theme.colors.surface1,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: 4,
          paddingHorizontal: 6,
          paddingVertical: 2,
        },
        projectBadgeText: {
          fontSize: 11,
          color: theme.colors.foregroundMuted,
          fontWeight: "500",
        },
        subtaskBadge: {
          backgroundColor: theme.colors.surface1,
          borderRadius: 4,
          paddingHorizontal: 6,
          paddingVertical: 2,
        },
        subtaskBadgeText: {
          fontSize: 11,
          color:
            task.subtasks.length > 0 &&
            completedSubtasksCount === task.subtasks.length
              ? (theme.colors.statusSuccess ?? theme.colors.accent)
              : theme.colors.foregroundMuted,
          fontWeight: "500",
        },
      }),
    [
      theme,
      layout.compact,
      task.subtasks.length,
      completedSubtasksCount,
      completionDisabled,
    ],
  );

  const CardContainer =
    !binding.isDragging && slideAnimation && animTranslateY
      ? Animated.View
      : View;

  return (
    <View
      // Keep the responder mounted, but let the single drop slot replace its space.
      style={
        binding.isDragging
          ? { position: "absolute", left: 0, right: 0, opacity: 0 }
          : undefined
      }
      onLayout={(e) => {
        if (!binding.isDragging) {
          binding.onLayout?.(e.nativeEvent.layout);
        }
      }}
    >
      <CardContainer
        style={
          !binding.isDragging && slideAnimation && animTranslateY
            ? [styles.card, { transform: [{ translateY: animTranslateY }] }]
            : styles.card
        }
      >
        <Pressable
          style={styles.completionControl}
          accessibilityRole="checkbox"
          accessibilityLabel={t(
            task.completed ? "card.reopenTask" : "card.completeTask",
            { title: task.title },
          )}
          accessibilityState={{
            checked: Boolean(task.completed),
            disabled: completionDisabled || !onSetCompleted,
          }}
          disabled={completionDisabled || !onSetCompleted}
          hitSlop={6}
          onPress={(event) => {
            event.stopPropagation();
            if (!completionDisabled) onSetCompleted?.(task.id, !task.completed);
          }}
        >
          <CompletionIndicator
            completed={Boolean(task.completed)}
            theme={theme}
          />
        </Pressable>
        <View
          style={styles.cardBody}
          {...(interactionDisabled ? {} : binding.cardPanHandlers)}
        >
          <View style={styles.cardHeader}>
            <View
              style={styles.dragHandle}
              accessibilityRole="button"
              accessibilityLabel={t("card.dragHandle")}
              {...(interactionDisabled ? {} : binding.handlePanHandlers)}
            >
              <Icon
                name="GripVertical"
                size={14}
                color={theme.colors.foregroundMuted}
              />
            </View>

            <Text style={styles.title} numberOfLines={2}>
              {task.title}
            </Text>
          </View>

          {(projectDisplayName || task.subtasks.length > 0) && (
            <View style={styles.badgeRow}>
              {projectDisplayName && (
                <View style={styles.projectBadge}>
                  <Text style={styles.projectBadgeText} numberOfLines={1}>
                    {projectDisplayName}
                  </Text>
                </View>
              )}
              {task.subtasks.length > 0 && (
                <View style={styles.subtaskBadge}>
                  <Text style={styles.subtaskBadgeText}>
                    {t("card.subtasksCount", {
                      completed: completedSubtasksCount,
                      total: task.subtasks.length,
                    })}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
        {task.source === "github_issue" && task.externalUrl && (
          <IssueLink
            url={task.externalUrl}
            theme={theme}
            iconOnly
            disabled={interactionDisabled}
          />
        )}
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
  const { t } = useI18n();
  const completedSubtasksCount = useMemo(
    () => task.subtasks.filter((s) => s.completed).length,
    [task.subtasks],
  );
  const resolvedWidth = width && width > 0 ? width : layout.compact ? 250 : 280;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        previewCard: {
          userSelect: "none",
          width: resolvedWidth,
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
        },
        cardBody: {
          flex: 1,
          gap: 8,
        },
        completionControl: {
          padding: 2,
        },
        cardHeader: {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 6,
        },
        dragHandle: {
          paddingHorizontal: 2,
          paddingVertical: 2,
          justifyContent: "center",
          alignItems: "center",
        },
        title: {
          flex: 1,
          fontSize: layout.compact ? 13 : 14,
          fontWeight: "600",
          color: theme.colors.foreground,
          userSelect: "none",
        },
        badgeRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
        },
        projectBadge: {
          backgroundColor: theme.colors.surface1,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: 4,
          paddingHorizontal: 6,
          paddingVertical: 2,
        },
        projectBadgeText: {
          fontSize: 11,
          color: theme.colors.foregroundMuted,
          fontWeight: "500",
        },
        subtaskBadge: {
          backgroundColor: theme.colors.surface1,
          borderRadius: 4,
          paddingHorizontal: 6,
          paddingVertical: 2,
        },
        subtaskBadgeText: {
          fontSize: 11,
          color:
            task.subtasks.length > 0 &&
            completedSubtasksCount === task.subtasks.length
              ? (theme.colors.statusSuccess ?? theme.colors.accent)
              : theme.colors.foregroundMuted,
          fontWeight: "500",
        },
      }),
    [
      theme,
      layout.compact,
      resolvedWidth,
      task.subtasks.length,
      completedSubtasksCount,
      animated,
    ],
  );

  return (
    <View style={styles.previewCard} pointerEvents="none">
      <View style={styles.completionControl}>
        <CompletionIndicator
          completed={Boolean(task.completed)}
          theme={theme}
        />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <View style={styles.dragHandle}>
            <Icon name="GripVertical" size={14} color={theme.colors.accent} />
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {task.title}
          </Text>
        </View>

        {(projectDisplayName || task.subtasks.length > 0) && (
          <View style={styles.badgeRow}>
            {projectDisplayName && (
              <View style={styles.projectBadge}>
                <Text style={styles.projectBadgeText} numberOfLines={1}>
                  {projectDisplayName}
                </Text>
              </View>
            )}
            {task.subtasks.length > 0 && (
              <View style={styles.subtaskBadge}>
                <Text style={styles.subtaskBadgeText}>
                  {t("card.subtasksCount", {
                    completed: completedSubtasksCount,
                    total: task.subtasks.length,
                  })}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
      {task.source === "github_issue" && task.externalUrl && (
        <IssueLink url={task.externalUrl} theme={theme} iconOnly disabled />
      )}
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
    if (!slideFromY) {
      return;
    }
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
      onLayout={(e) => onLayout?.(e.nativeEvent.layout)}
    />
  );
}
