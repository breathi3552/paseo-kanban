import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useSettings } from "@getpaseo/plugin/client";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  kanbanSettings,
  updateTask,
  reorderTask,
  type KanbanTask,
  type KanbanLane,
  type KanbanBoard,
} from "../shared/kanban";
import { useProjects, getProjectDisplayName } from "./use-projects";
import { KanbanCard, KanbanCardPreview, KanbanDropSpacer } from "./kanban-card";
import { TaskModal } from "./task-modal";
import { LaneModal } from "./lane-modal";
import { useKanbanDrag } from "./kanban-drag";
import {
  openTaskSession,
  openLaneSession,
  type TaskEditSession,
  type LaneEditSession,
} from "./kanban-session";

export function KanbanBoardView({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(kanbanSettings);
  const { projects, isError: projectsError } = useProjects();

  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [activeTaskSession, setActiveTaskSession] = useState<TaskEditSession | null>(null);
  const [activeLaneSession, setActiveLaneSession] = useState<LaneEditSession | null>(null);

  const isReady = settings.status === "ready";
  const board = isReady ? settings.values : null;
  const revision = isReady ? settings.revision : "";

  const handleMoveTask = async (taskId: string, targetLaneId: string) => {
    if (!board) return;
    try {
      const nextBoard = updateTask(board, taskId, { laneId: targetLaneId });
      await settings.save(nextBoard, revision);
    } catch (err) {
      console.error("Move task failed:", err);
    }
  };

  const handleReorderTask = async (
    taskId: string,
    targetLaneId: string,
    targetIndex: number
  ) => {
    if (!board) return;
    try {
      const visibleTaskIds =
        selectedProjectId === "all"
          ? undefined
          : filteredTasks.filter((t) => t.laneId === targetLaneId).map((t) => t.id);
      const nextBoard = reorderTask(
        board,
        taskId,
        targetLaneId,
        targetIndex,
        visibleTaskIds
      );
      await settings.save(nextBoard, revision);
    } catch (err) {
      console.error("Reorder task failed:", err);
    }
  };

  const drag = useKanbanDrag({
    lanes: board?.lanes ?? [],
    onMoveTask: handleMoveTask,
    onReorderTask: handleReorderTask,
  });

  const scrollRef = useRef<ScrollView | null>(null);
  const currentScrollX = useRef(0);

  // Smooth edge auto-scroll when dragging near viewport boundaries
  useEffect(() => {
    const velocity = drag.feedback.autoScrollVelocity ?? 0;
    if (!velocity || !drag.feedback.isDragging) return;

    const timer = setInterval(() => {
      const nextOffset = Math.max(0, currentScrollX.current + velocity * 14);
      currentScrollX.current = nextOffset;
      scrollRef.current?.scrollTo({ x: nextOffset, animated: false });
    }, 16);

    return () => clearInterval(timer);
  }, [drag.feedback.autoScrollVelocity, drag.feedback.isDragging]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: theme.colors.surface0,
          userSelect: "none",
        },
        header: {
          paddingHorizontal: layout.compact ? 12 : 20,
          paddingVertical: layout.compact ? 10 : 14,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surface0,
          gap: 10,
        },
        headerTopRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        },
        titleRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        },
        titleText: {
          fontSize: layout.compact ? 18 : 22,
          fontWeight: "700",
          color: theme.colors.foreground,
        },
        headerActions: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        },
        primaryButton: {
          backgroundColor: theme.colors.accent,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 8,
        },
        primaryButtonText: {
          color: theme.colors.accentForeground,
          fontSize: 13,
          fontWeight: "600",
        },
        secondaryButton: {
          backgroundColor: theme.colors.surface1,
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 8,
        },
        secondaryButtonText: {
          color: theme.colors.foreground,
          fontSize: 13,
          fontWeight: "500",
        },
        filterRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        },
        filterLabel: {
          fontSize: 12,
          fontWeight: "600",
          color: theme.colors.foregroundMuted,
          marginRight: 4,
        },
        filterChip: {
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 6,
          backgroundColor: theme.colors.surface1,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        filterChipSelected: {
          backgroundColor: theme.colors.accent,
          borderColor: theme.colors.accent,
        },
        filterChipText: {
          fontSize: 12,
          color: theme.colors.foreground,
        },
        filterChipTextSelected: {
          color: theme.colors.accentForeground,
          fontWeight: "600",
        },
        conflictBanner: {
          marginHorizontal: layout.compact ? 12 : 20,
          marginTop: 10,
          padding: 10,
          backgroundColor: theme.colors.surface2,
          borderColor: theme.colors.statusDanger,
          borderWidth: 1,
          borderRadius: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        conflictText: {
          color: theme.colors.statusDanger,
          fontSize: 13,
          flex: 1,
        },
        conflictAction: {
          marginLeft: 10,
          paddingHorizontal: 8,
          paddingVertical: 4,
          backgroundColor: theme.colors.surface1,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        lanesWrapper: {
          flex: 1,
          position: "relative",
          userSelect: "none",
        },
        dragOverlay: {
          position: "absolute",
          zIndex: 9999,
          pointerEvents: "none",
        },
        lanesContainer: {
          flex: 1,
          padding: layout.compact ? 10 : 16,
          userSelect: "none",
        },
        lanesContent: {
          flexDirection: "row",
          gap: layout.compact ? 10 : 14,
          paddingRight: 24,
        },
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
        centerBox: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 12,
        },
        centerText: {
          fontSize: 14,
          color: theme.colors.foreground,
          textAlign: "center",
        },
      }),
    [theme, layout.compact]
  );

  // Filter tasks
  const filteredTasks = useMemo(() => {
    if (!board) return [];
    if (selectedProjectId === "all") return board.tasks;
    if (selectedProjectId === "unassigned") {
      return board.tasks.filter((t) => t.projectId === null);
    }
    return board.tasks.filter((t) => t.projectId === selectedProjectId);
  }, [board, selectedProjectId]);

  const draggingTask = useMemo(() => {
    if (!board || !drag.feedback.draggingTaskId) return null;
    return board.tasks.find((t) => t.id === drag.feedback.draggingTaskId) ?? null;
  }, [board, drag.feedback.draggingTaskId]);

  const draggingTaskProjectName = useMemo(() => {
    if (!draggingTask) return null;
    return getProjectDisplayName(draggingTask.projectId, projects);
  }, [draggingTask, projects]);

  // Keep drag controller aware of the card order within each lane for hit-testing
  useEffect(() => {
    if (!board) return;
    for (const lane of board.lanes) {
      const laneTaskIds = filteredTasks
        .filter((t) => t.laneId === lane.id)
        .map((t) => t.id);
      drag.setLaneCardOrder(lane.id, laneTaskIds);
    }
  }, [board, filteredTasks, drag]);

  if (settings.status === "loading") {
    return (
      <View style={[styles.container, styles.centerBox]}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.centerText}>正在加载看板数据...</Text>
      </View>
    );
  }

  if (settings.status === "error") {
    return (
      <View style={[styles.container, styles.centerBox]}>
        <Text style={[styles.centerText, { color: theme.colors.statusDanger }]}>
          加载看板配置失败：{settings.error}
        </Text>
        <Pressable onPress={() => settings.reload()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>重试加载</Text>
        </Pressable>
      </View>
    );
  }

  if (settings.status === "invalid") {
    return (
      <View style={[styles.container, styles.centerBox]}>
        <Text style={[styles.centerText, { color: theme.colors.statusWarning ?? theme.colors.statusDanger }]}>
          看板配置格式异常：{settings.error}
        </Text>
        <Text style={[styles.centerText, { color: theme.colors.foregroundMuted, fontSize: 12 }]}>
          数据未被悄悄覆盖。若需使用默认结构可重置，或重试加载。
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable onPress={() => settings.reload()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>重试加载</Text>
          </Pressable>
          <Pressable onPress={() => settings.reset()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>重置为默认结构</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!board) return null;

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.titleRow}>
            <Text style={styles.titleText}>任务看板</Text>
            <View style={styles.laneCountBadge}>
              <Text style={styles.laneCountText}>
                {board.tasks.length} 任务 · {board.lanes.length} 泳道
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                if (!board) return;
                setActiveLaneSession(
                  openLaneSession({
                    mode: "create",
                    baseBoard: board,
                    baseRevision: revision,
                    save: (b, r) => settings.save(b, r),
                  })
                );
              }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>+ 新增泳道</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                if (!board) return;
                setActiveTaskSession(
                  openTaskSession({
                    mode: "create",
                    baseBoard: board,
                    baseRevision: revision,
                    save: (b, r) => settings.save(b, r),
                    defaultLaneId: board.lanes[0]?.id ?? "",
                    defaultProjectId:
                      selectedProjectId === "all" || selectedProjectId === "unassigned"
                        ? null
                        : selectedProjectId,
                  })
                );
              }}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>+ 新建任务</Text>
            </Pressable>
          </View>
        </View>

        {/* Project Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>项目筛选:</Text>
            <Pressable
              onPress={() => setSelectedProjectId("all")}
              style={[
                styles.filterChip,
                selectedProjectId === "all" && styles.filterChipSelected,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedProjectId === "all" && styles.filterChipTextSelected,
                ]}
              >
                全部
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setSelectedProjectId("unassigned")}
              style={[
                styles.filterChip,
                selectedProjectId === "unassigned" && styles.filterChipSelected,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedProjectId === "unassigned" && styles.filterChipTextSelected,
                ]}
              >
                未关联项目
              </Text>
            </Pressable>

            {projects.map((proj) => {
              const isSelected = selectedProjectId === proj.projectId;
              return (
                <Pressable
                  key={proj.projectId}
                  onPress={() => setSelectedProjectId(proj.projectId)}
                  style={[
                    styles.filterChip,
                    isSelected && styles.filterChipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      isSelected && styles.filterChipTextSelected,
                    ]}
                  >
                    {proj.projectDisplayName}
                  </Text>
                </Pressable>
              );
            })}

            {projectsError && (
              <Text style={{ fontSize: 11, color: theme.colors.statusWarning ?? theme.colors.foregroundMuted }}>
                (项目列表更新受限)
              </Text>
            )}
          </View>
        </ScrollView>
      </View>

      {/* Conflict / Save Error Notification */}
      {settings.saveError && (
        <View style={styles.conflictBanner}>
          <Text style={styles.conflictText}>保存冲突或错误：{settings.saveError}</Text>
          <Pressable onPress={() => settings.reload()} style={styles.conflictAction}>
            <Text style={{ fontSize: 12, color: theme.colors.foreground }}>刷新最新数据</Text>
          </Pressable>
        </View>
      )}

      {/* Main Board Lanes */}
      <View style={styles.lanesWrapper}>
        <ScrollView
          ref={(instance) => {
            scrollRef.current = instance;
            drag.bindContainerRef(instance as unknown as Parameters<typeof drag.bindContainerRef>[0]);
          }}
          horizontal
          style={styles.lanesContainer}
          contentContainerStyle={styles.lanesContent}
          onLayout={(e) => drag.handleContainerLayout(e.nativeEvent.layout)}
          onScroll={(e) => {
            currentScrollX.current = e.nativeEvent.contentOffset.x;
            drag.handleScroll(e.nativeEvent.contentOffset.x);
          }}
          scrollEventThrottle={16}
        >
          {board.lanes.map((lane) => {
            const laneTasks = filteredTasks.filter((t) => t.laneId === lane.id);
            const isHovered = drag.isLaneHovered(lane.id);
            const targetIndex = isHovered
              ? (drag.feedback.targetIndex ?? laneTasks.length)
              : -1;
            const dropBeforeTaskId = laneTasks
              .filter((task) => task.id !== drag.feedback.draggingTaskId)[targetIndex]?.id;

            return (
              <View
                key={lane.id}
                style={[styles.laneColumn, isHovered && styles.laneColumnHovered]}
                onLayout={(e) => drag.registerLaneLayout(lane.id, e.nativeEvent.layout)}
              >
                <View style={styles.laneHeader}>
                  <View style={styles.laneTitleGroup}>
                    <Text style={styles.laneTitleText} numberOfLines={1}>
                      {lane.title}
                    </Text>
                    <View style={styles.laneCountBadge}>
                      <Text style={styles.laneCountText}>{laneTasks.length}</Text>
                    </View>
                  </View>

                  <View style={styles.laneHeaderActions}>
                    <Pressable
                      onPress={() => {
                        if (!board) return;
                        setActiveTaskSession(
                          openTaskSession({
                            mode: "create",
                            baseBoard: board,
                            baseRevision: revision,
                            save: (b, r) => settings.save(b, r),
                            defaultLaneId: lane.id,
                            defaultProjectId:
                              selectedProjectId === "all" || selectedProjectId === "unassigned"
                                ? null
                                : selectedProjectId,
                          })
                        );
                      }}
                      style={styles.laneHeaderBtn}
                      hitSlop={6}
                    >
                      <Text style={styles.laneHeaderBtnText}>+ 添加</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        if (!board) return;
                        setActiveLaneSession(
                          openLaneSession({
                            mode: "edit",
                            laneId: lane.id,
                            baseBoard: board,
                            baseRevision: revision,
                            save: (b, r) => settings.save(b, r),
                          })
                        );
                      }}
                      style={styles.laneHeaderBtn}
                      hitSlop={6}
                    >
                      <Text style={styles.laneHeaderBtnText}>管理</Text>
                    </Pressable>
                  </View>
                </View>

                <ScrollView
                  style={styles.cardsScroll}
                  showsVerticalScrollIndicator={false}
                  onLayout={(e) => drag.registerCardsViewportLayout(lane.id, e.nativeEvent.layout)}
                  onScroll={(e) => drag.handleLaneScroll(lane.id, e.nativeEvent.contentOffset.y)}
                  scrollEventThrottle={16}
                >
                  <View style={styles.cardsList}>
                    {laneTasks.map((task) => (
                      <Fragment key={task.id}>
                        {isHovered && dropBeforeTaskId === task.id && (
                          <KanbanDropSpacer theme={theme} height={drag.feedback.draggedCardHeight} />
                        )}
                        <KanbanCard
                          task={task}
                          projectDisplayName={getProjectDisplayName(task.projectId, projects)}
                          theme={theme}
                          layout={layout}
                          isDraggingThis={drag.isTaskDragging(task.id)}
                          isDragLocked={drag.isDragLocked}
                          onPress={() => {
                            if (!board) return;
                            setActiveTaskSession(
                              openTaskSession({
                                mode: "edit",
                                taskId: task.id,
                                baseBoard: board,
                                baseRevision: revision,
                                save: (b, r) => settings.save(b, r),
                              })
                            );
                          }}
                          onDragStart={drag.startGesture}
                          onDragMove={drag.moveGesture}
                          onDragRelease={drag.releaseGesture}
                          onDragCancel={drag.cancelGesture}
                          onLayoutCard={(taskId, rect) =>
                            drag.registerCardLayout(lane.id, taskId, rect)
                          }
                          onUnmountCard={(taskId) =>
                            drag.unregisterCardLayout(lane.id, taskId)
                          }
                        />
                      </Fragment>
                    ))}

                    {isHovered && !dropBeforeTaskId && (
                      <KanbanDropSpacer theme={theme} height={drag.feedback.draggedCardHeight} />
                    )}

                    {laneTasks.length === 0 && !isHovered && (
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
          })}
        </ScrollView>

        {drag.feedback.isDragging && draggingTask && typeof drag.feedback.pointerX === "number" && (
          <View
            pointerEvents="none"
            style={[
              styles.dragOverlay,
              {
                left:
                  drag.feedback.pointerX -
                  (drag.getContainerBounds()?.x ?? 0) -
                  (layout.compact ? 125 : 140),
                top:
                  (drag.feedback.pointerY ?? 0) -
                  (drag.getContainerBounds()?.y ?? 0) -
                  20,
              },
            ]}
          >
            <KanbanCardPreview
              task={draggingTask}
              projectDisplayName={draggingTaskProjectName}
              theme={theme}
              layout={layout}
            />
          </View>
        )}
      </View>

      {/* Modals with Session Baseline Locking */}
      {activeTaskSession && (
        <TaskModal
          open={activeTaskSession !== null}
          onClose={() => setActiveTaskSession(null)}
          session={activeTaskSession}
          lanes={activeTaskSession.baseBoard.lanes}
          projects={projects}
          theme={theme}
          layout={layout}
        />
      )}

      {activeLaneSession && (
        <LaneModal
          open={activeLaneSession !== null}
          onClose={() => setActiveLaneSession(null)}
          session={activeLaneSession}
          theme={theme}
          layout={layout}
        />
      )}
    </View>
  );
}
