import { useMemo, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { KanbanTask } from "../shared/kanban";
import type { CardDragBinding } from "./kanban-drag";
import { useI18n } from "./i18n";

type PluginTheme = PluginSurfaceProps["theme"];

export interface KanbanCardProps {
  task: KanbanTask;
  projectDisplayName: string | null;
  theme: PluginTheme;
  layout: { compact: boolean };
  binding: CardDragBinding;
}

export function KanbanCard({
  task,
  projectDisplayName,
  theme,
  layout,
  binding,
}: KanbanCardProps) {
  const { t } = useI18n();
  const bindingRef = useRef(binding);
  bindingRef.current = binding;

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
    [theme, layout.compact, task.subtasks.length, completedSubtasksCount],
  );

  return (
    <View
      // Keep the responder mounted, but let the single drop slot replace its space.
      style={
        binding.isDragging
          ? { position: "absolute", left: 0, right: 0, opacity: 0 }
          : undefined
      }
      onLayout={(e) => binding.onLayout?.(e.nativeEvent.layout)}
      {...binding.cardPanHandlers}
    >
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View
            style={styles.dragHandle}
            accessibilityRole="button"
            accessibilityLabel={t("card.dragHandle")}
            {...binding.handlePanHandlers}
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
      </View>
    </View>
  );
}

export function KanbanCardPreview({
  task,
  projectDisplayName,
  theme,
  layout,
  animated = false,
}: {
  task: KanbanTask;
  projectDisplayName: string | null;
  theme: PluginTheme;
  layout: { compact: boolean };
  animated?: boolean;
}) {
  const { t } = useI18n();
  const completedSubtasksCount = useMemo(
    () => task.subtasks.filter((s) => s.completed).length,
    [task.subtasks],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        previewCard: {
          userSelect: "none",
          width: layout.compact ? 250 : 280,
          backgroundColor: theme.colors.surface2,
          borderColor: theme.colors.accent,
          borderWidth: 2,
          borderRadius: 8,
          padding: layout.compact ? 10 : 12,
          gap: 8,
          ...(animated
            ? {}
            : { transform: [{ rotate: "2.5deg" }, { scale: 1.03 }] }),
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.25,
          shadowRadius: 10,
          elevation: 8,
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
      animated,
    ],
  );

  return (
    <View style={styles.previewCard} pointerEvents="none">
      <View style={styles.cardHeader}>
        <View style={styles.dragHandle}>
          <Icon name="GripVertical" size={14} color={theme.colors.accent} />
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {task.title}
        </Text>
      </View>

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
    </View>
  );
}

export function KanbanDropSpacer({
  height,
  theme,
  onLayout,
}: {
  height?: number;
  theme: PluginTheme;
  onLayout?: (layout: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
}) {
  const animHeight = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const targetHeight = height && height > 0 ? height : 64;
    Animated.timing(animHeight, {
      toValue: targetHeight,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [height, animHeight]);

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
      style={[styles.spacer, { height: animHeight }]}
      pointerEvents="none"
      onLayout={(e) => onLayout?.(e.nativeEvent.layout)}
    />
  );
}
