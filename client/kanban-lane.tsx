import { useMemo, useLayoutEffect, useRef, Fragment, memo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  PanResponder,
} from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { KanbanLane, KanbanTask } from "../shared/kanban";
import { KanbanCard, KanbanDropSpacer } from "./kanban-card";
import { getProjectDisplayName, type ProjectItem } from "./use-projects";
import type { LaneDragBinding } from "./kanban-drag";
import { useI18n } from "./i18n";

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
  onSetCompleted?: (taskId: string, completed: boolean) => void;
  completionPending?: boolean;
  resolveProjectName?: (projectId: string | null) => string | null;
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
  onSetCompleted,
  completionPending = false,
  resolveProjectName,
}: KanbanLaneViewProps) {
  const { t } = useI18n();
  const {
    isHovered,
    targetIndex,
    isTaskDragging,
    draggedCardHeight,
    registerLaneLayout,
    registerCardsViewport,
    handleLaneScroll,
    setDropSpacerY,
    setLaneCardOrder,
    bindCard,
  } = dragBinding;

  // Sync card order to controller whenever tasks in this lane change
  useLayoutEffect(() => {
    setLaneCardOrder?.(
      lane.id,
      tasks.map((t) => t.id),
    );
  }, [lane.id, tasks, setLaneCardOrder]);

  const wasHoveredRef = useRef(false);
  const wasDraggingInLaneRef = useRef(false);
  const prevTargetIndexRef = useRef<number>(-1);
  const slideSeqRef = useRef(0);
  const lastTransitionRef = useRef<{ from: number; to: number; seq: number }>({
    from: -1,
    to: -1,
    seq: 0,
  });
  const displacedTasksRef = useRef<Map<string, { seq: number; fromY: number }>>(
    new Map(),
  );
  const spacerSlideFromYRef = useRef<number>(0);

  const hasDraggingTask = tasks.some((task) => isTaskDragging(task.id));
  const isInitialLiftInSourceLane =
    isHovered && hasDraggingTask && !wasDraggingInLaneRef.current;
  const animateSpacerFromZero =
    isHovered && !wasHoveredRef.current && !isInitialLiftInSourceLane;

  const remainingTasks = isHovered
    ? tasks.filter((task) => !isTaskDragging(task.id))
    : [];

  if (
    isHovered &&
    wasHoveredRef.current &&
    prevTargetIndexRef.current >= 0 &&
    targetIndex >= 0 &&
    prevTargetIndexRef.current !== targetIndex
  ) {
    const prevIdx = prevTargetIndexRef.current;
    const nextIdx = targetIndex;
    const shift =
      (draggedCardHeight && draggedCardHeight > 0 ? draggedCardHeight : 64) + 8;
    if (
      lastTransitionRef.current.from !== prevIdx ||
      lastTransitionRef.current.to !== nextIdx
    ) {
      lastTransitionRef.current = {
        from: prevIdx,
        to: nextIdx,
        seq: ++slideSeqRef.current,
      };
    }
    const seq = lastTransitionRef.current.seq;
    const minIdx = Math.min(prevIdx, nextIdx);
    const maxIdx = Math.max(prevIdx, nextIdx);
    const fromY = prevIdx < nextIdx ? shift : -shift;
    spacerSlideFromYRef.current = prevIdx < nextIdx ? -shift : shift;
    const nextMap = new Map<string, { seq: number; fromY: number }>();
    for (let i = minIdx; i < maxIdx && i < remainingTasks.length; i++) {
      nextMap.set(remainingTasks[i].id, { seq, fromY });
    }
    displacedTasksRef.current = nextMap;
  } else if (!isHovered) {
    displacedTasksRef.current = new Map();
    spacerSlideFromYRef.current = 0;
  } else {
    spacerSlideFromYRef.current = 0;
  }

  useLayoutEffect(() => {
    wasHoveredRef.current = isHovered;
    wasDraggingInLaneRef.current = hasDraggingTask;
    prevTargetIndexRef.current = isHovered ? targetIndex : -1;
    if (!isHovered) {
      lastTransitionRef.current = {
        from: -1,
        to: -1,
        seq: slideSeqRef.current,
      };
    }
  }, [isHovered, hasDraggingTask, targetIndex]);

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
    [theme, layout.compact],
  );

  const dropBeforeTaskId = isHovered
    ? remainingTasks[targetIndex]?.id
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
          {!lane.isCompletionLane && (
            <Pressable
              onPress={() => onAddTask(lane.id)}
              disabled={completionPending}
              style={styles.laneHeaderBtn}
              hitSlop={6}
            >
              <Text style={styles.laneHeaderBtnText}>{t("lane.add")}</Text>
            </Pressable>
          )}

          <Pressable
            accessibilityLabel={t("lane.manageSpecific", { title: lane.title })}
            onPress={() => onManageLane(lane.id)}
            disabled={completionPending}
            style={styles.laneHeaderBtn}
            hitSlop={6}
          >
            <Text style={styles.laneHeaderBtnText}>{t("lane.manage")}</Text>
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
                  animateFromZero={animateSpacerFromZero}
                  slideFromY={spacerSlideFromYRef.current}
                  onLayout={(rect) => setDropSpacerY(rect.y)}
                />
              )}
              <KanbanCard
                task={task}
                projectDisplayName={
                  resolveProjectName
                    ? resolveProjectName(task.projectId)
                    : getProjectDisplayName(task.projectId, projects)
                }
                theme={theme}
                layout={layout}
                binding={bindCard(
                  task.id,
                  () => onSelectTask(task),
                  PanResponder,
                )}
                slideAnimation={displacedTasksRef.current.get(task.id)}
                onSetCompleted={onSetCompleted}
                completionDisabled={
                  completionPending || (dragBinding.isDragLocked?.() ?? false)
                }
                interactionDisabled={completionPending}
              />
            </Fragment>
          ))}

          {isHovered && !dropBeforeTaskId && (
            <KanbanDropSpacer
              theme={theme}
              height={draggedCardHeight}
              animateFromZero={animateSpacerFromZero}
              slideFromY={spacerSlideFromYRef.current}
              onLayout={(rect) => setDropSpacerY(rect.y)}
            />
          )}

          {tasks.length === 0 && !isHovered && (
            <View style={styles.emptyLanePlaceholder}>
              <Text style={styles.emptyLaneText}>
                {t(
                  lane.isCompletionLane
                    ? "lane.emptyCompletionHint"
                    : "lane.emptyHint",
                )}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

export const KanbanLaneView = memo(KanbanLaneViewInner);
