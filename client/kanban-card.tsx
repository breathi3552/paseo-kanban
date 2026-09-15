import { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  PanResponder,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from "react-native";
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
  onDragStart: (taskId: string, laneId: string) => void;
  onDragMove: (dx: number, dy: number, pageX: number, pageY: number) => void;
  onDragEnd: (didDrag: boolean) => void;
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
  onDragEnd,
}: KanbanCardProps) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const dragThresholdPassed = useRef(false);

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
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 6,
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

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (
          _e: GestureResponderEvent,
          gestureState: PanResponderGestureState
        ) => {
          const moved =
            Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4;
          return moved;
        },
        onPanResponderGrant: () => {
          dragThresholdPassed.current = false;
        },
        onPanResponderMove: (
          _e: GestureResponderEvent,
          gestureState: PanResponderGestureState
        ) => {
          if (!dragThresholdPassed.current) {
            const dist = Math.hypot(gestureState.dx, gestureState.dy);
            if (dist > 6) {
              dragThresholdPassed.current = true;
              onDragStart(task.id, task.laneId);
            }
          }
          if (dragThresholdPassed.current) {
            onDragMove(
              gestureState.dx,
              gestureState.dy,
              gestureState.moveX,
              gestureState.moveY
            );
          }
        },
        onPanResponderRelease: () => {
          const didDrag = dragThresholdPassed.current;
          dragThresholdPassed.current = false;
          onDragEnd(didDrag);
          if (!didDrag) {
            onPress();
          }
        },
        onPanResponderTerminate: () => {
          const didDrag = dragThresholdPassed.current;
          dragThresholdPassed.current = false;
          onDragEnd(false);
        },
      }),
    [task.id, task.laneId, onDragStart, onDragMove, onDragEnd, onPress]
  );

  const otherLanes = useMemo(
    () => lanes.filter((l) => l.id !== task.laneId),
    [lanes, task.laneId]
  );

  return (
    <View style={styles.card} {...panResponder.panHandlers}>
      <View style={styles.cardHeader}>
        <Text style={styles.title} numberOfLines={2}>
          {task.title}
        </Text>
        <Pressable
          onPress={() => setShowMoveMenu((v) => !v)}
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
    </View>
  );
}
