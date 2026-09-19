import { useMemo, useEffect, Fragment, memo } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { KanbanLane, KanbanTask } from "../shared/kanban";
import { KanbanCard, KanbanDropSpacer } from "./kanban-card";
import { getProjectDisplayName, type ProjectItem } from "./use-projects";
import type { LaneDragBinding } from "./kanban-drag";

type PluginTheme = PluginSurfaceProps["theme"];

export interface KanbanLaneViewProps {
  lane: KanbanLane;
  tasks: KanbanTask[];
  projects: ProjectItem[];
  theme: PluginTheme;
  layout: { compact: boolean; platform: "ios" | "android" | "web" };
  dragBinding: LaneDragBinding;
  onAddTask: (laneId: string) => void;
  onManageLane: (laneId: string) => void;
  onSelectTask: (task: KanbanTask) => void;
}

function KanbanLaneViewInner({
  lane,
  tasks,
  projects,
  theme,
  layout,
  dragBinding,
  onAddTask,
  onManageLane,
  onSelectTask,
}: KanbanLaneViewProps) {
  const {
    isHovered,
    targetIndex,
    isTaskDragging,
    draggedCardHeight,
    isDragLocked,
    registerLaneLayout,
    registerCardsViewport,
    handleLaneScroll,
    registerCardLayout,
    unregisterCardLayout,
    setDropSpacerY,
    startGesture,
    moveGesture,
    releaseGesture,
    cancelGesture,
    setLaneCardOrder,
  } = dragBinding;

  // Sync card order to controller whenever tasks in this lane change
  useEffect(() => {
    setLaneCardOrder?.(lane.id, tasks.map((t) => t.id));
  }, [lane.id, tasks, setLaneCardOrder]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        laneColumn: {
          width: layout.compact ? 270 : 300,
          backgroundColor: theme.colors.surface1,
          borderColor: theme.colors.border,
          borderWidth: 2,
          borderRadius: 10,
          maxHeight: "100%",
          padding: 10,
          gap: 10,
          userSelect: "none",
        },
        laneColumnHovered: {
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.surface2,
        },
        laneHeader: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        },
        laneTitleGroup: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          flex: 1,
        },
        laneTitleText: {
          fontSize: 14,
          fontWeight: "700",
          color: theme.colors.foreground,
          userSelect: "none",
        },
        laneCountBadge: {
          backgroundColor: theme.colors.surface2,
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 10,
        },
        laneCountText: {
          fontSize: 11,
          color: theme.colors.foregroundMuted,
          fontWeight: "600",
        },
        laneHeaderActions: {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
        },
        laneHeaderBtn: {
          paddingHorizontal: 6,
          paddingVertical: 3,
          borderRadius: 4,
          backgroundColor: theme.colors.surface2,
        },
        laneHeaderBtnText: {
          fontSize: 11,
          color: theme.colors.foreground,
        },
        cardsScroll: {
          flex: 1,
        },
        cardsList: {
          gap: 8,
          paddingBottom: 8,
        },
        emptyLanePlaceholder: {
          paddingVertical: 24,
          alignItems: "center",
          justifyContent: "center",
          borderStyle: "dashed",
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 8,
          marginVertical: 6,
        },
        emptyLaneText: {
          fontSize: 12,
          color: theme.colors.foregroundMuted,
          textAlign: "center",
          paddingHorizontal: 12,
          userSelect: "none",
        },
      }),
    [theme, layout.compact]
  );

  const dropBeforeTaskId = isHovered
    ? tasks.filter((task) => !isTaskDragging(task.id))[targetIndex]?.id
    : undefined;

  return (
    <View
      style={[styles.laneColumn, isHovered && styles.laneColumnHovered]}
      onLayout={(e) => registerLaneLayout(e.nativeEvent.layout)}
    >
      {/* Lane Header */}
      <View style={styles.laneHeader}>
        <View style={styles.laneTitleGroup}>
          <Text style={styles.laneTitleText} numberOfLines={1}>
            {lane.title}
          </Text>
          <View style={styles.laneCountBadge}>
            <Text style={styles.laneCountText}>{tasks.length}</Text>
          </View>
        </View>

        <View style={styles.laneHeaderActions}>
          <Pressable
            onPress={() => onAddTask(lane.id)}
            style={styles.laneHeaderBtn}
            hitSlop={6}
          >
            <Text style={styles.laneHeaderBtnText}>+ 添加</Text>
          </Pressable>

          <Pressable
            onPress={() => onManageLane(lane.id)}
            style={styles.laneHeaderBtn}
            hitSlop={6}
          >
            <Text style={styles.laneHeaderBtnText}>管理</Text>
          </Pressable>
        </View>
      </View>

      {/* Cards Viewport */}
      <ScrollView
        style={styles.cardsScroll}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => registerCardsViewport(e.nativeEvent.layout)}
        onScroll={(e) => handleLaneScroll(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        <View style={styles.cardsList}>
          {tasks.map((task) => (
            <Fragment key={task.id}>
              {isHovered && dropBeforeTaskId === task.id && (
                <KanbanDropSpacer
                  theme={theme}
                  height={draggedCardHeight}
                  onLayout={(rect) => setDropSpacerY(rect.y)}
                />
              )}
              <KanbanCard
                task={task}
                projectDisplayName={getProjectDisplayName(task.projectId, projects)}
                theme={theme}
                layout={layout}
                isDraggingThis={isTaskDragging(task.id)}
                isDragLocked={isDragLocked}
                onPress={() => onSelectTask(task)}
                onDragStart={startGesture}
                onDragMove={moveGesture}
                onDragRelease={releaseGesture}
                onDragCancel={cancelGesture}
                onLayoutCard={(taskId, rect) => registerCardLayout(taskId, rect)}
                onUnmountCard={(taskId) => unregisterCardLayout(taskId)}
              />
            </Fragment>
          ))}

          {isHovered && !dropBeforeTaskId && (
            <KanbanDropSpacer
              theme={theme}
              height={draggedCardHeight}
              onLayout={(rect) => setDropSpacerY(rect.y)}
            />
          )}

          {tasks.length === 0 && !isHovered && (
            <View style={styles.emptyLanePlaceholder}>
              <Text style={styles.emptyLaneText}>
                暂无卡片，可点击右上角添加或拖动卡片至此
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

export const KanbanLaneView = memo(KanbanLaneViewInner);
