import { useState, useMemo } from "react";
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
  filterTasksByProject,
  type KanbanTask,
} from "../shared/kanban";
import { useProjects, getProjectDisplayName } from "./use-projects";
import { TaskModal } from "./task-modal";
import { LaneModal } from "./lane-modal";
import { useKanbanDrag } from "./kanban-drag";
import { KanbanLaneView } from "./kanban-lane";
import { KanbanDragOverlay } from "./kanban-overlay";
import {
  openTaskSession,
  openLaneSession,
  executeTaskReorder,
  type TaskEditSession,
  type LaneEditSession,
} from "./kanban-session";

export function KanbanBoardView({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(kanbanSettings);
  const { projects, isError: projectsError } = useProjects();

  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [activeTaskSession, setActiveTaskSession] = useState<TaskEditSession | null>(null);
  const [activeLaneSession, setActiveLaneSession] = useState<LaneEditSession | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);

  const isReady = settings.status === "ready";
  const board = isReady ? settings.values : null;
  const revision = isReady ? settings.revision : "";

  // Filter tasks based on selected project
  const filteredTasks = useMemo(() => {
    if (!board) return [];
    return filterTasksByProject(board.tasks, selectedProjectId);
  }, [board, selectedProjectId]);

  const handleReorderTask = async (
    taskId: string,
    targetLaneId: string,
    targetIndex: number
  ) => {
    if (!board) return;
    const result = await executeTaskReorder({
      baseBoard: board,
      baseRevision: revision,
      taskId,
      targetLaneId,
      targetIndex,
      filter: selectedProjectId,
      save: (b, r) => settings.save(b, r),
    });
    if (!result.success) {
      setReorderError(result.error);
    } else {
      setReorderError(null);
    }
  };

  const getTaskPreview = (taskId: string) => {
    if (!board) return null;
    const task = board.tasks.find((t) => t.id === taskId) ?? null;
    return {
      task,
      projectDisplayName: task ? getProjectDisplayName(task.projectId, projects) : null,
    };
  };

  const drag = useKanbanDrag({
    lanes: board?.lanes ?? [],
    onReorderTask: handleReorderTask,
    getTaskPreview,
  });

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
            <View style={{
              backgroundColor: theme.colors.surface2,
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 10,
            }}>
              <Text style={{
                fontSize: 11,
                color: theme.colors.foregroundMuted,
                fontWeight: "600",
              }}>
                {board.tasks.length} 任务 · {board.lanes.length} 泳道
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                if (drag.isDragLocked() || !board) return;
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
                if (drag.isDragLocked() || !board) return;
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
              onPress={() => {
                if (drag.isDragLocked()) return;
                setSelectedProjectId("all");
              }}
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
              onPress={() => {
                if (drag.isDragLocked()) return;
                setSelectedProjectId("unassigned");
              }}
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
                  onPress={() => {
                    if (drag.isDragLocked()) return;
                    setSelectedProjectId(proj.projectId);
                  }}
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
      {(settings.saveError || reorderError) && (
        <View style={styles.conflictBanner}>
          <Text style={styles.conflictText}>
            {reorderError ? `保存失败：${reorderError}` : `保存冲突或错误：${settings.saveError}`}
          </Text>
          <Pressable
            onPress={() => {
              setReorderError(null);
              settings.reload();
            }}
            style={styles.conflictAction}
          >
            <Text style={{ fontSize: 12, color: theme.colors.foreground }}>刷新最新数据</Text>
          </Pressable>
        </View>
      )}

      {/* Main Board Lanes */}
      <View style={styles.lanesWrapper}>
        <ScrollView
          ref={drag.bindContainerRef}
          horizontal
          style={styles.lanesContainer}
          contentContainerStyle={styles.lanesContent}
          onLayout={(e) => drag.handleContainerLayout(e.nativeEvent.layout)}
          onScroll={(e) => drag.handleContainerScroll(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
        >
          {board.lanes.map((lane) => {
            const laneTasks = filteredTasks.filter((t) => t.laneId === lane.id);
            return (
              <KanbanLaneView
                key={lane.id}
                lane={lane}
                tasks={laneTasks}
                projects={projects}
                theme={theme}
                layout={layout}
                dragBinding={drag.bindLane(lane.id)}
                onAddTask={(laneId) => {
                  if (drag.isDragLocked() || !board) return;
                  setActiveTaskSession(
                    openTaskSession({
                      mode: "create",
                      baseBoard: board,
                      baseRevision: revision,
                      save: (b, r) => settings.save(b, r),
                      defaultLaneId: laneId,
                      defaultProjectId:
                        selectedProjectId === "all" || selectedProjectId === "unassigned"
                          ? null
                          : selectedProjectId,
                    })
                  );
                }}
                onManageLane={(laneId) => {
                  if (drag.isDragLocked() || !board) return;
                  setActiveLaneSession(
                    openLaneSession({
                      mode: "edit",
                      laneId,
                      baseBoard: board,
                      baseRevision: revision,
                      save: (b, r) => settings.save(b, r),
                    })
                  );
                }}
                onSelectTask={(task) => {
                  if (drag.isDragLocked() || !board) return;
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
              />
            );
          })}
        </ScrollView>

        <KanbanDragOverlay
          drag={drag}
          theme={theme}
          layout={layout}
        />
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
