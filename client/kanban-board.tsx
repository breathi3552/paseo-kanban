import { useState, useMemo, useRef } from "react";
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
  addLane,
  updateLane,
  deleteLane,
  addTask,
  updateTask,
  deleteTask,
  moveTask,
  type KanbanTask,
  type KanbanLane,
} from "../shared/kanban";
import { useProjects, getProjectDisplayName } from "./use-projects";
import { KanbanCard } from "./kanban-card";
import { TaskModal } from "./task-modal";
import { LaneModal } from "./lane-modal";

export function KanbanBoardView({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(kanbanSettings);
  const { projects, isError: projectsError } = useProjects();

  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<KanbanTask | null>(null);
  const [targetLaneIdForNewTask, setTargetLaneIdForNewTask] = useState<string>("");

  const [laneModalOpen, setLaneModalOpen] = useState(false);
  const [editingLane, setEditingLane] = useState<KanbanLane | null>(null);

  // Drag state
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [draggingSourceLaneId, setDraggingSourceLaneId] = useState<string | null>(null);
  const [hoveredLaneId, setHoveredLaneId] = useState<string | null>(null);

  const laneLayouts = useRef<
    Record<string, { x: number; y: number; width: number; height: number }>
  >({});
  const scrollOffsetRef = useRef(0);

  const isReady = settings.status === "ready";
  const board = isReady ? settings.values : null;
  const revision = isReady ? settings.revision : "";

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: theme.colors.surface0,
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
        lanesContainer: {
          flex: 1,
          padding: layout.compact ? 10 : 16,
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
          borderWidth: 1,
          borderRadius: 10,
          maxHeight: "100%",
          padding: 10,
          gap: 10,
        },
        laneColumnHovered: {
          borderColor: theme.colors.accent,
          borderWidth: 2,
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

  // Handle Drag Move & Hit Testing
  const handleDragStart = (taskId: string, laneId: string) => {
    setDraggingTaskId(taskId);
    setDraggingSourceLaneId(laneId);
    setHoveredLaneId(laneId);
  };

  const handleDragMove = (_dx: number, _dy: number, pageX: number) => {
    // Relative X inside the scroll container
    const relativeX = pageX - (layout.compact ? 10 : 16) + scrollOffsetRef.current;
    let foundLaneId: string | null = null;
    for (const [id, rect] of Object.entries(laneLayouts.current)) {
      if (relativeX >= rect.x && relativeX <= rect.x + rect.width) {
        foundLaneId = id;
        break;
      }
    }
    if (foundLaneId) {
      setHoveredLaneId(foundLaneId);
    }
  };

  const handleDragEnd = async (didDrag: boolean) => {
    const currentTaskId = draggingTaskId;
    const currentSourceLaneId = draggingSourceLaneId;
    const targetLane = hoveredLaneId;

    setDraggingTaskId(null);
    setDraggingSourceLaneId(null);
    setHoveredLaneId(null);

    if (didDrag && currentTaskId && targetLane && targetLane !== currentSourceLaneId && board) {
      try {
        const nextBoard = moveTask(board, currentTaskId, targetLane);
        await settings.save(nextBoard, revision);
      } catch (err) {
        console.error("Move task failed:", err);
      }
    }
  };

  // State operations
  const handleSaveTask = async (taskData: {
    id: string;
    title: string;
    description: string;
    laneId: string;
    projectId: string | null;
    subtasks: KanbanTask["subtasks"];
  }): Promise<boolean> => {
    if (!board) return false;
    try {
      const isExisting = board.tasks.some((t) => t.id === taskData.id);
      const nextBoard = isExisting
        ? updateTask(board, taskData.id, {
            title: taskData.title,
            description: taskData.description,
            laneId: taskData.laneId,
            projectId: taskData.projectId,
          })
        : addTask(board, taskData);

      // Also ensure subtasks are in sync
      const taskInNext = nextBoard.tasks.find((t) => t.id === taskData.id);
      if (taskInNext) {
        taskInNext.subtasks = taskData.subtasks;
      }

      return await settings.save(nextBoard, revision);
    } catch {
      return false;
    }
  };

  const handleDeleteTask = async (taskId: string): Promise<boolean> => {
    if (!board) return false;
    try {
      const nextBoard = deleteTask(board, taskId);
      return await settings.save(nextBoard, revision);
    } catch {
      return false;
    }
  };

  const handleMoveTaskDirectly = async (taskId: string, targetLaneId: string) => {
    if (!board) return;
    try {
      const nextBoard = moveTask(board, taskId, targetLaneId);
      await settings.save(nextBoard, revision);
    } catch (err) {
      console.error("Direct move task failed:", err);
    }
  };

  const handleSaveLane = async (laneData: { id: string; title: string }): Promise<boolean> => {
    if (!board) return false;
    try {
      const isExisting = board.lanes.some((l) => l.id === laneData.id);
      const nextBoard = isExisting
        ? updateLane(board, laneData.id, { title: laneData.title })
        : addLane(board, laneData);
      return await settings.save(nextBoard, revision);
    } catch {
      return false;
    }
  };

  const handleDeleteLane = async (laneId: string): Promise<boolean> => {
    if (!board) return false;
    try {
      const nextBoard = deleteLane(board, laneId);
      return await settings.save(nextBoard, revision);
    } catch {
      return false;
    }
  };

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
                setEditingLane(null);
                setLaneModalOpen(true);
              }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>+ 新增泳道</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setEditingTask(null);
                setTargetLaneIdForNewTask(board.lanes[0]?.id ?? "");
                setTaskModalOpen(true);
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
      <ScrollView
        horizontal
        style={styles.lanesContainer}
        contentContainerStyle={styles.lanesContent}
        onScroll={(e) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={16}
      >
        {board.lanes.map((lane) => {
          const laneTasks = filteredTasks.filter((t) => t.laneId === lane.id);
          const isHovered = hoveredLaneId === lane.id && draggingTaskId !== null;

          return (
            <View
              key={lane.id}
              style={[styles.laneColumn, isHovered && styles.laneColumnHovered]}
              onLayout={(e) => {
                const { x, y, width, height } = e.nativeEvent.layout;
                laneLayouts.current[lane.id] = { x, y, width, height };
              }}
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
                      setEditingTask(null);
                      setTargetLaneIdForNewTask(lane.id);
                      setTaskModalOpen(true);
                    }}
                    style={styles.laneHeaderBtn}
                    hitSlop={6}
                  >
                    <Text style={styles.laneHeaderBtnText}>+ 添加</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      setEditingLane(lane);
                      setLaneModalOpen(true);
                    }}
                    style={styles.laneHeaderBtn}
                    hitSlop={6}
                  >
                    <Text style={styles.laneHeaderBtnText}>管理</Text>
                  </Pressable>
                </View>
              </View>

              <ScrollView style={styles.cardsScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.cardsList}>
                  {laneTasks.map((task) => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      projectDisplayName={getProjectDisplayName(task.projectId, projects)}
                      lanes={board.lanes}
                      theme={theme}
                      layout={layout}
                      isDraggingThis={draggingTaskId === task.id}
                      onPress={() => {
                        setEditingTask(task);
                        setTaskModalOpen(true);
                      }}
                      onMoveToLane={(targetId) => handleMoveTaskDirectly(task.id, targetId)}
                      onDragStart={handleDragStart}
                      onDragMove={handleDragMove}
                      onDragEnd={handleDragEnd}
                    />
                  ))}

                  {laneTasks.length === 0 && (
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

      {/* Modals */}
      <TaskModal
        open={taskModalOpen}
        onClose={() => {
          setTaskModalOpen(false);
          setEditingTask(null);
        }}
        task={editingTask}
        defaultLaneId={targetLaneIdForNewTask || (board.lanes[0]?.id ?? "")}
        defaultProjectId={selectedProjectId === "all" || selectedProjectId === "unassigned" ? null : selectedProjectId}
        lanes={board.lanes}
        projects={projects}
        theme={theme}
        layout={layout}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
      />

      <LaneModal
        open={laneModalOpen}
        onClose={() => {
          setLaneModalOpen(false);
          setEditingLane(null);
        }}
        lane={editingLane}
        lanesCount={board.lanes.length}
        tasksInLaneCount={editingLane ? board.tasks.filter((t) => t.laneId === editingLane.id).length : 0}
        theme={theme}
        layout={layout}
        onSave={handleSaveLane}
        onDelete={handleDeleteLane}
      />
    </View>
  );
}
