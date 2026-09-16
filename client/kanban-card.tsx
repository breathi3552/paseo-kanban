import { useMemo, useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  PanResponder,
} from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { KanbanTask, KanbanLane } from "../shared/kanban";

type PluginTheme = PluginSurfaceProps["theme"];

interface KanbanCardProps {
  task: KanbanTask;
  projectDisplayName: string | null;
  lanes: KanbanLane[];
  theme: PluginTheme;
  layout: { compact: boolean };
  isDraggingThis: boolean;
  onPress: () => void;
  onMoveToLane: (targetLaneId: string) => void;
  onDragStart: (taskId: string, laneId: string, startX: number, startY: number) => void;
  onDragMove: (moveX: number, moveY: number) => void;
  onDragRelease: (moveX?: number, moveY?: number) => void;
  onDragCancel: () => void;
}

export function KanbanCard({
  task,
  projectDisplayName,
  lanes,
  theme,
  layout,
  isDraggingThis,
  onPress,
  onMoveToLane,
  onDragStart,
  onDragMove,
  onDragRelease,
  onDragCancel,
}: KanbanCardProps) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);

  // Sync ref to always hold latest callbacks and task, avoiding recreating PanResponder on re-renders
  const callbacksRef = useRef({ onDragStart, onDragMove, onDragRelease, onDragCancel, task });
  useEffect(() => {
    callbacksRef.current = { onDragStart, onDragMove, onDragRelease, onDragCancel, task };
  });

  const completedSubtasksCount = useMemo(
    () => task.subtasks.filter((s) => s.completed).length,
    [task.subtasks]
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: theme.colors.surface2,
          borderColor: isDraggingThis ? theme.colors.accent : theme.colors.border,
          borderWidth: isDraggingThis ? 2 : 1,
          borderRadius: 8,
          padding: layout.compact ? 10 : 12,
          gap: 8,
          opacity: isDraggingThis ? 0.4 : 1,
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
              ? theme.colors.statusSuccess ?? theme.colors.accent
              : theme.colors.foregroundMuted,
          fontWeight: "500",
        },
        moveButton: {
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 4,
          backgroundColor: theme.colors.surface1,
        },
        moveButtonText: {
          fontSize: 11,
          color: theme.colors.foregroundMuted,
        },
        moveMenu: {
          marginTop: 6,
          paddingTop: 6,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 4,
        },
        moveOptionChip: {
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 4,
          backgroundColor: theme.colors.surface1,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        moveOptionChipText: {
          fontSize: 11,
          color: theme.colors.foreground,
        },
      }),
    [theme, layout.compact, isDraggingThis, task.subtasks.length, completedSubtasksCount]
  );

  // PanResponder is created ONCE and never recreated during re-renders,
  // reading all latest state and callbacks through callbacksRef.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_e, gestureState) => {
        const { onDragStart, task: currentTask } = callbacksRef.current;
        onDragStart(
          currentTask.id,
          currentTask.laneId,
          gestureState.x0,
          gestureState.y0
        );
      },
      onPanResponderMove: (_e, gestureState) => {
        const { onDragMove } = callbacksRef.current;
        onDragMove(gestureState.moveX, gestureState.moveY);
      },
      onPanResponderRelease: (_e, gestureState) => {
        const { onDragRelease } = callbacksRef.current;
        onDragRelease(gestureState.moveX, gestureState.moveY);
      },
      onPanResponderTerminate: () => {
        const { onDragCancel } = callbacksRef.current;
        onDragCancel();
      },
    })
  ).current;

  const otherLanes = useMemo(
    () => lanes.filter((l) => l.id !== task.laneId),
    [lanes, task.laneId]
  );

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View
          style={styles.dragHandle}
          accessibilityRole="button"
          accessibilityLabel="拖动手柄"
          {...panResponder.panHandlers}
        >
          <Icon name="GripVertical" size={14} color={theme.colors.foregroundMuted} />
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {task.title}
        </Text>

        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            setShowMoveMenu((v) => !v);
          }}
          style={styles.moveButton}
          hitSlop={8}
        >
          <Text style={styles.moveButtonText}>移动</Text>
        </Pressable>
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
              子步骤 {completedSubtasksCount}/{task.subtasks.length}
            </Text>
          </View>
        )}
      </View>

      {showMoveMenu && otherLanes.length > 0 && (
        <View style={styles.moveMenu}>
          {otherLanes.map((lane) => (
            <Pressable
              key={lane.id}
              onPress={() => {
                setShowMoveMenu(false);
                onMoveToLane(lane.id);
              }}
              style={styles.moveOptionChip}
            >
              <Text style={styles.moveOptionChipText}>至 {lane.title}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Pressable>
  );
}
